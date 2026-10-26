import { test, expect, type Page } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedAndOpen, send } from "./support/app";

// The deploy: the site at its root and the app, with its worker, under app/ (W1).
const DIST = "dist/deploy";

// The worker only exists in the production build (npm run build).
test.skip(!existsSync(join(DIST, "app/sw.js")), "needs the production build: run `npm run build` (CI=1 does it)");

let root: string;
let server: ChildProcess;
let base: string;

test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "wayfarer-sw-"));
  await cp(DIST, root, { recursive: true });
  server = spawn(process.execPath, ["e2e/support/prod-server.mjs", root, "0"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  base = await new Promise<string>((resolve, reject) => {
    server.once("exit", (code) => reject(new Error(`prod-server exited with ${code}`)));
    server.stdout?.on("data", (chunk: Buffer) => {
      const match = /on (http:\/\/localhost:\d+)/.exec(String(chunk));
      if (match) resolve(match[1]);
    });
  });
});

test.afterEach(async () => {
  server.kill();
  await rm(root, { recursive: true, force: true });
});

/** Loads the app and waits until the service worker controls the page. */
async function loadControlled(page: Page): Promise<void> {
  await page.goto(`${base}/app/`);
  await expect(page.locator("input.address-url")).toBeVisible();
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller?.scriptURL.endsWith("/app/sw.js") ?? false;
  });
}

test("@claim:C-015 the app loads with the network disabled after one visit", async ({ page, context, browserName }) => {
  await loadControlled(page);
  // The site is unreachable, and (except in WebKit) the browser is offline.
  // Playwright's WebKit offline emulation also breaks navigations that a
  // service worker answers ("WebKit encountered an internal error"), so there
  // only the server is stopped.
  server.kill();
  await new Promise((resolve) => server.once("exit", resolve));
  if (browserName !== "webkit") await context.setOffline(true);
  await page.reload();
  await expect(page.locator("input.address-url")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send request" })).toBeVisible();
});

test("@claim:C-015 offline after one visit, every script that visit loaded is there, the lazy ones too: the editor opens (F84)", async ({
  page,
  context,
  browserName,
}) => {
  await loadControlled(page);
  // The editor's files are not in index.html: the page asks for them when an editor is first shown (P7.2:
  // not at load), here the Scripts tab's. Firefox mounts it some seconds in.
  const scriptsTab = page.locator(".composer-pane").getByRole("tab", { name: "Scripts", exact: true });
  const editor = page.locator("app-scripts-panel .monaco-editor").first();
  await scriptsTab.click();
  await expect(editor).toBeAttached({ timeout: 15_000 });
  // On a first visit they were loaded before the worker took control, and the page hands them to it afterwards.
  const scripts = () =>
    page.evaluate(async () => {
      const loaded = performance.getEntriesByType("resource").map((entry) => new URL(entry.name));
      // Every script but the worker's own file, which a browser never takes from a worker's cache.
      const paths = loaded
        .filter(
          (url) => url.origin === location.origin && url.pathname.endsWith(".js") && url.pathname !== "/app/sw.js",
        )
        .map((url) => url.pathname);
      const kept = await Promise.all(paths.map((path) => caches.match(path)));
      return { loaded: paths, notKept: paths.filter((_, index) => !kept[index]) };
    });
  await expect.poll(async () => (await scripts()).notKept).toEqual([]);
  const { loaded } = await scripts();
  expect(loaded.filter((path) => path.startsWith("/app/chunk-")).length).toBeGreaterThan(5);
  server.kill();
  await new Promise((resolve) => server.once("exit", resolve));
  if (browserName !== "webkit") await context.setOffline(true);
  const failed: string[] = [];
  page.on("requestfailed", (request) => failed.push(new URL(request.url()).pathname));
  await page.reload();
  await scriptsTab.click();
  await expect(editor).toBeAttached({ timeout: 15_000 });
  // A file the page had not asked for before the network went (a language's worker, fetched when the editor is
  // first idle) is not kept, and fails now. What the visit did load must not.
  expect(failed.filter((path) => loaded.includes(path))).toEqual([]);
});

test("@claim:C-015 navigating to a non-HTML file doesn't replace the offline app shell", async ({
  page,
  context,
  browserName,
}) => {
  await loadControlled(page);
  // Served same-origin as text/markdown and text/plain, in the worker's scope: never the app shell.
  await page.goto(`${base}/app/THIRD_PARTY_NOTICES.md`);
  await page.goto(`${base}/app/3rdpartylicenses.txt`);
  server.kill();
  await new Promise((resolve) => server.once("exit", resolve));
  if (browserName !== "webkit") await context.setOffline(true);
  await page.goto(`${base}/app/`);
  await expect(page.locator("input.address-url")).toBeVisible();
});

// F69: every HTML answer to a navigation was stored as the app's shell. The
// OAuth callback page (P4.7) is the app's second HTML page.
test("@claim:C-015 after an OAuth sign-in came back to the callback page, the offline app is still the app", async ({
  page,
  context,
  browserName,
}) => {
  await loadControlled(page);
  await page.goto(`${base}/app/oauth/callback?code=c-1&state=s-1`);
  await expect(page.getByText("Wayfarer has not answered.")).toBeVisible();
  server.kill();
  await new Promise((resolve) => server.once("exit", resolve));
  if (browserName !== "webkit") await context.setOffline(true);
  await page.goto(`${base}/app/`);
  await expect(page.locator("input.address-url")).toBeVisible();
});

test("@claim:C-015 a script runs with the network disabled after one run online", async ({
  page,
  context,
  browserName,
}) => {
  const script = {
    method: "GET",
    url: "http://127.0.0.1:4300/content/json?c015=script",
    preRequestScript:
      "pm.test('ran in the engine', () => pm.expect(require('lodash').chunk([1, 2, 3], 2).length).to.equal(2));",
  };
  await loadControlled(page);
  await seedAndOpen(page, {}, script, base);
  const tests = page.locator("app-response-viewer").getByRole("tab", { name: /Tests/ });
  const ran = page.locator(".test-result-pass", { hasText: "ran in the engine" });
  await send(page);
  await tests.click();
  await expect(ran).toBeVisible();
  // The engine, its worker, the worker's chunks and the library the script requires were fetched once and are in the worker's cache now.
  const cached = await page.evaluate(async () =>
    (await (await caches.open((await caches.keys())[0])).keys()).map((r) => new URL(r.url).pathname),
  );
  expect(cached.filter((path) => /^\/app\/media\/emscripten-module-[A-Z0-9]{8}\.wasm$/.test(path))).toHaveLength(1);

  server.kill();
  await new Promise((resolve) => server.once("exit", resolve));
  if (browserName !== "webkit") await context.setOffline(true);
  await page.reload();
  await page.getByRole("tree").getByText("Tripwire request", { exact: true }).click();
  await expect(page.locator("input.address-url")).toHaveValue(script.url);
  await expect(ran).toHaveCount(0);
  await send(page);
  await tests.click();
  await expect(ran).toBeVisible();
});

test("@claim:C-010 with the service worker in control, a DNS failure shows the real network error, not a 504", async ({
  page,
}) => {
  await loadControlled(page);
  await page.locator("input.address-url").fill("https://wayfarer-sw-dns.invalid/");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".response-failure").getByText(/^The request got no response/)).toBeVisible();
  // No status is drawn when none came (U-051), a synthetic 504 least of all.
  await expect(page.locator(".response-status")).toContainText("No response");
  await expect(page.locator(".response-status")).not.toContainText("504");
});

