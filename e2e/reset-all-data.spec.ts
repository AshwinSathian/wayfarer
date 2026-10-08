import { test, expect, type Page } from "@playwright/test";

// P0.7 (F37, #94): Reset All Data used to report success while another tab
// kept the database open, and the data survived.

async function createCollection(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "New collection" }).click();
  await page.locator("#creation-name-input").fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

async function resetAllData(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Reset all data" }).click();
  await page.getByRole("button", { name: "Proceed", exact: true }).click();
}

test("@claim:C-013 Reset All Data in one tab deletes the data and tells the other tab to reload", async ({ context }) => {
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await pageA.goto("/");
  await createCollection(pageA, "Reset me");
  await pageB.goto("/");
  await expect(pageB.getByText("Reset me", { exact: true })).toBeVisible();

  // Page A reloads only after a successful delete.
  const reloaded = pageA.waitForEvent("load");
  await resetAllData(pageA);
  await reloaded;

  await expect(pageB.getByText(/Data was reset in another tab/)).toBeVisible();
  await expect(pageA.getByText("No collections yet", { exact: false })).toBeVisible();
  await expect(pageA.getByText("Reset me", { exact: true })).toHaveCount(0);
});

test("Reset All Data also clears the bridge token and the other wayfarer: preferences", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("wayfarer:bridge", JSON.stringify({ enabled: true, url: "http://127.0.0.1:7717", token: "secret" }));
    localStorage.setItem("elsewhere", "kept");
  });

  const reloaded = page.waitForEvent("load");
  await resetAllData(page);
  await reloaded;

  expect(await page.evaluate(() => localStorage.getItem("wayfarer:bridge"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("elsewhere"))).toBe("kept");
});
