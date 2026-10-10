import { test, expect, type Page } from "@playwright/test";
import { readFile, readdir } from "node:fs/promises";
import { TARGET, captureTarget, expectProdParity, seedAndOpen, send } from "./support/app";
import { ECHO } from "./support/echo";

// P3.1: scripts run in QuickJS (WebAssembly) in a worker, under the
// production Content-Security-Policy. These tests need the production build
// served with production headers: run them with CI=1.

// The target is a routed fake host, which the app's service worker would hide in WebKit.
test.use({ serviceWorkers: "block" });

/** Collects CSP and Trusted Types violation events of the page; a wider policy must never be what makes a script run (R15). */
async function watchViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __violations: string[] }).__violations = seen;
    document.addEventListener("securitypolicyviolation", (e) => seen.push(`${e.effectiveDirective} ${e.blockedURI} ${e.sample}`));
  });
  return () => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);
}

async function openTests(page: Page): Promise<void> {
  await page.locator("app-response-viewer").getByRole("tab", { name: /Tests/ }).click();
}

test("@claim:C-006 a pre-request and a post-response script run under the production CSP, with no violation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const violations = await watchViolations(page);
  const hits = await captureTarget(page);
  const response = await seedAndOpen(page, { stage: "before" }, {
    method: "GET",
    url: `${TARGET}/scripts`,
    headers: { "X-Stage": "{{stage}}" },
    preRequestScript: 'pm.environment.set("stage", "set-by-script"); pm.test("pre ran", () => pm.expect(pm.response).to.be.null);',
    postRequestScript: "pm.test('t', () => pm.expect(1).to.equal(1)); pm.test('status', () => pm.expect(pm.response).to.have.status(200)); pm.test('body', () => pm.expect(pm.response.json().ok).to.equal(true));",
  });
  await expectProdParity(response);
  expect(response?.headers()["content-security-policy"]).toContain("script-src 'self' 'wasm-unsafe-eval';");

  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await openTests(page);
  for (const name of ["pre ran", "t", "status", "body"]) {
    await expect(page.locator(".test-result-pass").getByText(name, { exact: true })).toBeVisible();
  }
  await expect(page.locator(".test-result-fail")).toHaveCount(0);
  // The variable the pre-request script set is in the request that was sent.
  expect(hits).toHaveLength(1);
  expect(hits[0].headers()["x-stage"]).toBe("set-by-script");

  expect(await violations()).toEqual([]);
  expect(errors).toEqual([]);
});

test("a script that fails says so in the Tests tab (F65), and the next one runs", async ({ page }) => {
  const violations = await watchViolations(page);
  await captureTarget(page);
  await seedAndOpen(page, {}, {
    method: "GET",
    url: `${TARGET}/scripts-error`,
    // P3.9: the script that fails is the post-response one. A pre-request script that fails stops the send (the test after the next).
    preRequestScript: "eval('1'); new Function('return 1')(); pm.test('the engine has its own eval', () => {});",
    postRequestScript: "pm.test('before the error', () => {}); notDefined();",
  });
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await openTests(page);
  await expect(page.locator(".test-result-pass", { hasText: "before the error" })).toBeVisible();
  const failed = page.locator(".test-result-fail", { hasText: "Post-response script" });
  await expect(failed).toBeVisible();
  await expect(failed).toContainText("'notDefined' is not defined");
  // eval inside the engine is the engine's, not the browser's: it runs, and the page's policy reports nothing.
  await expect(page.locator(".test-result-pass", { hasText: "the engine has its own eval" })).toBeVisible();
  expect(await violations()).toEqual([]);
});

