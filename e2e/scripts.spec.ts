import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { TARGET, captureTarget, expectProdParity, seedAndOpen, send } from "./support/app";

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
    preRequestScript: 'pm.environment.set("stage", "set-by-script"); pm.test("pre ran", () => pm.expect(pm.response).to.be.null());',
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
    preRequestScript: "pm.test('before the error', () => {}); notDefined();",
    postRequestScript: "eval('1'); new Function('return 1')(); pm.test('the engine has its own eval', () => {});",
  });
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await openTests(page);
  await expect(page.locator(".test-result-pass", { hasText: "before the error" })).toBeVisible();
  const failed = page.locator(".test-result-fail", { hasText: "Pre-request script" });
  await expect(failed).toBeVisible();
  await expect(failed).toContainText("'notDefined' is not defined");
  // eval inside the engine is the engine's, not the browser's: it runs, and the page's policy reports nothing.
  await expect(page.locator(".test-result-pass", { hasText: "the engine has its own eval" })).toBeVisible();
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

test("the page the server sends names neither the engine nor its worker", async () => {
  const index = await readFile("dist/wayfarer/browser/index.html", "utf8");
  expect(index).toContain("main-");
  expect(index).not.toMatch(/\.wasm|worker-[A-Z0-9]{8}\.js|quickjs|emscripten/i);
});
