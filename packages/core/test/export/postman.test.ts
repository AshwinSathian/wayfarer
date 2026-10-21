import variant from "@jitl/quickjs-wasmfile-release-sync";
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from "quickjs-emscripten-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postmanCollection } from "../../src/export/postman";
// @ts-expect-error -- a JavaScript module of the e2e support, without types. The same server Newman ran against.
import { startEchoServer } from "../../../../e2e/support/echo-server.mjs";
import golden from "../fixtures/postman-export/shop.golden.json";
import { runCollection } from "../pm-compat/run-collection";
import { FILES } from "./fixtures";
import { SHOP } from "./postman-shop";

// P4.6 (b): a collection exported as a Postman v2.1 file is run by Newman,
// Postman's own runner, and gives the results the harness gives for the
// collection itself. Newman's are in the golden file, written by
// `npm run golden` from the committed export; this test fails when the
// exporter or the engine drifts from it.
describe("a collection exported for Postman, against Newman", () => {
  let quickjs: QuickJSWASMModule;
  let server: { address(): { port: number }; close(): void };
  beforeAll(async () => {
    quickjs = await newQuickJSWASMModuleFromVariant(variant);
    server = (await startEchoServer(0)) as typeof server;
  });
  afterAll(() => server.close());

  it("the file Newman ran is what the exporter writes today", async () => {
    // Stale after a change to the exporter or to the fixture: `npx vitest run -u` in packages/core, then `npm run golden`.
    await expect(`${JSON.stringify(postmanCollection(SHOP).file, null, 2)}\n`).toMatchFileSnapshot(
      "../fixtures/postman-export/shop.postman_collection.json",
    );
    expect(golden.runner).toMatch(/^newman@\d+\.\d+\.\d+$/);
  });

  it("@claim:C-057 Newman, running the exported file, gives the test names, passes and failures the engine gives for the collection", async () => {
    const results = await runCollection(quickjs, SHOP, {
      environment: [{ key: "base", value: `http://127.0.0.1:${server.address().port}`, enabled: true }],
      files: FILES,
    });

    expect(results).toEqual(golden.items);
    expect(results.map((item) => item.name)).toEqual(["Form", "JSON", "Multipart", "File", "XML", "Inherit bearer"]);
    // Not a list of passes only: one test fails on purpose, and it fails in both.
    const tests = results.flatMap((item) => item.tests);
    expect(tests).toHaveLength(26);
    expect(tests.filter((test) => !test.passed).map((test) => test.name)).toEqual([
      "Inherit bearer: fails on purpose, the answer is not 404",
    ]);
  });
});
