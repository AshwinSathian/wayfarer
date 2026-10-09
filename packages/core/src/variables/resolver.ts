import { newId } from "../id";
import type { Row } from "../model/request";
import { variablesByName } from "../model/variables";

/** Where a variable's value comes from, nearest first: a nearer scope hides a farther one. */
export const VARIABLE_SCOPES = ["local", "data", "environment", "collection", "global"] as const;
export type VariableScope = (typeof VARIABLE_SCOPES)[number];

/** The rows of each scope that has any. */
export type ScopeStack = Partial<Record<VariableScope, Row[]>>;

/** How many variables a value may pass through before it is text. */
export const MAX_VARIABLE_DEPTH = 10;

const PLACEHOLDER = /{{\s*(\$?[\w.-]+)\s*}}/g;
const SECRET_PREFIX = "$secret.";
const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * A whole number from 0 up to, not including, `limit`, each equally likely:
 * random bits are masked to the smallest range that holds `limit` and drawn
 * again when they fall outside it. A remainder would favour the low values.
 */
function randomBelow(limit: number): number {
  const mask = 2 ** Math.ceil(Math.log2(limit)) - 1;
  const draw = new Uint32Array(1);
  do {
    crypto.getRandomValues(draw);
    draw[0] &= mask;
  } while (draw[0] >= limit);
  return draw[0];
}

/** Postman's dynamic variables that need no data set. Each use gives a new value. */
const DYNAMIC = new Map<string, () => string>([
  ["$guid", newId],
  ["$randomUUID", newId],
  ["$timestamp", () => String(Math.floor(Date.now() / 1000))],
  ["$isoTimestamp", () => new Date().toISOString()],
  ["$randomInt", () => String(randomBelow(1001))],
  ["$randomAlphaNumeric", () => ALPHANUMERIC[randomBelow(ALPHANUMERIC.length)]],
]);

/** Variables that refer to each other in a circle, or through more than `MAX_VARIABLE_DEPTH` steps. The message is user-facing. */
export class VariableNestingError extends Error {
  override readonly name = "VariableNestingError";

  /** `chain` is the names in the order they were followed; a cycle ends on the name it started from. */
  constructor(readonly chain: string[]) {
    const path = chain.map((name) => `{{${name}}}`).join(" → ");
    super(
      chain.indexOf(chain[chain.length - 1]) < chain.length - 1
        ? `Variables refer to each other in a circle: ${path}.`
        : `Variables are nested more than ${MAX_VARIABLE_DEPTH} deep: ${path}.`
    );
  }
}

export type VariableSource = VariableScope | "dynamic" | "secret" | "missing";

/** One `{{name}}` of a request, for display: where its value comes from and, when it is fixed and not secret, the value. */
export interface VariableToken {
  key: string;
  value?: string;
  source: VariableSource;
  location: "url" | "header" | "body";
  field: string;
  /** Set when the variable cannot be resolved (see `VariableNestingError`). */
  error?: string;
}

/**
 * Replaces `{{name}}` in text with the variable's value.
 *
 * - A name is looked up in the scopes nearest first; within a scope a later
 *   enabled row wins. Only names the rows hold are found: `{{constructor}}`
 *   is not a variable.
 * - A value may itself hold `{{names}}`; they are resolved too.
 * - `{{$guid}}` and the other dynamic variables give a new value each use.
 * - `{{$secret.<id>}}` is asked of `secret`. Its plaintext is recorded in
 *   `taint` and is used as it is: a secret that reads `{{token}}` is that text.
 * - What has no value stays as written, and is listed in `unresolved` or
 *   `lockedSecrets`.
 *
 * One resolver is used for every text of one request, so the three sets
 * describe the whole request.
 */
export class VariableResolver {
  /** The plaintext of every secret placed into a text. */
  readonly taint = new Set<string>();
  /** Names with no value in any scope. */
  readonly unresolved = new Set<string>();
  /** Ids of secrets that were referenced and not given. */
  readonly lockedSecrets = new Set<string>();

  private readonly scopes: [VariableScope, Map<string, string>][];

  constructor(
    stack: ScopeStack,
    private readonly secret: (id: string) => string | undefined = () => undefined
  ) {
    this.scopes = VARIABLE_SCOPES.map((scope) => [scope, variablesByName(stack[scope] ?? [])]);
  }

  /** `text` with its variables replaced. Throws `VariableNestingError`. */
  resolve(text: string): string {
    return this.expand(text, []);
  }

  /** The distinct variables of the given texts of a request, each with its source and value. */
  tokens(payload: { url?: string; headers?: { key: string; value: string }[]; body?: string[] }): VariableToken[] {
    const header = (payload.headers ?? []).flatMap((row, index) => [
      ...this.tokensOf(row.key, "header", `header-${index}-key`),
      ...this.tokensOf(row.value, "header", `header-${index}-value`),
    ]);
    const body = (payload.body ?? []).flatMap((text, index) => this.tokensOf(text, "body", `body-${index}`));
    return [...this.tokensOf(payload.url ?? "", "url", "endpoint"), ...header, ...body];
  }

  private tokensOf(text: string, location: VariableToken["location"], field: string): VariableToken[] {
    const names = new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]));
    return [...names].map((key) => ({ key, ...this.describe(key), location, field }));
  }

  private describe(name: string): Pick<VariableToken, "value" | "source" | "error"> {
    if (name.startsWith(SECRET_PREFIX)) return { source: "secret" };
    if (DYNAMIC.has(name)) return { source: "dynamic" };
    const found = this.find(name);
    if (!found) return { source: "missing" };
    try {
      return { source: found.scope, value: this.expand(found.value, [name]) };
    } catch (error) {
      if (!(error instanceof VariableNestingError)) throw error;
      return { source: found.scope, error: error.message };
    }
  }

  private find(name: string): { scope: VariableScope; value: string } | undefined {
    for (const [scope, variables] of this.scopes) {
      const value = variables.get(name);
      if (value !== undefined) return { scope, value };
    }
    return undefined;
  }

  /** `chain` is the variables whose values led to this text. */
  private expand(text: string, chain: string[]): string {
    return text.replace(PLACEHOLDER, (written: string, name: string) => {
      if (name.startsWith(SECRET_PREFIX)) {
        const id = name.slice(SECRET_PREFIX.length);
        const plaintext = this.secret(id);
        if (plaintext === undefined) {
          this.lockedSecrets.add(id);
          return written;
        }
        this.taint.add(plaintext);
        return plaintext;
      }
      const dynamic = DYNAMIC.get(name);
      if (dynamic) return dynamic();
      const found = this.find(name);
      if (!found) {
        this.unresolved.add(name);
        return written;
      }
      if (chain.includes(name) || chain.length >= MAX_VARIABLE_DEPTH) {
        throw new VariableNestingError([...chain, name]);
      }
      return this.expand(found.value, [...chain, name]);
    });
  }
}