test("P3.9: a pre-request script adds a header that reaches the server, and the time it waits is not the request's", async ({ page }) => {
  const violations = await watchViolations(page);
  await seedAndOpen(page, {}, {
    method: "GET",
    url: `${ECHO}/echo`,
    preRequestScript: `(async () => {
      pm.request.headers.add({ key: "X-Signed", value: "by-the-script" });
      await new Promise((resolve) => setTimeout(resolve, 200));
    })();`,
    postRequestScript: "pm.test('after', () => {});",
  });
  const answered = page.waitForResponse((r) => r.url().startsWith(`${ECHO}/echo`) && r.request().method() !== "OPTIONS");
  await send(page);
  const echo = (await (await answered).json()) as { headers: [string, string][] };
  expect(echo.headers.find(([name]) => name === "x-signed")?.[1]).toBe("by-the-script");

  await expect(page.locator(".status-badge")).toHaveText("200");
  await openTests(page);
  const timings = page.locator(".script-timings");
  await expect(timings).toHaveText(/^Pre-request script \d+ ms · Request \d+ ms · Post-response script \d+ ms$/);
  const [pre, request] = [...((await timings.textContent()) ?? "").matchAll(/(\d+) ms/g)].map((match) => Number(match[1]));
  // The script waited 200 ms of its own. Whatever the machine, that time is in its number and not in the request's.
  expect(pre).toBeGreaterThanOrEqual(200);
  expect(request).toBeLessThan(pre);
  expect(await violations()).toEqual([]);
});

test("P3.9: a pre-request script that fails stops the send, and the Tests tab shows what it did", async ({ page }) => {
  const violations = await watchViolations(page);
  const hits = await captureTarget(page);
  await seedAndOpen(page, {}, {
    method: "GET",
    url: `${TARGET}/not-sent`,
    preRequestScript: "console.log('signing'); pm.test('before the error', () => {}); notDefined();",
    postRequestScript: "pm.test('the post-response script ran', () => {});",
  });
  await send(page);
  await expect(page.getByText("The pre-request script failed, so the request was not sent.")).toBeVisible();
  // The Tests tab is open by itself: there is no response to look at.
  const failed = page.locator(".test-result-fail", { hasText: "Pre-request script" });
  await expect(failed).toContainText("'notDefined' is not defined");
  await expect(page.locator(".test-result-pass", { hasText: "before the error" })).toBeVisible();
  await expect(page.locator(".script-console")).toContainText("signing");
  await expect(page.locator(".script-timings")).toHaveText(/^Pre-request script \d+ ms$/);
  await expect(page.locator(".test-result-pass", { hasText: "the post-response script ran" })).toHaveCount(0);
  await expect(page.locator(".status-badge")).toHaveCount(0);
  expect(hits).toEqual([]);
  expect(await violations()).toEqual([]);
});

test("the engine is fetched on the first run, from the app's own origin, and once", async ({ page, baseURL }) => {
  const engine: string[] = [];
  page.on("request", (request) => {
    if (/\.wasm(\?|$)/.test(request.url())) engine.push(request.url());
  });
  await captureTarget(page);
  await seedAndOpen(page, {}, { method: "GET", url: `${TARGET}/scripts-lazy`, postRequestScript: "pm.test('ran', () => {});" });
  // Loading the app and opening a request with a script fetches no engine.
  expect(engine).toEqual([]);

  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await openTests(page);
  await expect(page.locator(".test-result-pass", { hasText: "ran" })).toBeVisible();
  expect(engine).toHaveLength(1);
  // A content hash in the name, under the app's own origin.
  expect(engine[0]).toMatch(new RegExp(`^${baseURL}/media/emscripten-module-[A-Z0-9]{8}\\.wasm$`));

  // A second run uses the worker that is there: nothing is fetched again.
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await openTests(page);
  await expect(page.locator(".test-result-pass", { hasText: "ran" })).toBeVisible();
  expect(engine).toHaveLength(1);
});

