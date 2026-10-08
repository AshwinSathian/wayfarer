import { test, expect } from "@playwright/test";

// @smoke: checks that run against a deployed site as well as the local
// build: a version preview URL before promotion and production afterwards
// (deploy.yml, P1.7), and production every 6 hours (synthetic.yml, P1.8).
// They need nothing but the site itself: no echo-server, no third party.
//
//   BASE_URL=https://wayfarer.ashwinsathian.com npx playwright test --grep @smoke
//
// EXPECTED_VERSION (optional) is the package.json version the site must show.

test("@smoke the app shell loads with production security headers", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const headers = response?.headers() ?? {};
  const directives = (headers["content-security-policy"] ?? "").split(";").map((d) => d.trim());
  expect(directives).toContain("script-src 'self'");
  expect(directives).toContain("require-trusted-types-for 'script'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  await expect(page.locator("input.address-url")).toBeVisible();

  const expected = process.env["EXPECTED_VERSION"];
  if (expected) {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByTestId("app-version")).toHaveText(expected);
  }
});

test("responses carry HSTS and the cross-origin isolation headers", async ({ request }) => {
  const headers = (await request.get("/")).headers();
  expect(headers["strict-transport-security"]).toBe("max-age=31536000");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
});

test("the licences of the bundled packages are served with the app", async ({ request }) => {
  const response = await request.get("/3rdpartylicenses.txt");
  expect(response.status()).toBe(200);
  const text = await response.text();
  for (const name of ["@angular/core", "monaco-editor", "rxjs", "idb"]) expect(text).toContain(`Package: ${name}`);
  // Projects bundled inside Monaco.
  for (const name of ["dompurify/LICENSE", "marked/LICENSE.md", "markedjs NOTICES"]) expect(text).toContain(name);
});

test("@smoke a request round-trips and renders", async ({ page, baseURL }) => {
  await page.goto("/");
  // The site's own manifest: same-origin, so no CORS and no third party.
  await page.locator("input.address-url").fill(`${baseURL}/manifest.webmanifest`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200");
  await expect(page.getByText('"Wayfarer"').first()).toBeVisible();
});

test("@smoke the service worker installs and serves the app offline", async ({ page, context, browserName }) => {
  await page.goto("/");
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller?.scriptURL.endsWith("/sw.js") ?? false;
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
