import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import {
  META_GLOBALS_KEY,
  META_STATE_KEY,
  META_VAULT_KEY,
  VAULT_FILE_FORMAT,
  parseJson,
  runFailed,
  scriptsOf,
  unwrapDek,
  validateVaultFile,
  validateWorkspaceFile,
  type Collection,
  type CollectionExport,
  type EnvironmentDoc,
  type Folder,
  type RequestDoc,
  type Row,
  type RunReport,
  type RunResult,
  type VaultFile,
  type VaultRecord,
} from "@wayfarer/core";
import { parseDataFile } from "@wayfarer/core/data-file";
import { importText } from "@wayfarer/core/import";
import { junitXml, runReportJson } from "@wayfarer/core/run-report";
import { runCollection, type OpenVault, type RunInput } from "./run";

declare const VERSION: string;

const USAGE = `Usage: wayfarer-cli run <file> [options]

Runs a collection as Wayfarer's runner does, and exits with 1 when a test
fails or a request gets no response.

<file>  A Wayfarer collection, a Wayfarer workspace backup, or a Postman
        collection (v2.0 or v2.1). An Insomnia export or an OpenAPI
        description is read as the app imports it.

Options:
  -e, --environment <file>  The variables: a Wayfarer environments file or a
                            Postman environment. A workspace backup brings
                            its active environment unless one is given.
  -d, --data <file>         A data file, CSV or JSON: one iteration per row.
  -n, --iterations <n>      How many iterations (default: one per row of the
                            data file, or 1).
      --collection <name>   Which collection of a file that holds several.
      --reporter <list>     cli, json, junit, comma-separated (default cli).
                            json writes wayfarer-run.json and junit writes
                            wayfarer-run.junit.xml, in --out.
      --out <dir>           Where the reports are written (default: here).
      --bail                Stop at the first failure.
      --timeout <ms>        Give up on a request after this long (default: no
                            limit).
      --insecure            Do not verify servers' TLS certificates.
      --allow-scripts       Run the file's scripts. A file's scripts are not
                            reviewed, so a collection that has any is not run
                            without it.
      --vault-file <file>   A vault file (the app's Export vault) for the
                            requests that use a vault secret. The passphrase
                            is read from WAYFARER_VAULT_PASSPHRASE.
  -v, --version
  -h, --help

Exit codes: 0 every request answered and every test passed; 1 a test failed
or a request got no response; 2 nothing was run (see the message).`;

/** A reason not to run, said on stderr: exit code 2. */
class Refusal extends Error {}

