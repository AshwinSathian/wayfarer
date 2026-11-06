import { credentialsOf } from "../auth/request-auth";
import type { CollectionExport } from "../model/collection";
import { protectedSecretId } from "../model/variables";
import { MASK } from "../redact/redactor";
import { scriptsOf } from "../scripting/trust";

/**
 * One line of an import report from the receiver's side (`receive.md`, "What every way shows before it stores"):
 * `text`, then `names` (variables' names, monospace and in a list), then `after`. Empty `names` and `after` are not
 * drawn.
 */
export interface ReceiverLine {
  kind: "secrets-missing" | "secrets-unknown" | "secrets-yours" | "credentials" | "scripts";
  text: string;
  names: string[];
  after: string;
}

/**
 * What a collection needs of the person receiving it, before anything is stored: the vault secrets its protected
 * variables name, the credentials its sender's share masked, and the scripts that came with it. In that order; the
 * hosts follow, from `collectionHosts`.
 *
 * A protected variable (its value one `{{$secret.<id>}}` reference) is matched by its name against `vaultNames`, the
 * names of this vault's secrets: names only, no value is read. `null` is a vault whose names could not be read: the
 * line says what is needed and not which of it the person has.
 */
export function receiverLines(
  { collection, folders, requests }: CollectionExport,
  vaultNames: readonly string[] | null,
): ReceiverLine[] {
  const holders = [collection, ...folders];
  const needed = [
    ...new Set(
      holders.flatMap((holder) =>
        holder.variables.filter((row) => protectedSecretId(row.value)).map((row) => row.key.trim()),
      ),
    ),
  ];
  const lines: ReceiverLine[] = [];
  if (vaultNames === null) {
    if (needed.length) lines.push(secretsLine("secrets-unknown", `Needs ${count(needed.length, "secret")}:`, needed));
  } else {
    const have = new Set(vaultNames.map((name) => name.trim()));
    const missing = needed.filter((name) => !have.has(name));
    const yours = needed.filter((name) => have.has(name));
    if (missing.length) {
      lines.push(secretsLine("secrets-missing", `Needs ${count(missing.length, "secret")} you do not have:`, missing));
    }
    if (yours.length) {
      lines.push({
        kind: "secrets-yours",
        text: `Uses your ${noun(yours.length, "secret")}:`,
        names: yours,
        after: "",
      });
    }
  }
  const masked = [...holders, ...requests].flatMap((holder) => credentialsOf(holder.auth)).filter((v) => v === MASK);
  if (masked.length) {
    const were = masked.length === 1 ? "was" : "were";
    const are = masked.length === 1 ? "is" : "are";
    lines.push({
      kind: "credentials",
      text: `${count(masked.length, "credential")} ${were} not shared and ${are} ${MASK}. Type yours in Auth.`,
      names: [],
      after: "",
    });
  }
  const scripts = [...holders, ...requests].flatMap((holder) => scriptsOf(holder)).length;
  if (scripts) {
    const one = scripts === 1;
    lines.push({
      kind: "scripts",
      text: `${count(scripts, "script")} came with it. ${one ? "It does" : "They do"} not run until you read ${one ? "it" : "them"} and trust ${one ? "it" : "them"}.`,
      names: [],
      after: "",
    });
  }
  return lines;
}

/** A line's words as one sentence, for a live region: the names joined into it. */
export function receiverLineText(line: ReceiverLine): string {
  return [line.text, line.names.join(", ") + (line.names.length ? "." : ""), line.after].filter(Boolean).join(" ");
}

function secretsLine(kind: ReceiverLine["kind"], text: string, names: string[]): ReceiverLine {
  const one = names.length === 1;
  return {
    kind,
    text,
    names,
    after: `Requests that use ${one ? "it" : "them"} ask for ${one ? "it" : "them"} when you send them.`,
  };
}

function noun(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

function count(n: number, word: string): string {
  return `${n} ${noun(n, word)}`;
}
