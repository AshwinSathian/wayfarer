import { expect, test } from "@playwright/test";
import { ECHO } from "./support/echo";

// D4.2 of PLAN-design.md, U-022: from an empty app to a first response, and empty places that offer the next step.

test("the caret starts in the address, and Enter sends: a first response is the address and one key", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const address = page.locator("input.address-url");
  await expect(address).toBeFocused();
  await page.keyboard.type(`${ECHO}/content/json?first=run`);
  await page.keyboard.press("Enter");
  await expect(page.locator(".status-badge")).toHaveText("200");
});

test("on a phone the address waits for a tap: focus would open the keyboard over the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/");
  await expect(page.locator("input.address-url")).toBeVisible();
  await expect(page.locator("input.address-url")).not.toBeFocused();
});

test("the empty response offers a cURL command and an import, and the empty sidebar a collection and an import", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const response = page.locator(".response-pane");
  await expect(response).toContainText("Send a request and its response shows here.");
  await response.getByRole("button", { name: "Paste a cURL command" }).click();
  const paste = page.getByRole("dialog", { name: "Import" });
  await expect(paste.getByRole("textbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(paste).toHaveCount(0);

  const chooser = page.waitForEvent("filechooser");
  await response.getByRole("button", { name: "Import a collection…" }).click();
  await chooser;

  const sidebar = page.locator("app-collections-sidebar");
  await expect(sidebar).toContainText("Requests you save are kept here, in collections.");
  await sidebar.getByRole("button", { name: "New collection", exact: true }).last().click();
  await expect(page.getByRole("dialog", { name: "New Collection" })).toBeVisible();
});
