import variant from "@jitl/quickjs-wasmfile-release-sync";
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from "quickjs-emscripten-core";
import { beforeAll, describe, expect, it } from "vitest";
import { runScript } from "../../src/scripting/host";
import { loadLibraries } from "../../src/scripting/libraries";
import { loadLibrary } from "../../src/scripting/library-loader";
import { CASES } from "./cases";
import { contextOf, echo, scriptOf, verdict } from "./harness";

// P3.3: every row of the compatibility matrix, run in Node. The app runs the
// same rows in its worker (src/app/shared/scripts/pm-compat.spec.ts).
describe("Postman compatibility", () => {
  let quickjs: QuickJSWASMModule;
  const libraries = new Map<string, string>();
  beforeAll(async () => {
    quickjs = await newQuickJSWASMModuleFromVariant(variant);
  });

  it("names each API once", () => {
    const names = CASES.map((row) => row.api);
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
    for (const row of CASES) expect(row.status === "supported" || row.note !== undefined || row.status === "unsupported", row.api).toBe(true);
  });

  it("a row whose script does not hold is reported, also when the failure comes after a wait", async () => {
    const run = async (row: (typeof CASES)[number]) => {
      const source = scriptOf(row);
      return verdict(row, await runScript(quickjs, source, contextOf(row), undefined, { libraries: await loadLibraries(source, loadLibrary, libraries), send: echo }));
    };
    expect(await run({ api: "wrong", status: "supported", script: `same(1, 2);` })).toBe("got 1, expected 2");
    expect(await run({ api: "late", status: "supported", script: `await pm.sendRequest("https://api.test/x"); same({ b: 1, a: 2 }, { a: 2, b: 2 });` })).toBe('got {"a":2,"b":1}, expected {"a":2,"b":2}');
    expect(await run({ api: "not refused", status: "unsupported", script: `refused(() => 1);` })).toBe("it did not throw");
    expect(await run({ api: "another error", status: "unsupported", script: `refused(() => { throw new TypeError("no"); });` })).toBe("no");
    expect(await run({ api: "broken", status: "supported", script: `}); throw new Error("outside"); pm.test("x", () => {` })).toBe("the script ended in an error: outside");
  });

  it.each(CASES.map((row) => [row.api, row] as const))("%s", async (_api, row) => {
    const source = scriptOf(row);
    const result = await runScript(quickjs, source, contextOf(row), undefined, { libraries: await loadLibraries(source, loadLibrary, libraries), send: echo });
    expect(verdict(row, result)).toBeUndefined();
    if (row.result) expect(result).toMatchObject(row.result);
  });
});
