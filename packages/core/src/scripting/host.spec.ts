import variant from "@jitl/quickjs-wasmfile-release-sync";
import { newQuickJSWASMModuleFromVariant, newVariant, type QuickJSWASMModule } from "quickjs-emscripten-core";
import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { LOG_TRUNCATED, SCRIPT_LIMITS, runScript, scriptMemory, type ScriptContext, type ScriptLimits } from "./host";
import { VM_LIBRARIES, librariesOf, loadLibraries } from "./libraries";
import { loadLibrary } from "./library-loader";

// What ECMAScript itself puts on a global object, as QuickJS has it. A name
// that is not here and not in ALLOWED is something the host let in.
const BUILT_INS =
  "AggregateError Array ArrayBuffer BigInt BigInt64Array BigUint64Array Boolean DataView Date Error EvalError FinalizationRegistry Float16Array Float32Array Float64Array Function Infinity Int16Array Int32Array Int8Array InternalError Iterator JSON Map Math NaN Number Object Promise Proxy RangeError ReferenceError Reflect RegExp Set SharedArrayBuffer String Symbol SyntaxError TypeError URIError Uint16Array Uint32Array Uint8Array Uint8ClampedArray WeakMap WeakRef WeakSet decodeURI decodeURIComponent encodeURI encodeURIComponent escape eval globalThis isFinite isNaN parseFloat parseInt undefined unescape".split(
    " "
  );
const ALLOWED = ["pm", "console", "atob", "btoa", "setTimeout", "require"];

const RESPONSE = { code: 201, status: "Created", headers: { "content-type": "application/json", "X-Id": "7" }, body: '{"id":7,"tags":["a"]}', responseTime: 12 };

