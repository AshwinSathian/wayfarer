import type { Ancestor } from "../model/collection";
import { variablesByName } from "../model/variables";
import {
  VARIABLE_SCOPES,
  VariableNestingError,
  VariableResolver,
  type ScopeStack,
  type VariableScope,
  type VariableSource,
  type VariableToken,
} from "../variables/resolver";
import { normalizeUrl } from "./build";

/** One variable of a request before it is sent, as the preview shows it (D4.12, DQ8). */
export interface PreviewVariable {
  name: string;
  source: VariableSource;
  /** Who holds the scope it comes from: `environment "Local"`, `collection "Shop"`, `folder "Pets"`. */
  holder?: string;
  /** Its value, when it is fixed and not a vault secret. */
  value?: string;
  /** Its value is a vault secret: not read here, and shown masked. */
  vaulted?: true;
  /** Variables that refer to each other in a circle. */
  error?: string;
  /** The farther scopes that hold the same name, hidden by this one, by their holders. */
  shadows: string[];
}

/** How a scope's holder is named: the environment's name, and the collection and its folders as `ancestorsOf` names them. */
export interface PreviewHolders {
  environment?: string;
  /** The collection, then its folders from the outside in. */
  ancestors: Ancestor[];
}

const SCOPE_WORDS: Record<VariableScope, string> = {
  local: "a script of this send",
  data: "the run's data file",
  environment: "the environment",
  folder: "a folder",
  collection: "the collection",
  global: "the globals",
};

/** Who holds `name` in `scope`: the nearest folder that sets it, for a folder. */
function holderOf(scope: VariableScope, name: string, holders: PreviewHolders): string {
  if (scope === "environment" && holders.environment !== undefined) return `environment "${holders.environment}"`;
  const [collection, ...folders] = holders.ancestors;
  if (scope === "collection" && collection) return collection.name;
  if (scope === "folder") {
    const folder = [...folders].reverse().find((held) => variablesByName(held.variables).has(name));
    if (folder) return folder.name;
  }
  return SCOPE_WORDS[scope];
}

/**
 * Each distinct variable of `tokens` with where its value comes from and
 * what it hides. The vault is not read: a secret's value is not here.
 */
export function previewVariables(
  tokens: readonly VariableToken[],
  scopes: ScopeStack,
  holders: PreviewHolders,
): PreviewVariable[] {
  const seen = new Set<string>();
  const out: PreviewVariable[] = [];
  for (const token of tokens) {
    if (seen.has(token.key)) continue;
    seen.add(token.key);
    const scoped = (VARIABLE_SCOPES as readonly string[]).includes(token.source)
      ? (token.source as VariableScope)
      : undefined;
    const farther = scoped ? VARIABLE_SCOPES.slice(VARIABLE_SCOPES.indexOf(scoped) + 1) : [];
    out.push({
      name: token.key,
      source: token.source,
      ...(scoped && { holder: holderOf(scoped, token.key, holders) }),
      ...(token.value !== undefined && { value: token.value }),
      ...(token.vaulted && { vaulted: true as const }),
      ...(token.error !== undefined && { error: token.error }),
      shadows: farther
        .filter((scope) => variablesByName(scopes[scope] ?? []).has(token.key))
        .map((scope) => holderOf(scope, token.key, holders)),
    });
  }
  return out;
}

/**
 * The address as it would be sent, the vault not read: each vault secret is
 * ***. Variables in a circle leave it as typed.
 */
export function previewAddress(url: string, scopes: ScopeStack): string {
  try {
    return normalizeUrl(new VariableResolver(scopes, () => "***").resolve(url.trim()));
  } catch (error) {
    if (!(error instanceof VariableNestingError)) throw error;
    return url.trim();
  }
}
