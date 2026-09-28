import { test, expect } from "@playwright/test";
import { ECHO } from "./support/echo";

// P1.9: the CSP requires Trusted Types for DOM script sinks
// (security/csp.json), and src/app/shared/security/trusted-types.ts installs
// the only default policy. A session through the main views must trigger no
// CSP violation, and an HTML string must still be rejected by innerHTML.

test("@claim:C-016 DOM script sinks require Trusted Types, and the app's own flows trigger no violation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    if (!/^ResizeObserver loop/.test(e.message)) errors.push(e.message);
  });
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __violations: string[] }).__violations = seen;
    document.addEventListener("securitypolicyviolation", (e) => seen.push(`${e.effectiveDirective} ${e.sample}`));
  });

  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toContain("require-trusted-types-for 'script'");
  await page.locator("input.address-url").fill(`${ECHO}/content/json?c016=1`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200");
  await page.getByRole("tab", { name: "Scripts", exact: true }).first().click();
  await expect(page.getByText("Loading editor…")).toHaveCount(0);
  for (const name of ["Settings", "Request history", "Manage secrets", "Local Bridge settings"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".p-dialog, .p-drawer").first()).toBeVisible();
    await page.keyboard.press("Escape");
  }
  const viewer = page.locator("app-response-viewer");
  await viewer.getByRole("tab", { name: "Headers" }).click();
  await viewer.getByRole("tab", { name: "Body" }).click();
  await expect(page.getByText("Loading editor…")).toHaveCount(0);

  expect(await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations)).toEqual([]);
  expect(errors).toEqual([]);

  const blocked = await page.evaluate(() => {
    const div = document.createElement("div");
    try {
      div.innerHTML = "<img src=x onerror=alert(1)>";
      return false;
    } catch (error) {
      return error instanceof TypeError;
    }
  });
  expect(blocked).toBe(true);
});
