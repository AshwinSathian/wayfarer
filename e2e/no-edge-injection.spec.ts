import { test, expect, type Page } from "@playwright/test";

// What runs on the production page is the app's own scripts. synthetic.yml (P1.8) runs both tests below against
// production every 6 hours (`@smoke`). By hand:
// BASE_URL=https://wayfarer.ashwinsathian.com npx playwright test e2e/no-edge-injection.spec.ts

async function loadApp(page: Page): Promise<{ violations: string[]; foreign: string[] }> {
  await page.addInitScript(() => {
    const violations: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = violations;
    document.addEventListener("securitypolicyviolation", (event) => {
      violations.push(`${event.effectiveDirective} ${event.blockedURI}`);
    });
  });
  await page.goto("/app/");
  await expect(page.locator("input.address-url")).toBeVisible();
  await page.waitForLoadState("networkidle");
  return page.evaluate(() => ({
    violations: (window as unknown as { __cspViolations: string[] }).__cspViolations,
    // A script that was fetched ran or was about to: one from another origin, or the host's own (`/cdn-cgi/`), is not
    // the app's. A script the policy blocked is never fetched, so it is not here.
    foreign: performance
      .getEntriesByType("resource")
      .filter((entry) => (entry as PerformanceResourceTiming).initiatorType === "script")
      .map((entry) => new URL(entry.name))
      .filter((url) => url.origin !== location.origin || url.pathname.startsWith("/cdn-cgi/"))
      .map((url) => url.href),
  }));
}

// C-012: no script but the app's runs. A script the host adds on the way (Cloudflare's bot detection, today) is
// blocked by the Content-Security-Policy, and its block is the only kind of violation allowed: a Trusted Types or any
// other violation fails.
test("@claim:C-012 @smoke only-own-scripts: no script but the app's runs, and the CSP blocks any other", async ({
  page,
}) => {
  const { violations, foreign } = await loadApp(page);
  expect(foreign).toEqual([]);
  for (const violation of violations) expect(violation).toMatch(/^script-src/);
});

// P0.12, stricter: nothing is even blocked, so the zone injects nothing (Bot Fight Mode / JavaScript Detections, Web
// Analytics, Rocket Loader, Email Obfuscation; docs/runbook.md#cloudflare-zone). Skipped on production until the
// repository variable ZONE_HARDENED is true.
test("@smoke no-edge-injection: page load triggers no CSP violations", async ({ page }) => {
  const { violations } = await loadApp(page);
  expect(violations).toEqual([]);
});
