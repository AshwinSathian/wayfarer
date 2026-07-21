import { test, expect } from "@playwright/test";

test.describe("Settings surface", () => {
  test("opens from the toolbar and toggles the theme", async ({ page }) => {
    await page.goto("/");
    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.locator(".p-dialog-title")).toHaveText("Settings");

    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
      .not.toBe(initialTheme);
  });

  test("opens from the command palette", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Meta+K");
    await page.getByPlaceholder("Type a command").fill("Settings");
    await page.getByText("Settings", { exact: true }).click();
    await expect(page.getByPlaceholder("Type a command")).toBeHidden();
    await expect(page.locator(".p-dialog-title")).toHaveText("Settings");
  });

  test("lists keyboard shortcuts, including live command palette actions", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings", exact: true }).click();

    await expect(page.getByText("Open the command palette")).toBeVisible();
    const paletteSummary = page.locator("summary", { hasText: "All command palette actions" });
    await expect(paletteSummary).toBeVisible();
    await paletteSummary.click();
    await expect(page.getByText("Local Bridge Settings", { exact: true })).toBeVisible();
  });

  test("Reset All Data requires confirmation and is reachable from Settings", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Reset all data" }).click();

    await expect(page.getByText("Reset all data?")).toBeVisible();
    // Cancel — this test only verifies the action is wired and gated behind
    // a real confirmation, not that data actually gets destroyed.
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText("Reset all data?")).toBeHidden();
  });

  test("Local Bridge settings are reachable from Settings", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Configure Local Bridge" }).click();
    // Settings closes itself when handing off — its own dialog title can
    // still be mid-close-transition in the DOM for a moment, so scope to
    // the Local Bridge dialog by its accessible name rather than any
    // ".p-dialog-title" on the page.
    await expect(page.getByRole("dialog", { name: "Local Bridge" })).toBeVisible();
  });

  test("exports environments as a JSON file", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings", exact: true }).click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export environments" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("environments-export.json");
  });
});