async function readText(file: string, what: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    throw new Refusal(`The ${what} ${file} could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function pick<T extends { name: string }>(list: T[], name: string | undefined, what: string, file: string): T {
  if (name !== undefined) {
    const found = list.find((entry) => entry.name === name);
    if (!found) throw new Refusal(`${file} has no ${what} named "${name}". It has: ${list.map((entry) => `"${entry.name}"`).join(", ")}.`);
    return found;
  }
  if (list.length > 1) throw new Refusal(`${file} holds ${list.length} ${what}s: name one with --${what} (${list.map((entry) => `"${entry.name}"`).join(", ")}).`);
  const [only] = list;
  if (!only) throw new Refusal(`${file} holds no ${what}.`);
  return only;
}

async function openVault(record: VaultRecord, secrets: VaultFile["secrets"], file: string): Promise<OpenVault> {
  const passphrase = process.env["WAYFARER_VAULT_PASSPHRASE"];
  if (passphrase === undefined) throw new Refusal(`${file} holds a vault: set WAYFARER_VAULT_PASSPHRASE to its passphrase.`);
  const dek = await unwrapDek(record, passphrase);
  if (!dek) throw new Refusal(`WAYFARER_VAULT_PASSPHRASE is not the passphrase of the vault in ${file}.`);
  return { dek, secrets: new Map(secrets.map((secret) => [secret.id, secret.envelope])) };
}

/** What the file to run holds: one collection, and from a workspace backup its environment, globals and vault. */
async function readSource(file: string, collection: string | undefined): Promise<Pick<RunInput, "source" | "environment" | "globals" | "vault">> {
  const text = await readText(file, "file");
  const parsed = parseJson(text);
  const id = parsed.ok && typeof parsed.value === "object" && parsed.value !== null && "$id" in parsed.value ? String(parsed.value.$id) : "";
  if (id !== "wayfarer/workspace" && !id.startsWith("wayfarer/workspace/")) {
    try {
      const { collections } = importText(text);
      return { source: pick(collections.map(({ payload }) => ({ name: payload.collection.name, payload })), collection, "collection", file).payload, globals: [] };
    } catch (error) {
      if (error instanceof Error && error.name === "ImportError") throw new Refusal(`${file}: ${error.message}`);
      throw error;
    }
  }
  const errors = validateWorkspaceFile(parsed.ok ? parsed.value : undefined);
  if (errors.length) throw new Refusal(`${file} is not a workspace backup this version reads:\n  ${errors.join("\n  ")}`);
  const { stores } = (parsed.ok ? parsed.value : {}) as { stores: { collections: Collection[]; folders: Folder[]; requests: RequestDoc[]; environments: EnvironmentDoc[]; secrets: VaultFile["secrets"]; meta: Record<string, unknown>[] } };
  const chosen = pick(stores.collections, collection, "collection", file);
  const source: CollectionExport = {
    $id: "wayfarer/collection",
    meta: chosen.meta,
    collection: chosen,
    folders: stores.folders.filter((folder) => folder.collectionId === chosen.meta.id),
    requests: stores.requests.filter((request) => request.collectionId === chosen.meta.id),
  };
  const meta = (key: string) => stores.meta.find((record) => record["key"] === key);
  const active = meta(META_STATE_KEY)?.["activeEnvironmentId"];
  const environment = stores.environments.find((entry) => entry.meta.id === active);
  const vault = meta(META_VAULT_KEY) as (VaultRecord & { key: string }) | undefined;
  return {
    source,
    ...(environment && { environment: { name: environment.name, vars: environment.vars } }),
    globals: (meta(META_GLOBALS_KEY)?.["variables"] as Row[] | undefined) ?? [],
    // A backup's secrets are useful only with the passphrase: without one, a request that needs a secret says so.
    ...(vault && process.env["WAYFARER_VAULT_PASSPHRASE"] !== undefined && { vault: await openVault(vault, stores.secrets, file) }),
  };
}

async function readEnvironment(file: string): Promise<{ name: string; vars: Row[] }> {
  try {
    const { environments } = importText(await readText(file, "environment"));
    const { name, vars } = pick(environments, undefined, "environment", file);
    return { name, vars };
  } catch (error) {
    if (error instanceof Error && error.name === "ImportError") throw new Refusal(`${file}: ${error.message}`);
    throw error;
  }
}

async function readVaultFile(file: string): Promise<OpenVault> {
  const parsed = parseJson(await readText(file, "vault file"));
  const issues = parsed.ok ? validateVaultFile(parsed.value) : [{ path: "", message: "not JSON" }];
  if (issues.length) throw new Refusal(`${file} is not a vault file ("$id": "${VAULT_FILE_FORMAT}"): ${issues.map((issue) => `${issue.path} ${issue.message}`.trim()).join("; ")}`);
  const { vault, secrets } = (parsed.ok ? parsed.value : {}) as VaultFile;
  return openVault(vault, secrets, file);
}

/** Where the collection's scripts are, by name. */
function scriptHolders(source: CollectionExport): string[] {
  return [
    ...(scriptsOf(source.collection).length ? [`the collection "${source.collection.name}"`] : []),
    ...source.folders.filter((folder) => scriptsOf(folder).length).map((folder) => `the folder "${folder.name}"`),
    ...source.requests.filter((request) => scriptsOf(request).length).map((request) => `the request "${request.name}"`),
  ];
}

function line(result: RunResult, iterations: number): string {
  const mark = runFailed(result) ? "✗" : result.skipped ? "-" : "✓";
  const where = iterations > 1 ? ` (iteration ${result.iteration + 1})` : "";
  const status = result.skipped ? "skipped" : result.status ? `${result.status} ${result.statusText ?? ""}`.trim() : "no response";
  const tests = result.tests.map((test) => `\n    ${test.passed ? "✓" : "✗"} ${test.name}${test.error ? `: ${test.error}` : ""}`).join("");
  const error = result.error !== undefined ? `\n    ${result.error}` : "";
  return `${mark} ${result.name}${where}: ${status}${result.durationMs !== undefined ? `, ${result.durationMs} ms` : ""}${tests}${error}`;
}

function summary(report: RunReport): string {
  const tests = report.results.flatMap((result) => result.tests);
  const failed = report.results.filter(runFailed).length;
  const ended = { completed: "", cancelled: " The run was cancelled.", failed: " The run stopped at the first failure.", ended: ` The run ended: ${report.reason ?? ""}` }[report.ended];
  return `${report.results.length} results in ${report.iterations} iteration${report.iterations === 1 ? "" : "s"}; ${failed} failed; ${tests.filter((test) => test.passed).length} of ${tests.length} tests passed.${ended}`;
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      environment: { type: "string", short: "e" },
      data: { type: "string", short: "d" },
      iterations: { type: "string", short: "n" },
      collection: { type: "string" },
      reporter: { type: "string", default: "cli" },
      out: { type: "string", default: "." },
      bail: { type: "boolean", default: false },
      timeout: { type: "string" },
      insecure: { type: "boolean", default: false },
      "allow-scripts": { type: "boolean", default: false },
      "vault-file": { type: "string" },
      version: { type: "boolean", short: "v" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.version) {
    console.log(VERSION);
    return 0;
  }
  const [command, file, ...rest] = positionals;
  if (values.help || command === undefined) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }
  if (command !== "run" || file === undefined || rest.length) throw new Refusal(`Unknown command or arguments: ${positionals.join(" ")}\n\n${USAGE}`);

  const reporters = new Set(values.reporter.split(",").map((name) => name.trim()));
  for (const name of reporters) if (!["cli", "json", "junit"].includes(name)) throw new Refusal(`Unknown reporter "${name}": choose from cli, json and junit.`);
  const number = (text: string | undefined, flag: string): number | undefined => {
    if (text === undefined) return undefined;
    if (!/^\d+$/.test(text)) throw new Refusal(`--${flag} takes a whole number, not "${text}".`);
    return Number(text);
  };
  const iterations = number(values.iterations, "iterations");
  if (iterations === 0) throw new Refusal("--iterations takes 1 or more.");
  const timeoutMs = number(values.timeout, "timeout") ?? 0;

  const read = await readSource(file, values.collection);
  const holders = scriptHolders(read.source);
  if (holders.length && !values["allow-scripts"]) {
    throw new Refusal(`This collection has scripts, in ${holders.join(", ")}. A file's scripts have not been reviewed: read them, and run again with --allow-scripts only if you trust them. Nothing was sent.`);
  }
  const environment = values.environment === undefined ? read.environment : await readEnvironment(values.environment);
  const vault = values["vault-file"] === undefined ? read.vault : await readVaultFile(values["vault-file"]);
  let data: Row[][] | undefined;
  if (values.data !== undefined) {
    try {
      data = parseDataFile(await readText(values.data, "data file"), basename(values.data));
    } catch (error) {
      if (error instanceof Error && error.name === "DataFileError") throw new Refusal(`${values.data}: ${error.message}`);
      throw error;
    }
  }
  // Node reads this when it makes a connection: every request of the run is the user's, and Node says on stderr that verification is off.
  if (values.insecure) process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

  const startedAt = new Date().toISOString();
  // Before anything is sent: a folder that cannot be made stops the run while nothing has been run.
  if (reporters.has("json") || reporters.has("junit")) {
    await mkdir(values.out, { recursive: true }).catch((error: unknown) => {
      throw new Refusal(`--out ${values.out}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
  const report = await runCollection(
    { source: read.source, ...(environment && { environment }), globals: read.globals, ...(vault && { vault }), allowScripts: values["allow-scripts"], timeoutMs },
    {
      ...(iterations !== undefined && { iterations }),
      ...(data && { data }),
      stopOnFailure: values.bail,
      onResult: (result) => {
        if (reporters.has("cli")) console.log(line(result, iterations ?? data?.length ?? 1));
      },
    }
  );
  const info = { name: read.source.collection.name, startedAt };
  if (reporters.has("cli")) console.log(`\n${summary(report)}`);
  if (reporters.has("json")) await writeFile(join(values.out, "wayfarer-run.json"), `${JSON.stringify(runReportJson(report, info), null, 2)}\n`);
  if (reporters.has("junit")) await writeFile(join(values.out, "wayfarer-run.junit.xml"), junitXml(report, info));
  return report.results.some(runFailed) ? 1 : 0;
}

main(process.argv.slice(2)).then(
  (code) => (process.exitCode = code),
  (error: unknown) => {
    if (error instanceof Refusal || (error instanceof TypeError && "code" in error && String(error.code).startsWith("ERR_PARSE_ARGS"))) {
      console.error(error.message);
      process.exitCode = 2;
      return;
    }
    console.error(error);
    process.exitCode = 2;
  }
);
