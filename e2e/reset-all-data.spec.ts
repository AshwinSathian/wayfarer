import { test, expect, type Page } from "@playwright/test";
import { dumpIdb, openSettings } from "./support/app";

// P0.7 (F37, #94): Reset All Data used to report success while another tab
// kept the database open, and the data survived.

async function createCollection(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "New collection" }).first().click();
  await page.locator("#creation-name-input").fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

async function resetAllData(page: Page): Promise<void> {
  await openSettings(page, "Danger zone");
  await page.getByRole("button", { name: "Reset all data" }).click();
  await page.getByRole("button", { name: "Proceed", exact: true }).click();
}

test("@claim:C-013 Reset All Data in one tab deletes the data and tells the other tab to reload", async ({
  context,
}) => {
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await pageA.goto("/app/");
  await createCollection(pageA, "Reset me");
  await pageB.goto("/app/");
  await expect(pageB.getByText("Reset me", { exact: true })).toBeVisible();

  // Page A reloads only after a successful delete.
  const reloaded = pageA.waitForEvent("load");
  await resetAllData(pageA);
  await reloaded;

  await expect(pageB.getByText(/Data was reset in another tab/)).toBeVisible();
  await expect(pageA.getByText("Requests you save are kept here, in collections.")).toBeVisible();
  await expect(pageA.getByText("Reset me", { exact: true })).toHaveCount(0);
});

test("Reset All Data also clears the bridge token and the other wayfarer: preferences", async ({ page }) => {
  await page.goto("/app/");
  await page.evaluate(() => {
    localStorage.setItem(
      "wayfarer:bridge",
      JSON.stringify({ route: "bridge", url: "http://127.0.0.1:7717", token: "secret" }),
    );
    localStorage.setItem("elsewhere", "kept");
  });

  const reloaded = page.waitForEvent("load");
  await resetAllData(page);
  await reloaded;

  expect(await page.evaluate(() => localStorage.getItem("wayfarer:bridge"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("elsewhere"))).toBe("kept");
});

test("Reset All Data removes the composer's tabs: the page starts again with one empty tab", async ({ page }) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill("https://api.example.test/gone-after-reset");
  await page.getByRole("button", { name: "New tab" }).click();
  await page.locator("input.address-url").fill("https://api.example.test/also-gone");
  await expect.poll(async () => ((await dumpIdb(page))["tabs"] ?? []).length).toBe(2);
  expect(await page.evaluate(() => sessionStorage.getItem("wayfarer:open-tab"))).not.toBeNull();

  const reloaded = page.waitForEvent("load");
  await resetAllData(page);
  await reloaded;

  await expect(page.getByRole("tablist", { name: "Open requests" }).getByRole("tab")).toHaveCount(1);
  await expect(page.locator("input.address-url")).toHaveValue("");
  expect((await dumpIdb(page))["tabs"]).toEqual([]);
});
