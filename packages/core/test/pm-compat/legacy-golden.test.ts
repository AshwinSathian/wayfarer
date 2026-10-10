import variant from "@jitl/quickjs-wasmfile-release-sync";
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from "quickjs-emscripten-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyVariableChanges, variablesByName } from "../../src/model/variables";
import type { Row } from "../../src/model/request";
import { runScript, type ScriptRequest, type ScriptResult } from "../../src/scripting/host";
import { FetchTransport } from "../../src/transport/fetch";
import { VariableResolver } from "../../src/variables/resolver";
// @ts-expect-error -- a JavaScript module of the e2e support, without types. The same server Newman ran against.
import { startEchoServer } from "../../../../e2e/support/echo-server.mjs";
import collection from "../fixtures/postman-legacy.postman_collection.json";
import golden from "../fixtures/postman-legacy.golden.json";

// P3.4: a collection that uses only Postman's older sandbox gives, in
// Wayfarer's engine, the test names and results Newman gives. Newman's are
// in the golden file, written by `npm run golden`; this test fails when
// Wayfarer drifts from it.
//
// There is no collection runner yet (P5.2): this runs the requests in
// order, as a run would, with the pieces a send is made of.

interface Item {
  name: string;
  event?: { listen: string; script: { exec: string[] } }[];
  request: { method: string; url: string; header: { key: string; value: string }[]; body?: { mode: string; raw: string } };
}

describe("Postman's legacy sandbox, against Newman", () => {
  let quickjs: QuickJSWASMModule;
  let server: { address(): { port: number }; close(): void };
  beforeAll(async () => {
    quickjs = await newQuickJSWASMModuleFromVariant(variant);
    server = (await startEchoServer(0)) as typeof server;
  });
  afterAll(() => server.close());

  it("the golden file was written by Newman from this fixture", () => {
    expect(golden.runner).toMatch(/^newman@\d+\.\d+\.\d+$/);
    expect(golden.items.map((item) => item.name)).toEqual(collection.item.map((item) => item.name));
    expect(collection.item).toHaveLength(10);
    // Legacy syntax only: no script of the fixture says `pm`.
    expect(JSON.stringify(collection.item.map((item: Item) => item.event))).not.toMatch(/\bpm\./);
  });

  it("gives the same test names and the same passes and failures", async () => {
    let environment: Row[] = [{ key: "base", value: `http://127.0.0.1:${server.address().port}`, enabled: true }];
    let globals: Row[] = [];
    const results: { name: string; tests: { name: string; passed: boolean }[] }[] = [];

    for (const item of collection.item as Item[]) {
      const script = (listen: string) => item.event?.find((event) => event.listen === listen)?.script.exec.join("\n") ?? "";
      const request: ScriptRequest = {
        method: item.request.method,
        url: item.request.url,
        headers: item.request.header.map((header): [string, string] => [header.key, header.value]),
        body: item.request.body ? { mode: "raw", raw: item.request.body.raw } : { mode: "none" },
      };
      const run = async (source: string, eventName: "prerequest" | "test", response?: Parameters<typeof runScript>[2]["response"]): Promise<ScriptResult> => {
        const result = await runScript(quickjs, source, {
          environment: [...variablesByName(environment)],
          globals: [...variablesByName(globals)],
          request,
          response,
          info: { eventName, requestName: item.name, requestId: item.name },
        });
        expect(result.error, `${item.name} (${eventName})`).toBeUndefined();
        environment = applyVariableChanges(environment, result.changes.environment);
        globals = applyVariableChanges(globals, result.changes.global);
        return result;
      };

      const before = script("prerequest") ? await run(script("prerequest"), "prerequest") : undefined;
      const resolver = new VariableResolver({ environment, global: globals });
      const startedAt = Date.now();
      const envelope = await new FetchTransport().send(
        {
          method: request.method,
          url: resolver.resolve(request.url),
          headers: request.headers.map(([name, value]): [string, string] => [name, resolver.resolve(value)]),
          ...(request.body.mode === "raw" && { body: resolver.resolve(request.body.raw) }),
        },
        { signal: new AbortController().signal, timeoutMs: 0 }
      );
      const body = new TextDecoder().decode(envelope.body as ArrayBuffer);
      const after = await run(script("test"), "test", {
        code: envelope.status,
        status: envelope.statusText,
        headers: Object.fromEntries(envelope.headers),
        body,
        responseTime: Date.now() - startedAt,
        responseSize: body.length,
      });
      results.push({ name: item.name, tests: [...(before?.testResults ?? []), ...after.testResults].map((test) => ({ name: test.label, passed: test.passed })) });
    }

    expect(results).toEqual(golden.items);
    // Not a list of passes only: the fixture has tests that fail, and they fail here too.
    expect(results.flatMap((item) => item.tests).filter((test) => !test.passed)).toHaveLength(3);
  });
});