describe("runScript", () => {
  let quickjs: QuickJSWASMModule;
  let memory: { buffer: ArrayBufferLike };
  beforeAll(async () => {
    // As the app's worker loads the engine. This package has no types for WebAssembly (no DOM, no worker).
    const { Memory } = (globalThis as unknown as { WebAssembly: { Memory: new (size: { initial: number; maximum: number }) => { buffer: ArrayBufferLike } } }).WebAssembly;
    memory = new Memory(scriptMemory());
    quickjs = await newQuickJSWASMModuleFromVariant(newVariant(variant, { wasmMemory: memory }));
  });

  const libraries = new Map<string, string>();
  const run = async (source: string, context: Partial<ScriptContext> = {}, limits: Partial<ScriptLimits> = {}) =>
    runScript(quickjs, source, { environment: [], ...context }, { ...SCRIPT_LIMITS, ...limits }, await loadLibraries(source, loadLibrary, libraries));
  /** Runs an expression and gives what it logged. */
  const value = async (expression: string, context: Partial<ScriptContext> = {}) => {
    const result = await run(`console.log(${expression})`, context);
    expect(result.error).toBeUndefined();
    return result.logs[0];
  };

  it("runs pm.test with pm.expect and reports each result", async () => {
    const result = await run(`
      pm.test("t", () => pm.expect(1).to.equal(1));
      pm.test("fails", () => pm.expect(1).to.equal(2));
      pm.test(null, function () { throw "text"; });
    `);
    expect(result).toEqual({
      logs: [],
      envMutations: {},
      testResults: [
        { label: "t", passed: true, source: "script" },
        { label: "fails", passed: false, error: "Expected 1 to equal 2", source: "script" },
        { label: "", passed: false, error: "text", source: "script" },
      ],
    });
  });

  it("@claim:C-052 the global object holds the ECMAScript built-ins and the allow-list, nothing else", async () => {
    const names = JSON.parse((await value("JSON.stringify(Object.getOwnPropertyNames(globalThis))")) ?? "[]") as string[];
    expect(names.sort()).toEqual([...BUILT_INS, ...ALLOWED].sort());
    // The same object by every road to it.
    expect(await value("Function('return this')() === globalThis && (0, eval)('this') === globalThis")).toBe("true");
  });

  it("@claim:C-052 has nothing of the host: no network, no worker scope, no module loader", async () => {
    const names = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "postMessage", "self", "window", "document", "navigator", "indexedDB", "localStorage", "caches", "Worker", "process", "module", "exports", "host"];
    const result = await run(`
      console.log(JSON.stringify(${JSON.stringify(names)}.filter((name) => Function("return typeof " + name)() !== "undefined")));
      import("https://example.invalid/x.js").then(() => console.log("loaded"), (error) => console.log("refused: " + error.name));
    `);
    expect(result.error).toBeUndefined();
    expect(result.logs).toEqual(["[]", "refused: ReferenceError"]);
  });

  it("reads the variables it was given, and sees its own changes", async () => {
    const result = await run(
      `
      console.log(pm.environment.get("API_KEY"), pm.environment.get("missing"), pm.environment.get("constructor"));
      pm.environment.set("TOKEN", "minted");
      pm.environment.set("count", 3);
      pm.environment.set("__proto__", "own");
      pm.environment.unset("API_KEY");
      console.log(pm.environment.get("TOKEN"), pm.environment.get("API_KEY"), pm.environment.get("__proto__"));
    `,
      { environment: [["API_KEY", "abc123"]] }
    );
    expect(result.logs).toEqual(["abc123 null null", "minted  own"]);
    expect(Object.entries(result.envMutations)).toEqual([
      ["TOKEN", "minted"],
      ["count", "3"],
      ["__proto__", "own"],
      ["API_KEY", ""],
    ]);
  });

  it("pm.response is null before the request and holds the response after it", async () => {
    expect(await value("pm.response")).toBe("null");
    const result = await run(
      `console.log(pm.response.code, pm.response.status, pm.response.responseTime, pm.response.text(), pm.response.json().tags[0]);
       console.log(pm.response.headers.get("Content-Type"), pm.response.headers.get("X-Id"), pm.response.headers.get("constructor"));
       pm.test("status", () => pm.expect(pm.response).to.have.status(201));`,
      { response: RESPONSE }
    );
    expect(result.logs).toEqual(['201 Created 12 {"id":7,"tags":["a"]} a', "application/json 7 null"]);
    expect(result.testResults[0].passed).toBe(true);
    expect(await value("pm.response.json()", { response: { ...RESPONSE, body: "<html>" } })).toBe("null");
  });

  it.each([
    ["pm.expect({a:1}).to.eql({a:1})", undefined],
    ["pm.expect({a:1}).to.eql({a:2})", 'Expected {"a":1} to deep-equal {"a":2}'],
    ["pm.expect('abc').to.include('b')", undefined],
    ["pm.expect('abc').to.include('x')", 'Expected "abc" to include "x"'],
    ["pm.expect([1,2]).to.include(2)", undefined],
    ["pm.expect([1,2]).to.include(3)", "Expected array to include 3"],
    ["pm.expect(5).to.include(5)", "Expected value to include 5"],
    ["pm.expect(1).to.be.ok()", undefined],
    ["pm.expect(0).to.be.ok()", "Expected 0 to be truthy"],
    ["pm.expect(null).to.be.null()", undefined],
    ["pm.expect(1).to.be.null()", "Expected 1 to be null"],
    ["pm.expect(undefined).to.be.undefined()", undefined],
    ["pm.expect(1).to.be.undefined()", "Expected value to be undefined"],
    ["pm.expect('s').to.be.a('string')", undefined],
    ["pm.expect(1).to.be.a('string')", "Expected 1 to be a string"],
    ["pm.expect({}).to.be.an('object')", undefined],
    ["pm.expect(1).to.be.an('object')", "Expected 1 to be an object"],
    ["pm.expect(1).to.be.below(2)", undefined],
    ["pm.expect(3).to.be.below(2)", "Expected 3 to be below 2"],
    ["pm.expect(3).to.be.above(2)", undefined],
    ["pm.expect(1).to.be.above(2)", "Expected 1 to be above 2"],
    ["pm.expect({code:200}).to.have.status(200)", undefined],
    ["pm.expect(null).to.have.status(200)", "Expected status undefined to equal 200"],
    ["pm.expect({a:1}).to.have.property('a')", undefined],
    ["pm.expect({a:1}).to.have.property('b')", 'Expected object to have property "b"'],
    ["pm.expect(1).to.not.equal(2)", undefined],
    ["pm.expect(1).to.not.equal(1)", "Expected 1 to not equal 1"],
    ["pm.expect('abc').to.not.include('x')", undefined],
    ["pm.expect('abc').to.not.include('b')", 'Expected "abc" to not include "b"'],
    ["pm.expect([1]).to.not.include(1)", undefined],
  ])("%s", async (assertion, message) => {
    const result = await run(`pm.test("t", () => { ${assertion}; });`);
    expect(result.testResults[0]).toEqual({ label: "t", passed: message === undefined, ...(message !== undefined && { error: message }), source: "script" });
  });

  it("console writes lines: text as it is, anything else as JSON", async () => {
    const circular = "(() => { const o = {}; o.self = o; return o; })()";
    const result = await run(`console.log("a", 1, {b: [true]}, undefined, ${circular}); console.info("i"); console.warn("w"); console.error("e");`);
    expect(result.logs).toEqual(['a 1 {"b":[true]} undefined [object Object]', "i", "[warn] w", "[error] e"]);
  });

  it("atob and btoa are the host's", async () => {
    expect(await value(`btoa("user:pass") + " " + atob("dXNlcjpwYXNz")`)).toBe("dXNlcjpwYXNz user:pass");
    expect(await value(`(() => { try { btoa("\\u20ac"); return "encoded"; } catch (error) { return "refused"; } })()`)).toBe("refused");
  });

  it("reports what a script threw", async () => {
    expect((await run(`throw new Error("boom");`)).error).toBe("boom");
    expect((await run(`throw "plain";`)).error).toBe("plain");
    expect((await run(`throw 5;`)).error).toBe("Script failed.");
    expect((await run(`throw {};`)).error).toBe("Script failed.");
    expect((await run(`this is not javascript`)).error).toMatch(/expecting/);
    expect((await run(`notDefined()`)).error).toBe("'notDefined' is not defined");
    // What ran before the error is kept.
    const partial = await run(`console.log("before"); pm.environment.set("a", "1"); throw new Error("after");`);
    expect(partial).toMatchObject({ logs: ["before"], envMutations: { a: "1" }, error: "after" });
  });

  it("a host function refuses anything but the type it takes, whatever the script did to String", async () => {
    const result = await run(`
      String = function () { return { toString: function () { return "x"; } }; };
      pm.environment.set("key", "value");
    `);
    expect(result.error).toBe("Expected a string.");
    expect(result.envMutations).toEqual({});
    const timer = await run(`Number = function () { return "soon"; }; setTimeout(function () {}, 5);`);
    expect(timer.error).toBe("Expected a number.");
  });

  it("the host receives plain text, whatever a script hands over: a getter, a prototype, a function", async () => {
    const result = await run(`
      let read = 0;
      const tricky = Object.create({ inherited: "from the prototype" }, {
        secret: { enumerable: true, get() { read++; return "from a getter"; } },
        method: { enumerable: true, value: function () { return "called"; } },
      });
      console.log(tricky, function named() {}, Symbol("s"));
      pm.environment.set("object", tricky);
      pm.environment.set(tricky, "key was an object");
      pm.test(tricky, () => { throw tricky; });
      pm.test("a thrown function", () => { throw function thrown() {}; });
      console.log("getter read " + read + " times, inside the engine");
    `);
    expect(result.error).toBeUndefined();
    // Every value is a string or a boolean the host made itself: nothing of the VM's is in the result.
    const flat = JSON.parse(JSON.stringify(result)) as typeof result;
    expect(flat).toEqual(result);
    expect(result.logs).toEqual(['{"secret":"from a getter"} function named() {} Symbol(s)', "getter read 1 times, inside the engine"]);
    expect(Object.entries(result.envMutations)).toEqual([
      ["object", "[object Object]"],
      ["[object Object]", "key was an object"],
    ]);
    expect(result.testResults).toEqual([
      { label: "[object Object]", passed: false, error: "[object Object]", source: "script" },
      { label: "a thrown function", passed: false, error: "function thrown() {}", source: "script" },
    ]);
    for (const value of [...result.logs, ...Object.values(result.envMutations), ...result.testResults.flatMap((row) => [row.label, row.error ?? ""])]) {
      expect(typeof value).toBe("string");
    }
  });

  it("keeps 1,000 lines of console output and says that more was dropped", async () => {
    const result = await run(`for (let i = 0; i < 5000; i++) console.log("line " + i); pm.test("still running", () => {});`);
    expect(result.error).toBeUndefined();
    expect(result.logs).toHaveLength(1001);
    expect(result.logs[999]).toBe("line 999");
    expect(result.logs[1000]).toBe(LOG_TRUNCATED);
    expect(result.testResults).toHaveLength(1);
  });

  it("keeps 1 MB of console output: the line that passes it is cut, and nothing follows", async () => {
    const result = await run(`const chunk = "x".repeat(400000); for (let i = 0; i < 5; i++) console.log(chunk); console.log("after");`);
    expect(result.logs.map((line) => line.length)).toEqual([400000, 400000, 2 ** 20 - 800000, LOG_TRUNCATED.length]);
    expect(result.logs.at(-1)).toBe(LOG_TRUNCATED);
  });

  it("ends a script that writes more than 1 MB of test results and variables, also when it catches", async () => {
    const tests = await run(`const name = "t".repeat(1000); for (;;) { try { pm.test(name, () => {}); } catch (error) {} }`, {}, { timeoutMs: 2000 });
    expect(tests.testResults.length).toBe(1048);
    expect(tests.limit).toBe("timeout");
    const variables = await run(`for (let i = 0; ; i++) pm.environment.set("k" + i, "v".repeat(100000));`);
    expect(variables.error).toBe("Script wrote too many test results and variables.");
    expect(Object.keys(variables.envMutations)).toHaveLength(10);
  });

  it("setTimeout runs its callback later, in order of time, with its arguments", async () => {
    const result = await run(`
      setTimeout((a, b) => console.log("second", a, b), 30, "x", 1);
      setTimeout(() => { console.log("first"); setTimeout(() => console.log("third"), 40); }, 5);
      Promise.resolve().then(() => console.log("job"));
      console.log("sync");
    `);
    expect(result.error).toBeUndefined();
    expect(result.logs).toEqual(["sync", "job", "first", "second x 1", "third"]);
  });

  it("reports an error thrown in a timer or in a promise reaction that the engine runs", async () => {
    expect((await run(`setTimeout(() => { throw new Error("late"); }, 1);`)).error).toBe("late");
    expect((await run(`setTimeout("not a function");`)).error).toMatch(/not a function|undefined/);
  });

  it("stops a script that does not end at the deadline, also when it catches", async () => {
    const result = await run(`pm.environment.set("a", "1"); try { while (true) {} } catch (error) {} console.log("survived");`, {}, { timeoutMs: 200 });
    expect(result).toEqual({ logs: [], envMutations: { a: "1" }, testResults: [], error: "Script timed out after 200 ms", limit: "timeout" });
  });

  it("does not wait for a timer that is due after the deadline", async () => {
    const started = Date.now();
    const result = await run(`setTimeout(() => console.log("never"), 60000);`, {}, { timeoutMs: 200 });
    expect(result).toMatchObject({ logs: [], error: "Script timed out after 200 ms", limit: "timeout" });
    expect(Date.now() - started).toBeLessThan(5000);
    const loop = await run(`(function again() { setTimeout(again, 20); })();`, {}, { timeoutMs: 200 });
    expect(loop.limit).toBe("timeout");
  });

  it("stops a script that allocates more than the memory limit", async () => {
    // In 8 MB steps, and with a deadline far away: on a slow machine a megabyte
    // at a time took longer than the 5 seconds a script has, and the run ended
    // for that reason instead (a CI runner needed 18 s).
    const result = await run(`const held = []; while (true) held.push(new Uint8Array(8 * 2 ** 20));`, {}, { timeoutMs: 120_000 });
    expect(result).toMatchObject({ error: "Script exceeded memory limit (64 MB)", limit: "memory" });
    expect((await run(`new Uint8Array(200 * 2 ** 20)`)).limit).toBe("memory");
  });

  it.each([
    ["25 typed arrays of 8 MB", `const held = []; for (let i = 0; i < 25; i++) held.push(new Uint8Array(8 * 2 ** 20));`],
    ["text, a megabyte at a time", `const held = []; for (let i = 0; i < 200; i++) held.push("x".repeat(2 ** 20) + i);`],
    ["arrays of numbers", `const held = []; for (let i = 0; i < 400; i++) held.push(new Array(131072).fill(i));`],
    ["small objects without end", `const held = []; for (let i = 0; ; i++) held.push({ a: i, b: "k" + i, c: [i] });`],
  ])("F66: stops a script that allocates 200 MB in pieces, none of them over the limit: %s", async (_name, script) => {
    // The deadline is far away: memory must be what stops it, on any machine.
    const result = await run(script, {}, { timeoutMs: 120_000 });
    expect(result).toMatchObject({ error: "Script exceeded memory limit (64 MB)", limit: "memory" });
    // The engine's memory never grew past the limit, and it runs the next script.
    expect(memory.buffer.byteLength).toBeLessThanOrEqual(SCRIPT_LIMITS.memoryBytes);
    expect((await run(`pm.test("next", () => {});`)).testResults).toHaveLength(1);
  });

  it("stops a recursion 100,000 deep, and the engine runs the next script", async () => {
    const result = await run(`function down(n) { return n ? down(n - 1) + 1 : 0; } down(100000);`);
    expect(result).toMatchObject({ error: "Script exceeded the stack limit (too much recursion)", limit: "stack" });
    expect((await run(`pm.test("next", () => {});`)).testResults).toHaveLength(1);
  });

  it("reports the same when the stack under the engine runs out first", async () => {
    // With no limit of its own QuickJS recurses until the host's stack ends. This engine is not used again.
    const spent = await newQuickJSWASMModuleFromVariant(variant);
    const result = await runScript(spent, `function down(n) { return n ? down(n - 1) + 1 : 0; } down(100000);`, { environment: [] }, { ...SCRIPT_LIMITS, stackBytes: 0 });
    expect(result).toEqual({ logs: [], envMutations: {}, testResults: [], error: "Script exceeded the stack limit (too much recursion)", limit: "stack" });
  });

  describe("require", () => {
    const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");

    it("gives the five libraries, atob and btoa, each the same object every time", async () => {
      const result = await run(`
        const _ = require("lodash"), moment = require("moment"), uuid = require("uuid"), chai = require("chai"), CryptoJS = require("crypto-js");
        console.log(_.chunk([1, 2, 3], 2), _.get({ a: [{ b: 7 }] }, "a[0].b"), _.template("hi <%= name %>")({ name: "you" }));
        console.log(moment("2026-10-10T12:00:00Z").utc().add(1, "day").format("YYYY-MM-DD"), moment.duration(90, "minutes").humanize());
        console.log(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid.v4()), uuid.v4() !== uuid.v4(), uuid.validate(uuid.v7()));
        chai.expect({ a: [1, { b: 2 }] }).to.deep.equal({ a: [1, { b: 2 }] });
        try { chai.expect(1).to.be.above(2); } catch (error) { console.log(error.name, error.message); }
        console.log(require("atob")("YQ=="), require("btoa")("a"), require("lodash") === _, require("crypto-js") === CryptoJS);
      `);
      expect(result.error).toBeUndefined();
      expect(result.logs).toEqual(['[[1,2],[3]] 7 hi you', "2026-10-11 2 hours", "true true true", "AssertionError expected 1 to be above 2", "a YQ== true true"]);
    });

    it("refuses any other module with the named error", async () => {
      const result = await run(`
        try { require("cheerio"); } catch (error) { console.log(error.name + ": " + error.message, error instanceof Error); }
        require("xml2js");
      `);
      expect(result.logs).toEqual(["WayfarerUnsupportedError: require('cheerio') is not supported — see docs/postman-compatibility.md#require true"]);
      expect(result.error).toBe("require('xml2js') is not supported — see docs/postman-compatibility.md#require");
    });

    it("a library is fetched only when a script names it, and a name put together at run time says what to do", async () => {
      expect(librariesOf(`pm.test("lodash", () => {})`)).toEqual([]);
      expect(librariesOf(`const _ = require('lodash'); const C = require("crypto-js")`)).toEqual(["crypto-js", "lodash"]);
      expect(librariesOf(`const load = require; load(\`moment\`)`)).toEqual(["moment"]);
      const result = await run(`require("lod" + "ash")`);
      expect(result.error).toBe("require('lodash'): write the module's name out in the script, as require('lodash')");
    });

    it("a library sees what a script sees: nothing of the host, and no global of its own is left", async () => {
      const names = await run(`${VM_LIBRARIES.map((name) => `require("${name}");`).join(" ")} console.log(JSON.stringify(Object.getOwnPropertyNames(globalThis)));`);
      expect(names.error).toBeUndefined();
      expect((JSON.parse(names.logs[0]) as string[]).sort()).toEqual([...BUILT_INS, ...ALLOWED].sort());
    });

    it("the five libraries fit in the engine's memory with room for a script's own data", async () => {
      // All five, then 16 MB of text: under the 64 MB the engine may hold (F66).
      const result = await run(`${VM_LIBRARIES.map((name) => `require("${name}");`).join(" ")} const held = []; for (let i = 0; i < 16; i++) held.push("x".repeat(2 ** 20) + i); console.log(held.length);`, {}, { timeoutMs: 120_000 });
      expect(result).toMatchObject({ logs: ["16"] });
      expect(result.error).toBeUndefined();
    });

    it("crypto-js: HMAC is the host's, and equal to Node's crypto for 100 random inputs", async () => {
      const cases = fc.sample(fc.tuple(fc.string({ unit: "grapheme", maxLength: 200 }), fc.string({ unit: "grapheme", maxLength: 200 })), 100);
      const result = await run(`
        const CryptoJS = require("crypto-js");
        for (const [key, message] of ${JSON.stringify(cases)}) console.log(CryptoJS.HmacSHA256(message, key).toString() + " " + CryptoJS.HmacSHA1(message, key).toString(CryptoJS.enc.Hex));
      `);
      expect(result.error).toBeUndefined();
      expect(result.logs).toHaveLength(100);
      const sign = async (hash: string, key: string, message: string) => {
        // An empty key cannot be imported by WebCrypto; HMAC pads a key with zeros, so one zero byte is the same key.
        const raw = key ? new TextEncoder().encode(key) : new Uint8Array(1);
        return hex(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash }, false, ["sign"]), new TextEncoder().encode(message)));
      };
      for (const [index, [key, message]] of cases.entries()) {
        expect(result.logs[index]).toBe(`${await sign("SHA-256", key, message)} ${await sign("SHA-1", key, message)}`);
      }
    });

    it("crypto-js: the host's hashes and encodings give what crypto-js's own code gives", async () => {
      const texts = ["", "abc", "The quick brown fox jumps over the lazy dog", "€ 𝄞 ünïcödé", "x".repeat(1000), ...fc.sample(fc.string({ unit: "grapheme", maxLength: 300 }), 40)];
      const result = await run(`
        const C = require("crypto-js");
        const own = (name, message) => C.algo[name].create().update(message).finalize().toString();
        const ownHmac = (name, message, key) => C.algo.HMAC.create(C.algo[name], key).update(message).finalize().toString();
        let checked = 0;
        for (const text of ${JSON.stringify(texts)}) {
          const words = C.lib.WordArray.create([0x61626364, 0x65000000], 5).concat(C.algo.SHA1.create().update(text).finalize());
          for (const name of ["MD5", "SHA1", "SHA256"]) {
            for (const message of [text, words]) {
              if (C[name](message).toString() !== own(name, message)) throw new Error(name + " differs for " + JSON.stringify(text));
              checked++;
            }
          }
          for (const name of ["SHA1", "SHA256"]) {
            if (C["Hmac" + name](words, words).toString() !== ownHmac(name, words, words)) throw new Error("Hmac" + name + " differs for a WordArray");
            checked++;
          }
          const hexText = words.toString();
          if (C.enc.Hex.stringify(words) !== hexText || C.enc.Hex.parse(hexText).toString() !== hexText) throw new Error("Hex differs");
          const b64 = words.toString(C.enc.Base64);
          if (C.enc.Base64.stringify(words) !== b64 || C.enc.Base64.parse(b64).toString() !== hexText || C.enc.Base64.parse(b64.replace(/=+$/, "")).toString() !== hexText) throw new Error("Base64 differs");
          const utf8 = C.enc.Utf8.parse(text);
          if (utf8.sigBytes !== unescape(encodeURIComponent(text)).length || C.enc.Utf8.stringify(utf8) !== text || utf8.toString(C.enc.Utf8) !== text) throw new Error("Utf8 differs for " + JSON.stringify(text));
        }
        console.log(checked, C.MD5("abc").toString(), C.SHA256("abc").toString(C.enc.Base64), C.SHA1("abc") instanceof C.lib.WordArray.init);
        try { C.enc.Utf8.stringify(C.enc.Hex.parse("ff")); } catch (error) { console.log(error.message); }
        console.log(C.AES.decrypt(C.AES.encrypt("round trip", "passphrase").toString(), "passphrase").toString(C.enc.Utf8), C.lib.WordArray.random(16).sigBytes);
      `);
      expect(result.error).toBeUndefined();
      expect(result.logs).toEqual([`${texts.length * 8} 900150983cd24fb0d6963f7d28e17f72 ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0= true`, "Malformed UTF-8 data", "round trip 16"]);
    });

    it("the host's crypto functions refuse what is not a WordArray, a known hash or an encoding", async () => {
      const result = await run(`
        const C = require("crypto-js");
        for (const attempt of [() => C.SHA256({ sigBytes: 4, words: ["a"] }), () => C.SHA256({ sigBytes: 4, words: { length: 1 } }), () => C.enc.Hex.stringify({ sigBytes: "x", words: [1] })]) {
          try { attempt(); console.log("accepted"); } catch (error) { console.log(error.message); }
        }
      `);
      expect(result.error).toBeUndefined();
      expect(result.logs).toEqual(["Expected a WordArray.", "Expected a WordArray.", "Expected a WordArray."]);
    });
  });
});
