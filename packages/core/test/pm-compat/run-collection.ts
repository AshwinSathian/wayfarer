import type { QuickJSWASMModule } from "quickjs-emscripten-core";
import { buildAuthHeaders, buildAuthQueryParam, effectiveAuth, resolveAuth } from "../../src/auth/request-auth";
import { folderChain, type CollectionExport, type Folder } from "../../src/model/collection";
import { graphqlPayload } from "../../src/http/graphql";
import { RAW_CONTENT_TYPES, type RequestContent, type Row } from "../../src/model/request";
import { applyVariableChanges, scriptVariables } from "../../src/model/variables";
import { requestsInOrder, runRequests, type RunIteration, type RunOptions, type RunOutcome, type RunReport, type RunRequest } from "../../src/run/runner";
import { runScript, type ScriptResponse } from "../../src/scripting/host";
import { loadLibraries } from "../../src/scripting/libraries";
import { loadLibrary } from "../../src/scripting/library-loader";
import { scriptRequestOf, sentScriptRequest, withScriptRequest } from "../../src/scripting/request-view";
import { FetchTransport } from "../../src/transport/fetch";
import { VariableResolver } from "../../src/variables/resolver";

export interface RunResult {
  name: string;
  tests: { name: string; passed: boolean }[];
}

/**
 * Sends one request of a collection for a run (`runRequests`), in Node: what
 * the app's `RequestExecutor` is to a run in the app, without a vault and
 * without the trust gate. It is made of the pieces a send in the app is
 * made of, in the order `RequestExecutor.execute` has: each pre-request
 * script from the collection inward, the request built with the variables
 * they left and the auth it inherits, sent, each post-response script.
 *
 * A script that ends in an error throws, unless `tolerant`: the golden
 * files hold no such script.
 */
export function collectionSender(
  quickjs: QuickJSWASMModule,
  source: CollectionExport,
  options: { environment: Row[]; globals?: Row[]; files?: Record<string, Uint8Array>; tolerant?: boolean }
): { requests: RunRequest[]; send: (request: RunRequest, iteration?: RunIteration) => Promise<RunOutcome> } {
  const scopes = { environment: options.environment, collection: source.collection.variables, global: options.globals ?? [] };
  const libraries = new Map<string, string>();
  const docs = requestsInOrder(source);

  const send = async ({ id }: RunRequest, iteration: RunIteration = { index: 0, count: 1, data: [] }): Promise<RunOutcome> => {
    const doc = docs.find((entry) => entry.id === id);
    if (!doc) throw new Error(`The collection has no request ${id}.`);
    const folders: Folder[] = folderChain(source.folders, doc.folderId);
    const holders = [source.collection, ...folders, doc];
    const folder = folders.flatMap((entry) => entry.variables);
    const outcome: RunOutcome = { tests: [] };
    let content: RequestContent = doc;

    const run = async (script: string, eventName: "prerequest" | "test", request: Parameters<typeof runScript>[2]["request"], response?: ScriptResponse) => {
      const context = {
        environment: scriptVariables(scopes.environment),
        collection: scriptVariables(scopes.collection),
        folder: scriptVariables(folder),
        globals: scriptVariables(scopes.global),
        data: scriptVariables(iteration.data),
        request,
        response,
        info: { eventName, requestName: doc.name, requestId: doc.id, iteration: iteration.index, iterationCount: iteration.count },
      };
      const result = await runScript(quickjs, script, context, undefined, { libraries: await loadLibraries(script, loadLibrary, libraries) });
      if (result.error && !options.tolerant) throw new Error(`${doc.name} (${eventName}): ${result.error}`);
      if (result.error) outcome.error = result.error;
      scopes.environment = applyVariableChanges(scopes.environment, result.changes.environment);
      scopes.collection = applyVariableChanges(scopes.collection, result.changes.collection);
      scopes.global = applyVariableChanges(scopes.global, result.changes.global);
      outcome.tests.push(...result.testResults.map((test) => ({ name: test.label, passed: test.passed, ...(test.error !== undefined && { error: test.error }) })));
      if (result.nextRequest !== undefined) outcome.nextRequest = result.nextRequest;
      if (result.skipRequest) outcome.skipped = true;
      return result;
    };

    for (const { scripts } of holders) {
      if (!scripts.pre.trim()) continue;
      const { request } = await run(scripts.pre, "prerequest", scriptRequestOf(content));
      // As the app: a pre-request script that ended in an error did not finish its work on the request, and it is not sent.
      if (outcome.error !== undefined) return outcome;
      if (request) content = withScriptRequest(content, request);
    }
    if (outcome.skipped) return outcome;

    const resolver = new VariableResolver({ ...scopes, folder, data: iteration.data });
    const resolve = (text: string) => resolver.resolve(text);
    const auth = resolveAuth(effectiveAuth(content.auth, [source.collection, ...folders]).auth, resolve);
    const sent = sentBody(content, resolve, options.files ?? {});
    const byName = new Map<string, [string, string]>();
    for (const [key, value] of [...content.headers.filter((row) => row.enabled && row.key).map((row) => [row.key, row.value]), ...Object.entries(buildAuthHeaders(auth))]) {
      byName.set(resolve(key).toLowerCase(), [resolve(key), resolve(value)]);
    }
    if (sent?.contentType && !byName.has("content-type")) byName.set("content-type", ["Content-Type", sent.contentType]);
    const address = new URL(resolve(content.url));
    const param = buildAuthQueryParam(auth);
    if (param) address.searchParams.append(param.key, param.value);

    const startedAt = Date.now();
    const headers = [...byName.values()];
    const envelope = await new FetchTransport().send({ method: content.method, url: address.toString(), headers, ...(sent && { body: sent.data }) }, { signal: new AbortController().signal, timeoutMs: 0 });
    const body = new TextDecoder().decode(envelope.body as ArrayBuffer);
    const response: ScriptResponse = { code: envelope.status, status: envelope.statusText, headers: Object.fromEntries(envelope.headers), body, responseTime: Date.now() - startedAt, responseSize: body.length };
    const seen = sentScriptRequest(content, { method: content.method, url: address.toString(), headers, ...(typeof sent?.data === "string" && { body: sent.data }) });
    for (const { scripts } of holders) {
      if (scripts.post.trim()) await run(scripts.post, "test", seen, response);
    }
    return { ...outcome, status: envelope.status, statusText: envelope.statusText };
  };
  return { requests: docs.map((doc) => ({ id: doc.id, name: doc.name })), send };
}

