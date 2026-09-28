import { test, expect, type Page } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIST = "dist/wayfarer/browser";

let root: string;
let server: ChildProcess;
let base: string;

test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "wayfarer-sw-"));
  await cp(DIST, root, { recursive: true });
  server = spawn(process.execPath, ["e2e/support/prod-server.mjs", root, "0"], { stdio: ["ignore", "pipe", "inherit"] });
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
  await page.goto(`${base}/`);
  await expect(page.locator("input.address-url")).toBeVisible();
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller?.scriptURL.endsWith("/sw.js") ?? false;
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

test("@claim:C-010 with the service worker in control, a DNS failure shows the real network error, not a 504", async ({ page }) => {
  await loadControlled(page);
  await page.locator("input.address-url").fill("https://wayfarer-sw-dns.invalid/");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText(/Network error/).first()).toBeVisible();
  await expect(page.locator(".status-badge")).not.toHaveText("504");
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
  const index = join(root, "index.html");
  await writeFile(index, (await readFile(index, "utf8")).replace("</head>", "<!-- deploy 2 --></head>"));
  execFileSync(process.execPath, ["scripts/build-sw.mjs", root]);
  const version = /version":"([0-9a-f]+)/.exec(await readFile(join(root, "sw.js"), "utf8"))?.[1];

  await page.goto(`${base}/`);
  const banner = page.getByRole("status").filter({ hasText: "Update available" });
  await expect(banner).toBeVisible();

  const reloaded = page.waitForEvent("load");
  await banner.getByRole("button", { name: "Reload" }).click();
  await reloaded;
  await expect(page.getByRole("status").filter({ hasText: "Update available" })).toHaveCount(0);
  expect(await page.evaluate(() => caches.keys())).toEqual([`wayfarer-${version}`]);
});

test("a registration left by the pre-v1.1.0 Angular worker is gone after one navigation", async ({ page }) => {
  await page.goto(`${base}/`);
  // A returning pre-v1.1.0 visitor: a registration for /ngsw-worker.js plus
  // an ngsw cache. /ngsw-worker.js is permanently the safety worker (P0.5).
  await page.evaluate(async () => {
    await (await caches.open("ngsw:/:db:control")).put("/x", new Response("x"));
    const registration = await navigator.serviceWorker.register("/ngsw-worker.js");
    const worker = registration.installing ?? registration.waiting ?? registration.active;
    await new Promise<void>((resolve) => {
      // Firefox never reports "activated" for a worker that unregisters
      // itself while activating; "activating" already means it took over.
      const settled = () => ["activating", "activated", "redundant"].includes(worker?.state ?? "");
      if (!worker || settled()) return resolve();
      worker.addEventListener("statechange", () => settled() && resolve());
    });
  });

  await page.goto(`${base}/`);
  await expect(page.locator("input.address-url")).toBeVisible();
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => (r.active ?? r.installing ?? r.waiting)?.scriptURL ?? "")))
    .toEqual([`${base}/sw.js`]);
  expect((await page.evaluate(() => caches.keys())).filter((k) => k.startsWith("ngsw:"))).toEqual([]);
});

test("the kill switch (scripts/sw-kill.js deployed as sw.js) removes the worker and its caches", async ({ page }) => {
  await loadControlled(page);
  await cp("scripts/sw-kill.js", join(root, "sw.js"));
  await page.goto(`${base}/`);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
});
