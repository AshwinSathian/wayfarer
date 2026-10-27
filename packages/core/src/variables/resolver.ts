import { newId } from "../id";
import type { Row } from "../model/request";
import { SECRET_REFERENCE, variablesByName } from "../model/variables";

/**
 * Where a variable's value comes from, nearest first: a nearer scope hides a
 * farther one. `folder` is the rows of every folder a request is in, the
 * outermost folder's first: a later row wins, so the nearest folder does.
 */
export const VARIABLE_SCOPES = ["local", "data", "environment", "folder", "collection", "global"] as const;
export type VariableScope = (typeof VARIABLE_SCOPES)[number];

/** The rows of each scope that has any. */
export type ScopeStack = Partial<Record<VariableScope, Row[]>>;

/** How many variables a value may pass through before it is text. */
export const MAX_VARIABLE_DEPTH = 10;

/**
 * Two braces, anything but a brace, two braces: Postman takes any name
 * (`{{fo/o}}`, `{{a b}}`). The spaces around a name are not part of it.
 * Nothing after the class can match what the class matches, so a text of
 * many braces is read in one pass.
 */
const PLACEHOLDER = /{{([^{}]*)}}/g;
/**
 * A name of letters, digits, `_`, `.` and `-`: what the app has always read
 * as a variable. Such a name with no value is missing, and the composer
 * asks for it. Anything else between braces is a variable only when one has
 * that name: a body may hold another language's templates
 * (`{{ user.name | upper }}`), and nothing should ask for those.
 */
const PLAIN_NAME = /^\$?[\w.-]+$/;
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
        : `Variables are nested more than ${MAX_VARIABLE_DEPTH} deep: ${path}.`,
    );
  }
}

export type VariableSource = VariableScope | "dynamic" | "secret" | "missing";

/** One `{{name}}` of a request, for display: where its value comes from and, when it is fixed and not secret, the value. */
export interface VariableToken {
  key: string;
  value?: string;
  source: VariableSource;
  location: "url" | "header" | "body" | "auth";
  field: string;
  /** Set when the variable cannot be resolved (see `VariableNestingError`). */
  error?: string;
  /** Its value is a vault secret's reference: the value is not given, and is sent from the vault. */
  vaulted?: true;
}

/**
 * Replaces `{{name}}` in text with the variable's value.
 *
 * - A name is looked up in the scopes nearest first; within a scope a later
 *   enabled row wins. Only names the rows hold are found: `{{constructor}}`
 *   is not a variable. A name may hold any character but a brace.
 * - A value may itself hold `{{names}}`; they are resolved too.
 * - `{{$guid}}` and the other dynamic variables give a new value each use.
 * - `{{$secret.<id>}}` is asked of `secret`. Its plaintext is recorded in
 *   `taint` and is used as it is: a secret that reads `{{token}}` is that text.
 *   The variable that held the reference is recorded in `vaulted`.
 * - What has no value stays as written, and is listed in `unresolved` or
 *   `lockedSecrets`.
 *
 * One resolver is used for every text of one request, so the four sets
 * describe the whole request.
 */
export class VariableResolver {
  /** The plaintext of every secret placed into a text. */
  readonly taint = new Set<string>();
  /** Names with no value in any scope. */
  readonly unresolved = new Set<string>();
  /** Ids of secrets that were referenced and not given. */
  readonly lockedSecrets = new Set<string>();
  /**
   * Each variable whose value was a secret that was given, by name, with the
   * scope it was found in. A reference written into a text itself is named
   * as written, with no scope.
   */
  readonly vaulted = new Map<string, VariableScope | undefined>();

  private readonly scopes: [VariableScope, Map<string, string>][];

  constructor(
    stack: ScopeStack,
    private readonly secret: (id: string) => string | undefined = () => undefined,
  ) {
    this.scopes = VARIABLE_SCOPES.map((scope) => [scope, variablesByName(stack[scope] ?? [])]);
  }

  /** `text` with its variables replaced. Throws `VariableNestingError`. */
  resolve(text: string): string {
    return this.expand(text, []);
  }

  /** The distinct variables of the given texts of a request, each with its source and value. */
  tokens(payload: {
    url?: string;
    headers?: { key: string; value: string }[];
    body?: string[];
    auth?: string[];
  }): VariableToken[] {
    const header = (payload.headers ?? []).flatMap((row, index) => [
      ...this.tokensOf(row.key, "header", `header-${index}-key`),
      ...this.tokensOf(row.value, "header", `header-${index}-value`),
    ]);
    const body = (payload.body ?? []).flatMap((text, index) => this.tokensOf(text, "body", `body-${index}`));
    const auth = (payload.auth ?? []).flatMap((text, index) => this.tokensOf(text, "auth", `auth-${index}`));
    return [...this.tokensOf(payload.url ?? "", "url", "endpoint"), ...header, ...body, ...auth];
  }

  private tokensOf(text: string, location: VariableToken["location"], field: string): VariableToken[] {
    const names = new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1].trim()));
    return [...names]
      .filter((key) => PLAIN_NAME.test(key) || this.find(key))
      .map((key) => ({ key, ...this.describe(key), location, field }));
  }

  private describe(name: string): Pick<VariableToken, "value" | "source" | "error" | "vaulted"> {
    if (name.startsWith(SECRET_PREFIX)) return { source: "secret" };
    if (DYNAMIC.has(name)) return { source: "dynamic" };
    const found = this.find(name);
    if (!found) return { source: "missing" };
    if (SECRET_REFERENCE.test(found.value)) return { source: found.scope, vaulted: true };
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
    return text.replace(PLACEHOLDER, (written: string, inside: string) => {
      const name = inside.trim();
      if (name.startsWith(SECRET_PREFIX)) {
        const id = name.slice(SECRET_PREFIX.length);
        const plaintext = this.secret(id);
        if (plaintext === undefined) {
          this.lockedSecrets.add(id);
          return written;
        }
        this.taint.add(plaintext);
        const holder = chain.at(-1);
        this.vaulted.set(holder ?? written, holder === undefined ? undefined : this.find(holder)?.scope);
        return plaintext;
      }
      const dynamic = DYNAMIC.get(name);
      if (dynamic) return dynamic();
      const found = this.find(name);
      if (!found) {
        if (PLAIN_NAME.test(name)) this.unresolved.add(name);
        return written;
      }
      if (chain.includes(name) || chain.length >= MAX_VARIABLE_DEPTH) {
        throw new VariableNestingError([...chain, name]);
      }
      return this.expand(found.value, [...chain, name]);
    });
  }
}
