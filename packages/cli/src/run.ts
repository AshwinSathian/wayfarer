import variant from "@jitl/quickjs-wasmfile-release-sync";
import { newQuickJSWASMModuleFromVariant, newVariant, type QuickJSWASMModule } from "quickjs-emscripten-core";
import {
  FetchTransport,
  SCRIPT_LIMITS,
  SendBlockedError,
  ancestorsOf,
  applyVariableChanges,
  buildRequest,
  decryptSecret,
  exchange,
  folderChain,
  loadLibraries,
  requestsInOrder,
  runOutcome,
  runRequests,
  runScript,
  scriptMemory,
  scriptResponse,
  type CollectionExport,
  type ExchangePorts,
  type RequestDoc,
  type Row,
  type RunIteration,
  type RunOptions,
  type RunReport,
  type ScopeStack,
  type SecretEnvelope,
  type VaultKey,
} from "@wayfarer/core";
import { loadLibrary } from "@wayfarer/core/library-loader";

/** A vault that was opened with its passphrase: its data key, and each secret still encrypted. */
export interface OpenVault {
  dek: VaultKey;
  secrets: Map<string, SecretEnvelope>;
}

/** What one run is given: the collection, the variables it starts with, and how to send. */
export interface RunInput {
  source: CollectionExport;
  environment?: { name: string; vars: Row[] };
  globals: Row[];
  vault?: OpenVault;
  /** The user said the file's scripts may run (`--allow-scripts`). */
  allowScripts: boolean;
  /** 0 is none. */
  timeoutMs: number;
}

/**
 * The QuickJS engine, loaded with the memory that is its limit (F66): the
 * engine's own limit does not hold in WebAssembly. After a run that hit a
 * limit the engine may be unusable, and the next script gets a new one.
 */
function engines(): () => Promise<QuickJSWASMModule> {
  let engine: Promise<QuickJSWASMModule> | undefined;
  // This package has no types for WebAssembly (no DOM, no worker), as core's has none.
  const { Memory } = (
    globalThis as unknown as {
      WebAssembly: { Memory: new (size: { initial: number; maximum: number }) => WebAssemblyMemory };
    }
  ).WebAssembly;
  return () =>
    (engine ??= newQuickJSWASMModuleFromVariant(newVariant(variant, { wasmMemory: new Memory(scriptMemory()) })));
}

type WebAssemblyMemory = NonNullable<Parameters<typeof newVariant>[1]["wasmMemory"]>;

/**
 * Runs `input.source` as the app's runner does (`runRequests`), each request
 * through `exchange`, the road a send in the app takes. What differs is
 * where things are kept: the variables a script sets are kept for this run
 * only, the vault is read from a file, and every request goes direct (P6.5:
 * Node has no CORS to get around, and no one is there to answer D7's or
 * C-053's question, so C-053's answer is no).
 */
