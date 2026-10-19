import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { openSettings } from "./support/app";

// @smoke: checks that run against a deployed site as well as the local
// build: a version preview URL before promotion and production afterwards
// (deploy.yml, P1.7), and production every 6 hours (synthetic.yml, P1.8).
// They need nothing but the site itself: no echo-server, no third party.
//
//   BASE_URL=https://wayfarer.ashwinsathian.com npx playwright test --grep @smoke
//
// EXPECTED_VERSION (optional) is the package.json version the site must show.

test("@smoke the app shell loads with production security headers", async ({ page }) => {
  const response = await page.goto("/app/");
  expect(response?.status()).toBe(200);
  const headers = response?.headers() ?? {};
  const directives = (headers["content-security-policy"] ?? "").split(";").map((d) => d.trim());
  expect(directives).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(directives).toContain("require-trusted-types-for 'script'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  await expect(page.locator("input.address-url")).toBeVisible();

  const expected = process.env["EXPECTED_VERSION"];
  if (expected) {
    await openSettings(page, "About");
    await expect(page.getByTestId("app-version")).toHaveText(expected);
  }
});

test("responses carry HSTS and the cross-origin isolation headers, the site's and the app's", async ({ request }) => {
  for (const path of ["/", "/app/"]) {
    const headers = (await request.get(path)).headers();
    expect(headers["strict-transport-security"], path).toBe("max-age=31536000");
    expect(headers["cross-origin-opener-policy"], path).toBe("same-origin");
    expect(headers["cross-origin-resource-policy"], path).toBe("same-origin");
  }
});

// W1 (PLAN-design.md): the site at / has a policy of its own, stricter than the app's, which it does not carry. Since
// PLAN-design 1.8 it runs script from its own files, never inline.
test("@smoke the site at / runs script from its own files only and links to the app at /app/", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const policy = response?.headers()["content-security-policy"] ?? "";
  expect(policy.split(";").map((d) => d.trim())).toContain("default-src 'none'");
  expect(policy.split(";").map((d) => d.trim())).toContain("script-src 'self'");
  expect(policy).not.toMatch(/unsafe-inline|unsafe-eval/);
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  await expect(page.getByRole("link", { name: "Open Wayfarer" }).first()).toHaveAttribute("href", "/app/");
});

// The synthetic monitor reads which release production runs from /version.json, and runs that release's tests
// (scripts/deployed-release.mjs).
test("@smoke /version.json names the release that is served", async ({ page }) => {
  // From GitHub's runners Cloudflare challenges a client that runs no script: load a page first, and ask with its
  // cookies.
  await page.goto("/");
  const response = await page.request.get("/version.json");
  expect(response.status()).toBe(200);
  const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  expect(await response.json()).toEqual({ version });
});

test("the licences of the bundled packages are served with the app", async ({ request }) => {
  const response = await request.get("/app/3rdpartylicenses.txt");
  expect(response.status()).toBe(200);
  const text = await response.text();
  for (const name of ["@angular/core", "monaco-editor", "rxjs", "idb"]) expect(text).toContain(`Package: ${name}`);
  // Projects bundled inside Monaco.
  for (const name of ["dompurify/LICENSE", "marked/LICENSE.md", "markedjs NOTICES"]) expect(text).toContain(name);
});

test("@smoke a request round-trips and renders", async ({ page, baseURL }) => {
  await page.goto("/app/");
  // The app's own manifest: same-origin, so no CORS and no third party.
  await page.locator("input.address-url").fill(`${baseURL}/app/manifest.webmanifest`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200");
  await expect(page.getByText('"Wayfarer"').first()).toBeVisible();
});

test("@smoke the service worker installs and serves the app offline", async ({ page, context, browserName }) => {
  await page.goto("/app/");
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller?.scriptURL.endsWith("/app/sw.js") ?? false;
  });
  // Playwright's WebKit offline emulation breaks worker-served navigations
  // (see e2e/service-worker.spec.ts, which covers WebKit by stopping the server).
  test.skip(browserName === "webkit", "offline emulation is unreliable in Playwright WebKit");
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("input.address-url")).toBeVisible();
});

// Deploy drill (P1.7 AC): `Run workflow` with drill_failing_smoke sets
// SMOKE_DRILL_FAIL=1 for the preview smoke only, which must then stop the
// deploy before promotion and leave production on its previous version.
test("@smoke deploy drill: fails on purpose when SMOKE_DRILL_FAIL=1", () => {
  test.skip(!process.env["SMOKE_DRILL_FAIL"], "only during a deploy drill");
  expect("deploy drill", "SMOKE_DRILL_FAIL=1: failing on purpose").toBe("a normal deploy");
});
