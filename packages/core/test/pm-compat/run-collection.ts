import type { QuickJSWASMModule } from "quickjs-emscripten-core";
import { buildAuthHeaders, buildAuthQueryParam, effectiveAuth, resolveAuth } from "../../src/auth/request-auth";
import { folderChain, type CollectionExport, type Folder, type RequestDoc } from "../../src/model/collection";
import { RAW_CONTENT_TYPES, type RequestContent, type Row } from "../../src/model/request";
import { applyVariableChanges, scriptVariables } from "../../src/model/variables";
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
 * A collection's requests, one after another, as a run would send them:
 * the harness that stands for a runner until there is one (P5.2). It is
 * made of the pieces a send in the app is made of, in the order
 * `RequestExecutor.execute` has: each pre-request script from the
 * collection inward, the request built with the variables they left and
 * the auth it inherits, sent, each post-response script.
 *
 * The order of the requests is the order of a Postman file: in each
 * folder, its folders first and then its requests.
 */
export async function runCollection(
  quickjs: QuickJSWASMModule,
  source: CollectionExport,
  options: { environment: Row[]; globals?: Row[]; files?: Record<string, Uint8Array> }
): Promise<RunResult[]> {
  const byOrder = <T extends { order: number; id: string }>(list: T[]) => [...list].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const inOrder = (parent: string | undefined): RequestDoc[] => [
    ...byOrder(source.folders.filter((folder) => folder.parentFolderId === parent)).flatMap((folder) => inOrder(folder.id)),
    ...byOrder(source.requests.filter((doc) => doc.folderId === parent)),
  ];
  const scopes = { environment: options.environment, collection: source.collection.variables, global: options.globals ?? [] };
  const results: RunResult[] = [];
  const libraries = new Map<string, string>();

  for (const doc of inOrder(undefined)) {
    const folders: Folder[] = folderChain(source.folders, doc.folderId);
    const holders = [source.collection, ...folders, doc];
    const folder = folders.flatMap((entry) => entry.variables);
    const tests: RunResult["tests"] = [];
    let content: RequestContent = doc;

    const run = async (script: string, eventName: "prerequest" | "test", request: Parameters<typeof runScript>[2]["request"], response?: ScriptResponse) => {
      const context = {
        environment: scriptVariables(scopes.environment),
        collection: scriptVariables(scopes.collection),
        folder: scriptVariables(folder),
        globals: scriptVariables(scopes.global),
        request,
        response,
        info: { eventName, requestName: doc.name, requestId: doc.id },
      };
      const result = await runScript(quickjs, script, context, undefined, { libraries: await loadLibraries(script, loadLibrary, libraries) });
      if (result.error) throw new Error(`${doc.name} (${eventName}): ${result.error}`);
      scopes.environment = applyVariableChanges(scopes.environment, result.changes.environment);
      scopes.collection = applyVariableChanges(scopes.collection, result.changes.collection);
      scopes.global = applyVariableChanges(scopes.global, result.changes.global);
      tests.push(...result.testResults.map((test) => ({ name: test.label, passed: test.passed })));
      return result;
    };

    for (const { scripts } of holders) {
      if (!scripts.pre.trim()) continue;
      const { request } = await run(scripts.pre, "prerequest", scriptRequestOf(content));
      if (request) content = withScriptRequest(content, request);
    }

    const resolver = new VariableResolver({ ...scopes, folder });
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
    results.push({ name: doc.name, tests });
  }
  return results;
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