test("require gives the five libraries under the production CSP, each from a file of its own that is fetched when a script names it", async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const violations = await watchViolations(page);
  const fetched: string[] = [];
  page.context().on("request", (request) => fetched.push(request.url()));
  await captureTarget(page);
  await seedAndOpen(page, {}, {
    method: "GET",
    url: `${TARGET}/scripts-require`,
    preRequestScript: `
      const _ = require("lodash"), CryptoJS = require("crypto-js");
      pm.test("lodash", () => pm.expect(_.chunk([1, 2, 3], 2).length).to.equal(2));
      pm.test("crypto-js, hashed by the host", () => pm.expect(CryptoJS.HmacSHA256("message", "key").toString()).to.equal("6e9ef29b75fffc5b7abae527d58fdadb2fe42e7219011976917343065f58ed4a"));
      pm.test("crypto-js has a random source", () => pm.expect(CryptoJS.AES.decrypt(CryptoJS.AES.encrypt("text", "pass").toString(), "pass").toString(CryptoJS.enc.Utf8)).to.equal("text"));
    `,
    postRequestScript: `
      const moment = require("moment"), uuid = require("uuid"), chai = require("chai");
      pm.test("moment", () => pm.expect(moment("2026-10-10T12:00:00Z").utc().add(1, "day").format("YYYY-MM-DD")).to.equal("2026-10-11"));
      pm.test("uuid", () => pm.expect(uuid.validate(uuid.v4())).to.equal(true));
      pm.test("chai", () => chai.expect({ a: [1] }).to.deep.equal({ a: [1] }));
      pm.test("atob and btoa", () => pm.expect(require("atob")(require("btoa")("a"))).to.equal("a"));
      require("cheerio");
    `,
  });
  // A library is one hashed file of the build, found by text only it holds.
  const dist = "dist/wayfarer/browser";
  const files = await Promise.all((await readdir(dist)).filter((name) => /^chunk-.*\.js$/.test(name)).map(async (name) => [name, await readFile(`${dist}/${name}`, "utf8")] as const));
  const fileOf = (marker: string) => files.filter(([, text]) => text.includes(marker)).map(([name]) => `${baseURL}/${name}`);
  const libraries = { lodash: fileOf("__lodash_hash_undefined__"), "crypto-js": fileOf("Malformed UTF-8 data"), moment: fileOf("Moment<"), uuid: fileOf("Invalid UUID"), chai: fileOf("AssertionError") };
  for (const [name, found] of Object.entries(libraries)) expect(found, name).toHaveLength(1);
  const all = Object.values(libraries).flat();
  // Opening the request fetched none of them.
  expect(fetched.filter((url) => all.includes(url))).toEqual([]);

  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await openTests(page);
  for (const name of ["lodash", "crypto-js, hashed by the host", "crypto-js has a random source", "moment", "uuid", "chai", "atob and btoa"]) {
    await expect(page.locator(".test-result-pass").getByText(name, { exact: true })).toBeVisible();
  }
  const failed = page.locator(".test-result-fail");
  await expect(failed).toHaveCount(1);
  await expect(failed).toContainText("require('cheerio') is not supported — see docs/postman-compatibility.md#require");
  // Each library was fetched once, from the app's own origin, under a name with a content hash.
  expect(fetched.filter((url) => all.includes(url)).sort()).toEqual([...all].sort());
  for (const url of all) expect(url).toMatch(new RegExp(`^${baseURL}/chunk-[A-Z0-9]{8}\\.js$`));

  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  expect(fetched.filter((url) => all.includes(url))).toHaveLength(5);
  expect(await violations()).toEqual([]);
  expect(errors).toEqual([]);
});

