import variant from "@jitl/quickjs-wasmfile-release-sync";
import { newQuickJSWASMModuleFromVariant, newVariant, type QuickJSWASMModule } from "quickjs-emscripten-core";
import { expect, it } from "vitest";
import { runScript, scriptMemory, type ScriptContext } from "../src/scripting/host";
import { loadLibraries } from "../src/scripting/libraries";
import { loadLibrary } from "../src/scripting/library-loader";

// P3.10 (risk R3): what a real Postman script costs in the interpreter.
// One script signs a 1 KB text with CryptoJS.HmacSHA256, parses a 1 MB JSON
// response and runs 50 pm.test assertions with chai. Run with
// `npm -w packages/core run bench`; it prints one line of JSON, and fails
// above 300 ms (95 runs of 100) or when the engine takes over 250 ms to load.

const RUNS = 20;
const P95_LIMIT_MS = 300;
const LOAD_LIMIT_MS = 250;

const SCRIPT = `
const CryptoJS = require("crypto-js");
const signature = CryptoJS.HmacSHA256(pm.environment.get("payload"), "a signing key").toString();
pm.test("signature", () => pm.expect(signature).to.have.lengthOf(64));
const data = pm.response.json();
for (let i = 0; i < 49; i++) {
  pm.test("item " + i, () => {
    pm.expect(data.items[i].id).to.equal(i);
    pm.expect(data.items[i]).to.have.property("name").that.is.a("string");
  });
}
`;

/** A JSON body of 1 MB or a little more. */
function megabyte(): string {
  const items: unknown[] = [];
  for (let id = 0, size = 0; size < 2 ** 20; id++) {
    const item = { id, name: `item ${id}`, tags: ["a", "b", "c"], nested: { ok: true, score: id / 7 }, note: "x".repeat(120) };
    size += JSON.stringify(item).length + 1;
    items.push(item);
  }
  return JSON.stringify({ items });
}

/** The value 95 of 100 runs stay under, by the nearest rank. */
const p95 = (times: number[]): number => [...times].sort((a, b) => a - b)[Math.ceil(times.length * 0.95) - 1];
const median = (times: number[]): number => [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)];

/** The engine as the app's worker loads it: new each time, with the memory that is its limit. */
function load(): Promise<QuickJSWASMModule> {
  const { Memory } = (globalThis as unknown as { WebAssembly: { Memory: new (size: { initial: number; maximum: number }) => { buffer: ArrayBufferLike } } }).WebAssembly;
  return newQuickJSWASMModuleFromVariant(newVariant(variant, { wasmMemory: new Memory(scriptMemory()) }));
}

it("the benchmark script, and the engine's cold load", async () => {
  const body = megabyte();
  const context: ScriptContext = {
    environment: [["payload", "p".repeat(1024)]],
    response: { code: 200, status: "OK", headers: { "content-type": "application/json" }, body, responseTime: 1, responseSize: body.length },
  };
  const libraries = await loadLibraries(SCRIPT, loadLibrary, new Map());

  // The first load compiles the WebAssembly module: the app pays that once per worker. A later one is what a worker pays after a script hit a limit.
  const loads: number[] = [];
  let quickjs: QuickJSWASMModule | undefined;
  for (let i = 0; i < 6; i++) {
    const started = performance.now();
    quickjs = await load();
    loads.push(performance.now() - started);
  }
  const [cold, ...warm] = loads;
  const engine = quickjs as QuickJSWASMModule;

  const run = async (): Promise<number> => {
    const started = performance.now();
    const result = await runScript(engine, SCRIPT, context, undefined, { libraries });
    const took = performance.now() - started;
    // A script that did not do the work has no time worth recording.
    expect(result.error).toBeUndefined();
    expect(result.testResults).toHaveLength(50);
    expect(result.testResults.filter((test) => !test.passed)).toEqual([]);
    return took;
  };
  await run();
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) times.push(await run());

  const round = (ms: number) => Math.round(ms * 10) / 10;
  console.log(`script-bench ${JSON.stringify({ runs: RUNS, bodyBytes: body.length, p95: round(p95(times)), median: round(median(times)), min: round(Math.min(...times)), max: round(Math.max(...times)), load: { cold: round(cold), again: round(median(warm)) } })}`);
  // The gate (plan R3, as decided in P3.10): a ceiling, not a comparison with the last run. On GitHub's runners the same
  // commit gave a p95 of 64 to 88 ms from one job to the next, so "25% slower than before" would fail without a cause.
  // What this catches is the regression R3 is about: a hash or the JSON of a response done by the interpreter costs seconds.
  expect(p95(times)).toBeLessThanOrEqual(P95_LIMIT_MS);
  expect(cold).toBeLessThanOrEqual(LOAD_LIMIT_MS);
}, 120_000);