export async function runCollection(input: RunInput, options: RunOptions): Promise<RunReport> {
  const { source } = input;
  let environment = input.environment && { ...input.environment };
  let globals = input.globals;
  let collectionVariables = source.collection.variables;
  /** The plaintext of each secret read, and of each a script set: the file is never written. */
  const plaintext = new Map<string, string>();
  const vault = input.vault;
  const readSecret = async (id: string): Promise<string | null> => {
    const known = plaintext.get(id);
    if (known !== undefined) return known;
    const envelope = vault?.secrets.get(id);
    if (!vault || !envelope) return null;
    const value = await decryptSecret(vault.dek, id, envelope);
    plaintext.set(id, value);
    return value;
  };

  let engine = engines();
  const libraries = new Map<string, string>();
  const transport = new FetchTransport();
  const ports: ExchangePorts = {
    runScript: async (script, env, response, { send, ...extras }) => {
      const result = await runScript(
        await engine(),
        script,
        { ...extras, environment: env, ...(response && { response: scriptResponse(response) }) },
        SCRIPT_LIMITS,
        {
          libraries: await loadLibraries(script, loadLibrary, libraries),
          ...(send && { send }),
        },
      );
      if (result.limit) engine = engines();
      return result;
    },
    transport: {
      send: (request, transportOptions, policy) => {
        policy.took = "direct";
        return transport.send(request, transportOptions);
      },
      route: () => "direct",
      first: () => "direct",
    },
    environment: () =>
      environment && {
        name: environment.name,
        vars: environment.vars,
        change: (changes) =>
          Promise.resolve(
            environment && (environment = { ...environment, vars: applyVariableChanges(environment.vars, changes) }),
          ),
      },
    globals: () => globals,
    changeGlobals: (changes) => Promise.resolve((globals = applyVariableChanges(globals, changes))),
    vault: {
      isUnlocked: () => vault !== undefined,
      readSecret,
      replaceSecret: async (id, value) => {
        if ((await readSecret(id)) === null) return false;
        plaintext.set(id, value);
        return true;
      },
    },
    timeoutMs: () => input.timeoutMs,
    historyBodies: () => false,
  };

  const docs = requestsInOrder(source);
  // C-053 in a run compares each request with the variables as they were when the run started.
  const baseline: ScopeStack = { environment: environment?.vars, collection: collectionVariables, global: globals };
  const acceptedHosts = new Set<string>();

  const send = async (doc: RequestDoc, iteration: RunIteration, signal: AbortSignal) => {
    const ancestors = ancestorsOf(source.collection, source.folders, doc.folderId);
    const folder = folderChain(source.folders, doc.folderId).flatMap((entry) => entry.variables);
    const scopes = (): ScopeStack => ({
      environment: environment?.vars,
      folder,
      collection: collectionVariables,
      global: globals,
      data: iteration.data,
    });
    const { outcome } = await runOutcome(
      () =>
        exchange(
          {
            runScripts: input.allowScripts,
            preRequestScript: doc.scripts.pre,
            postRequestScript: doc.scripts.post,
            tests: doc.tests,
            template: doc,
            buildRequest: (request) =>
              buildRequest(request, {
                scopes,
                ancestors,
                readSecrets: async (ids) => {
                  if (!vault)
                    throw new SendBlockedError(
                      "This request uses a vault secret, and the run has no vault: give --vault-file, or run a workspace backup, with the passphrase in WAYFARER_VAULT_PASSPHRASE. Nothing was sent.",
                    );
                  const found = new Map<string, string>();
                  for (const id of ids) {
                    const value = await readSecret(id);
                    if (value !== null) found.set(id, value);
                  }
                  return found;
                },
                readFile: (ref) =>
                  Promise.reject(
                    new SendBlockedError(
                      `The file "${ref.fileName}" of this request's body is kept in the browser that picked it, not in the file run here. Nothing was sent.`,
                    ),
                  ),
                blockUnresolved: true,
                composed: {
                  url: doc.url,
                  scopes: { ...baseline, folder, data: iteration.data },
                  accepted: acceptedHosts,
                },
              }),
            info: { requestName: doc.name, requestId: doc.id },
            collection: {
              variables: () => collectionVariables,
              change: (changes) =>
                Promise.resolve((collectionVariables = applyVariableChanges(collectionVariables, changes))),
            },
            inherited: ancestors,
            folderVariables: () => folder,
            signal,
            route: "direct",
            iteration,
          },
          ports,
        ),
      "A script moved a request that uses a vault secret to another host, and a run from the command line has no one to say yes.",
    );
    return outcome;
  };

  return runRequests(
    docs.map((doc) => ({ id: doc.id, name: doc.name })),
    (request, iteration, signal) => {
      // By its place: a request of the run is one of `docs`.
      const doc = docs.find((entry) => entry.id === request.id) ?? docs[0];
      return send(doc, iteration, signal);
    },
    options,
  );
}