test("@claim:C-015 the service worker never answers cross-origin requests", async ({ page, browserName }) => {
  await loadControlled(page);
  const responses: { url: string; fromWorker: boolean }[] = [];
  page.on("response", (r) => responses.push({ url: r.url(), fromWorker: r.fromServiceWorker() }));
  await page.reload();
  await page.locator("input.address-url").fill("http://127.0.0.1:4300/content/json?c015=1");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200");

  const crossOrigin = responses.filter((r) => r.url.startsWith("http://127.0.0.1:4300/"));
  expect(crossOrigin.length).toBeGreaterThan(0);
  expect(crossOrigin.filter((r) => r.fromWorker)).toEqual([]);
  // Playwright reports fromServiceWorker() only in Chromium; there, prove the
  // check can see the worker at all: same-origin hashed assets come from it.
  if (browserName === "chromium") {
    expect(responses.some((r) => r.url.startsWith(base) && /-[A-Z0-9]{8}\.js$/.test(r.url) && r.fromWorker)).toBe(true);
  }
});

test("a new deploy shows 'Update available' within one navigation, and Reload switches to it", async ({ page }) => {
  await loadControlled(page);

  // Simulate a deploy: new index.html content, regenerated worker manifest.
  const index = join(root, "app/index.html");
  await writeFile(index, (await readFile(index, "utf8")).replace("</head>", "<!-- deploy 2 --></head>"));
  execFileSync(process.execPath, ["scripts/build-sw.mjs", join(root, "app")]);
  const version = /version":"([0-9a-f]+)/.exec(await readFile(join(root, "app/sw.js"), "utf8"))?.[1];

  await page.goto(`${base}/app/`);
  const banner = page.getByRole("status").filter({ hasText: "Update available" });
  await expect(banner).toBeVisible();

  const reloaded = page.waitForEvent("load");
  await banner.getByRole("button", { name: "Reload" }).click();
  await reloaded;
  await expect(page.getByRole("status").filter({ hasText: "Update available" })).toHaveCount(0);
  expect(await page.evaluate(() => caches.keys())).toEqual([`wayfarer-${version}`]);
});

test("the kill switch (scripts/sw-kill.js deployed as sw.js) removes the worker and its caches", async ({ page }) => {
  await loadControlled(page);
  await cp("scripts/sw-kill.js", join(root, "app/sw.js"));
  await page.goto(`${base}/app/`);
  // The kill switch reloads open tabs, so evaluate only once the page settles.
  const settled = async <T>(fn: () => Promise<T>): Promise<T | "navigating"> => {
    await page.waitForLoadState();
    return page.evaluate(fn).catch((error: Error) => {
      if (/context was destroyed|navigat/i.test(error.message)) return "navigating" as const;
      throw error;
    });
  };
  // The browser looks for a new worker on its own schedule after a navigation: about 3 s on a laptop, longer on a
  // CI runner, and a second more when the page changes its theme as it starts (F85). The outcome is what is
  // asserted, not the time (plan R6), so the wait is long.
  await expect
    .poll(() => settled(async () => (await navigator.serviceWorker.getRegistrations()).length), { timeout: 30_000 })
    .toBe(0);
  await expect.poll(() => settled(() => caches.keys()), { timeout: 30_000 }).toEqual([]);
});
