import { test, expect } from "@playwright/test";
import { ECHO } from "./support/echo";

// U-002 and U-023 of docs/design/audit.md: how a request is sent (its route,
// redirects, the certificate check, what the browser does to it) is a tab of
// the request, as in Postman and Insomnia, not 250 px above every request.
test("a request's route, redirects and certificate check are in its Settings tab; a certificate check that is off shows from every tab", async ({ page }) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/echo`);

  const follow = page.getByRole("checkbox", { name: "Follow redirects" });
  await expect(follow).toBeHidden();
  await expect(page.getByText("What the browser does to this request")).toBeHidden();

  await page.getByRole("tab", { name: "Settings" }).click();
  await expect(follow).toBeVisible();
  await expect(page.locator("app-browser-notes .request-route")).toBeVisible();
  // The explanation is open in the tab: nothing to expand.
  await expect(page.locator("app-browser-notes .browser-note-adds")).toBeVisible();

  await page.getByRole("checkbox", { name: "Do not verify the server's certificate" }).check();
  await page.getByRole("tab", { name: "Headers" }).click();
  await expect(follow).toBeHidden();
  await expect(page.locator("app-request-warnings .tls-off-pill")).toHaveText("TLS verification off");
});

test("the Settings section opened on a phone is the Settings tab when the window widens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/");
  await page.getByRole("button", { name: "Settings", exact: true }).filter({ has: page.locator(".section-chevron") }).click();
  await expect(page.getByRole("checkbox", { name: "Follow redirects" })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("app-composer").getByRole("tab", { name: "Settings", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("checkbox", { name: "Follow redirects" })).toBeVisible();
});