/** A whole run of a collection in Node: `runRequests` with `collectionSender`. */
export async function runCollectionReport(quickjs: QuickJSWASMModule, source: CollectionExport, options: Parameters<typeof collectionSender>[2], run: RunOptions = {}): Promise<RunReport> {
  const { requests, send } = collectionSender(quickjs, source, options);
  return runRequests(requests, send, run);
}

/** A collection's requests, once, in order: the test names and results a golden file of Newman's holds. */
export async function runCollection(quickjs: QuickJSWASMModule, source: CollectionExport, options: { environment: Row[]; globals?: Row[]; files?: Record<string, Uint8Array> }): Promise<RunResult[]> {
  const { results } = await runCollectionReport(quickjs, source, options);
  return results.map((result) => ({ name: result.name, tests: result.tests.map(({ name, passed }) => ({ name, passed })) }));
}

/** The body as `WorkspaceStore.resolveBody` builds it, with the `Content-Type` it implies. */
function sentBody(content: RequestContent, resolve: (text: string) => string, files: Record<string, Uint8Array>): { data: string | ArrayBuffer | FormData; contentType?: string } | undefined {
  const { body } = content;
  if (content.method === "GET" || content.method === "HEAD") return undefined;
  const bytes = (name: string): Uint8Array<ArrayBuffer> => {
    if (!Object.hasOwn(files, name)) throw new Error(`The run was given no file "${name}".`);
    return new Uint8Array(files[name]);
  };
  switch (body.mode) {
    case "none":
      return undefined;
    case "raw": {
      const text = resolve(body.raw?.text ?? "");
      return text ? { data: text, contentType: RAW_CONTENT_TYPES[body.raw?.language ?? "text"] } : undefined;
    }
    case "graphql": {
      const payload = graphqlPayload(resolve(body.graphql?.query ?? ""), resolve(body.graphql?.variables ?? ""));
      if ("error" in payload) throw new Error(payload.error);
      return { data: payload.text, contentType: "application/json" };
    }
    case "urlencoded":
      return { data: new URLSearchParams((body.urlencoded ?? []).filter((row) => row.enabled).map((row): [string, string] => [resolve(row.key), resolve(row.value)])).toString(), contentType: "application/x-www-form-urlencoded" };
    case "multipart": {
      const form = new FormData();
      for (const part of (body.multipart ?? []).filter((entry) => entry.enabled)) {
        if (part.kind === "text") form.append(resolve(part.key), resolve(part.value));
        else form.append(resolve(part.key), new Blob([bytes(part.fileName)]), part.fileName);
      }
      return { data: form };
    }
    case "binary":
      return body.binary ? { data: bytes(body.binary.fileName).buffer, contentType: body.binary.contentType || "application/octet-stream" } : undefined;
  }
}
