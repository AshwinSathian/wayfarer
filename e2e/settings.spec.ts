import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

test.describe("Settings surface", () => {
  test("@claim:C-033 @claim:C-037 opens from the toolbar and toggles the theme", async ({ page }) => {
    await page.goto("/");
    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
      .not.toBe(initialTheme);
  });

  test("@claim:C-030 opens from the command palette", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Meta+K");
    await page.getByPlaceholder("Type a command").fill("Settings");
    await page.getByText("Settings", { exact: true }).click();
    await expect(page.getByPlaceholder("Type a command")).toBeHidden();
    await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
  });

  test("@claim:C-033 lists keyboard shortcuts, including live command palette actions", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings", exact: true }).click();

    await expect(page.getByText("Open the command palette")).toBeVisible();
    const paletteSummary = page.locator("summary", { hasText: "All command palette actions" });
    await expect(paletteSummary).toBeVisible();
    await paletteSummary.click();
    await expect(page.getByText("Local Bridge Settings", { exact: true })).toBeVisible();
  });

  test("@claim:C-033 Reset All Data requires confirmation and is reachable from Settings", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Reset all data" }).click();

    await expect(page.getByText("Reset all data?")).toBeVisible();
    // Cancel — this test only verifies the action is wired and gated behind
    // a real confirmation, not that data actually gets destroyed.
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText("Reset all data?")).toBeHidden();
  });

  test("@claim:C-033 Local Bridge settings are reachable from Settings", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Configure Local Bridge" }).click();
    // Settings closes itself when handing off, so name the dialog expected.
    await expect(page.getByRole("dialog", { name: "Local Bridge" })).toBeVisible();
  });

  test("@claim:C-033 exports environments as a JSON file", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings", exact: true }).click();

    const downloadPromise = page.waitForEvent("download");
    // Scoped: the environments panel has its own "Export environments" button.
    await page.getByRole("dialog").getByRole("button", { name: "Export environments" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("environments-export.json");
  });

  test("shows the app version from package.json (P0.11)", async ({ page }) => {
    const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    await page.goto("/");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByTestId("app-version")).toHaveText(version);
  });

  test("the Local Bridge checkbox is a real checkbox: Space and its label both toggle it", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Local Bridge settings" }).click();
    const checkbox = page.getByRole("checkbox", { name: /route requests through the bridge/i });
    await expect(checkbox).not.toBeChecked();

    await checkbox.focus();
    await page.keyboard.press("Space");
    await expect(checkbox).toBeChecked();

    await page.getByText("Route requests through the bridge").click();
    await expect(checkbox).not.toBeChecked();
  });

  test("a button reached with the keyboard shows the focus ring", async ({ page, browserName }) => {
    await page.goto("/");
    await page.locator("input.address-url").focus();
    // Safari moves focus to buttons with Option+Tab unless the user changed the default.
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");

    const focused = page.locator(":focus");
    await expect(focused).toHaveRole("button");
    expect(await focused.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
    expect(await focused.evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth))).toBeGreaterThanOrEqual(2);
  });
});