test("Postman's pm in the built app: a pre-request script fetches a token with pm.sendRequest, signs the request, and the post-response script checks the answer with chai", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const violations = await watchViolations(page);
  const hits = await captureTarget(page, { contentType: "application/json", body: '{"token":"t-123","items":[1,2]}' });
  await seedAndOpen(page, { host: "tripwire.test", stage: "before" }, {
    method: "POST",
    url: "https://{{host}}/items",
    headers: { "X-Stage": "{{stage}}" },
    body: { name: "a" },
    preRequestScript: `
      const login = await pm.sendRequest({ url: "https://{{host}}/login", method: "POST", header: { "Content-Type": "application/json" }, body: { mode: "raw", raw: JSON.stringify({ user: "{{stage}}" }) } });
      pm.environment.set("token", login.json().token);
      pm.globals.set("seen", pm.info.eventName + " " + pm.info.requestName);
      pm.request.headers.upsert({ key: "Authorization", value: "Bearer {{token}}" });
      pm.request.headers.add({ key: "X-Signed", value: require("crypto-js").HmacSHA256(pm.request.body.raw, login.json().token).toString() });
      pm.request.url = pm.request.url.toString() + "?signed=1";
    `.replace(/^/, "(async () => {") + "})();",
    postRequestScript: `
      pm.test("status", () => pm.response.to.have.status(200));
      pm.test("chai", () => pm.expect(pm.response.json()).to.deep.include({ token: "t-123" }).and.to.have.property("items").that.has.lengthOf(2));
      pm.test("scopes", () => pm.expect([pm.variables.get("token"), pm.globals.get("seen"), pm.environment.name]).to.eql(["t-123", "prerequest Tripwire request", "Tripwire env"]));
      pm.test("the request as it was sent", () => pm.expect([pm.request.method, pm.request.headers.has("x-signed"), pm.request.url.getQueryString()]).to.eql(["POST", true, "signed=1"]));
      pm.test("its variables replaced (P3.9)", () => pm.expect([pm.request.url.getHost(), pm.request.headers.get("Authorization"), pm.request.headers.get("X-Stage"), request.url]).to.eql(["tripwire.test", "Bearer t-123", "before", "https://tripwire.test/items?signed=1"]));
      pm.test("cookies are not there", () => { pm.cookies.get("session"); });
    `,
  });
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await openTests(page);
  for (const name of ["status", "chai", "scopes", "the request as it was sent", "its variables replaced (P3.9)"]) {
    await expect(page.locator(".test-result-pass").getByText(name, { exact: true })).toBeVisible();
  }
  const failed = page.locator(".test-result-fail");
  await expect(failed).toHaveCount(1);
  await expect(failed).toContainText("pm.cookies.get() is not supported — see docs/postman-compatibility.md#pm-cookies");
  await expect(page.locator(".script-console")).toContainText("[pm.sendRequest] POST https://tripwire.test/login → 200");

  // The script's own request went first, with its variables replaced; then the user's, as the script left it.
  expect(hits.map((hit) => `${hit.method()} ${hit.url()}`)).toEqual(["POST https://tripwire.test/login", "POST https://tripwire.test/items?signed=1"]);
  expect(hits[0].postData()).toBe('{"user":"before"}');
  const sent = hits[1].headers();
  expect(sent["authorization"]).toBe("Bearer t-123");
  expect(sent["x-signed"]).toMatch(/^[0-9a-f]{64}$/);
  expect(sent["x-stage"]).toBe("before");
  // The composed request is what it was: the script changed what was sent, not what is saved.
  await expect(page.locator("input.address-url")).toHaveValue("https://{{host}}/items");
  expect(await violations()).toEqual([]);
  expect(errors).toEqual([]);
});

test("a script written for Postman's older sandbox runs as it is: postman.*, tests[...], responseBody and the rest", async ({ page }) => {
  const violations = await watchViolations(page);
  const hits = await captureTarget(page);
  await seedAndOpen(page, { stage: "before" }, {
    method: "GET",
    url: `${TARGET}/legacy`,
    headers: { "X-Stage": "{{stage}}" },
    preRequestScript: 'postman.setEnvironmentVariable("stage", "set-by-legacy-script"); postman.setGlobalVariable("legacy", "yes");',
    postRequestScript: `
      tests["status"] = responseCode.code === 200;
      tests["body"] = JSON.parse(responseBody).ok === true;
      tests["header"] = postman.getResponseHeader("Content-Type") === "application/json";
      tests["variables"] = postman.getEnvironmentVariable("stage") === "set-by-legacy-script" && globals.legacy === "yes" && environment.stage === "set-by-legacy-script";
      tests["request"] = request.method === "GET" && request.url.indexOf("/legacy") !== -1;
      tests["a test that fails"] = responseCode.code === 404;
    `,
  });
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await openTests(page);
  for (const name of ["status", "body", "header", "variables", "request"]) {
    await expect(page.locator(".test-result-pass").getByText(name, { exact: true })).toBeVisible();
  }
  const failed = page.locator(".test-result-fail");
  await expect(failed).toHaveCount(1);
  await expect(failed).toContainText("a test that fails");
  await expect(failed).toContainText("expected false to be truthy");
  expect(hits[0].headers()["x-stage"]).toBe("set-by-legacy-script");
  expect(await violations()).toEqual([]);
});

test("the page the server sends names neither the engine nor its worker", async () => {
  const index = await readFile("dist/wayfarer/browser/index.html", "utf8");
  expect(index).toContain("main-");
  expect(index).not.toMatch(/\.wasm|worker-[A-Z0-9]{8}\.js|quickjs|emscripten/i);
});
