import { test, expect } from "@playwright/test";

// P0.12: the page loads with zero CSP violations. On production this catches
// Cloudflare zone features that inject scripts (Bot Fight Mode / JavaScript
// Detections, Web Analytics, Rocket Loader, Email Obfuscation); see
// docs/runbook.md#cloudflare-zone. Tagged @smoke so synthetic.yml (P1.8) runs
// it against production every 6 hours. By hand:
// BASE_URL=https://wayfarer.ashwinsathian.com npx playwright test e2e/no-edge-injection.spec.ts
test("@claim @smoke no-edge-injection: page load triggers no CSP violations", async ({ page }) => {
  await page.addInitScript(() => {
    const violations: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = violations;
    document.addEventListener("securitypolicyviolation", (event) => {
      violations.push(`${event.effectiveDirective} ${event.blockedURI}`);
    });
  });

  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();
  await page.waitForLoadState("networkidle");

  const violations = await page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations
  );
  expect(violations).toEqual([]);
});
