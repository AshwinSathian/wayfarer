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
  kind: "secrets-missing" | "secrets-same-name" | "secrets-unknown" | "secrets-yours" | "credentials" | "scripts";
  text: string;
  names: string[];
  after: string;
}

/** A secret of this vault as the report reads it: its id and its name, never its value. */
export interface VaultSecretName {
  id: string;
  name: string;
}

/**
 * What a collection needs of the person receiving it, before anything is stored: the vault secrets its protected
 * variables refer to, the credentials its sender's share masked, and the scripts that came with it. In that order; the
 * hosts follow, from `collectionHosts`.
 *
 * A protected variable (its value one `{{$secret.<id>}}` reference) is sent with the secret of that id, and with no
 * other: a send reads the vault by id, and a reference this vault has no secret for is refused by the wire check
 * (C-007, "This request refers to a vault secret that could not be read…"). So a variable is "yours" only when
 * `vault` has its id (the person's own collection, back); a secret of the same name is said as that, and does not
 * make the variable work. `vault` is this vault's secrets' ids and names, readable while it is locked; `null` is a
 * vault that could not be read: the line says what is needed and not which of it the person has.
 */
export function receiverLines(
  { collection, folders, requests }: CollectionExport,
  vault: readonly VaultSecretName[] | null,
): ReceiverLine[] {
  const holders = [collection, ...folders];
  const protectedRows = holders.flatMap((holder) =>
    holder.variables.flatMap((row) => {
      const id = protectedSecretId(row.value);
      return id ? [{ id, name: row.key.trim() }] : [];
    }),
  );
  const names = (rows: { name: string }[]) => [...new Set(rows.map((row) => row.name))];
  const lines: ReceiverLine[] = [];
  if (vault === null) {
    const needed = names(protectedRows);
    if (needed.length) {
      lines.push(
        secretsLine(
          "secrets-unknown",
          `Needs ${count(needed.length, "secret")}:`,
          needed,
          `If your vault does not have ${needed.length === 1 ? "it" : "them"},`,
        ),
      );
    }
  } else {
    const ids = new Set(vault.map((secret) => secret.id));
    const vaultNames = new Set(vault.map((secret) => secret.name.trim()));
    const yours = names(protectedRows.filter((row) => ids.has(row.id)));
    const others = protectedRows.filter((row) => !ids.has(row.id));
    const sameName = names(others.filter((row) => vaultNames.has(row.name)));
    const missing = names(others.filter((row) => !vaultNames.has(row.name)));
    if (missing.length) {
      lines.push(secretsLine("secrets-missing", `Needs ${count(missing.length, "secret")} you do not have:`, missing));
    }
    if (sameName.length) {
      const one = sameName.length === 1;
      lines.push(
        secretsLine(
          "secrets-same-name",
          one ? "Needs 1 of the sender's secrets:" : `Needs ${sameName.length} of the sender's secrets:`,
          sameName,
          `Your vault has ${one ? "a secret" : "secrets"} of ${one ? "that name" : "those names"}, but this collection refers to the sender's.`,
        ),
      );
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

function secretsLine(kind: ReceiverLine["kind"], text: string, names: string[], lead = ""): ReceiverLine {
  const one = names.length === 1;
  // What a send does with a reference this vault has no secret for: the wire check refuses it (C-007).
  const sent = `${one ? "a request that uses it is" : "requests that use them are"} not sent until you give the ${one ? "variable a value" : "variables values"}.`;
  const after = lead.endsWith(",")
    ? `${lead} ${sent}`
    : [lead, sent.charAt(0).toUpperCase() + sent.slice(1)].filter(Boolean).join(" ");
  return { kind, text, names, after };
}

function noun(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

function count(n: number, word: string): string {
  return `${n} ${noun(n, word)}`;
}
