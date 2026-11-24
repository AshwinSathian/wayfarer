import { test, expect } from "@playwright/test";
import { PASSPHRASE, openSettings } from "./support/app";

// U-072, U-087 (D4-e): each item of the status bar is one button named by its words, a lock or an unlock is said,
// and the theme goes system, light and dark in turn, saying which it is.

test("the theme button says the choice it holds, and goes system, light, dark in turn", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const status = page.getByRole("contentinfo", { name: "Status" });
  const theme = status.getByRole("button", { name: /^Theme: / });
  await expect(theme).toHaveAccessibleName("Theme: system");
  await theme.click();
  await expect(theme).toHaveAccessibleName("Theme: light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await theme.click();
  await expect(theme).toHaveAccessibleName("Theme: dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await theme.click();
  await expect(theme).toHaveAccessibleName("Theme: system");
});

test("the vault's item is its state, and a lock or an unlock is said", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const status = page.getByRole("contentinfo", { name: "Status" });
  const said = page.locator(".vault-said");
  await expect(said).toHaveText("");
  await status.getByRole("button", { name: "Set up vault to store secrets", exact: true }).click();
  const create = page.getByRole("dialog", { name: "Set up vault", exact: true });
  await create.locator("input[type='password']").nth(0).fill(PASSPHRASE);
  await create.locator("input[type='password']").nth(1).fill(PASSPHRASE);
  await create.getByRole("button", { name: "Set up vault", exact: true }).click();
  await expect(said).toHaveText("Vault unlocked.");
  await status.getByRole("button", { name: "Vault unlocked", exact: true }).click();
  await expect(said).toHaveText("Vault locked.");
  await expect(status.getByRole("button", { name: "Vault locked", exact: true })).toBeVisible();
});

// D4.13 (U-088): the installed app's window is the canvas of the theme drawn, set before the page is drawn
// and again when the theme changes, whatever the system prefers.
test("the window's colour follows the app's theme, from the first paint", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("wayfarer:theme", "light"));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/app/");
  const colours = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) => meta.getAttribute("content")),
    );
  expect(await colours()).toEqual(["#FBFAF8", "#FBFAF8"]);
  await page
    .locator(".status-bar")
    .getByRole("button", { name: /^Theme: / })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await colours()).toEqual(["#161513", "#161513"]);
});

// Overhaul S3 (audit 21): the status bar says the setting, not what one send did, and whether the data is backed up.
test("the status bar names the route setting, and the vault's way in before a vault, then its two buttons", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const status = page.getByRole("contentinfo", { name: "Status" });
  await expect(status.getByRole("button", { name: "Route: Auto", exact: true })).toBeVisible();
  // One name, Vault: with none the button says what it is for, and the list of secrets has no button yet.
  await expect(status.getByRole("button", { name: "Secrets", exact: true })).toHaveCount(0);
  await status.getByRole("button", { name: "Set up vault to store secrets", exact: true }).click();
  const create = page.getByRole("dialog", { name: "Set up vault", exact: true });
  await create.locator("input[type='password']").nth(0).fill(PASSPHRASE);
  await create.locator("input[type='password']").nth(1).fill(PASSPHRASE);
  await create.getByRole("button", { name: "Set up vault", exact: true }).click();
  await expect(status.getByRole("button", { name: "Vault unlocked", exact: true })).toBeVisible();
  await expect(status.getByRole("button", { name: "Secrets", exact: true })).toBeVisible();
  await expect(status.getByRole("button", { name: "Set up vault to store secrets" })).toHaveCount(0);
});

test("@claim:C-098 the status bar says Not backed up, then how long ago the last backup was made, and keeps only that time", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const status = page.getByRole("contentinfo", { name: "Status" });
  // Safari's own seven days, and a browser that promised to keep the data, say their own words first.
  await expect(status).toContainText(/Not backed up|Kept in this browser|Kept by Safari/);
  const dialog = await openSettings(page, "Data and storage");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Back up workspace" }).click(),
  ]);
  await download.path();
  await page.keyboard.press("Escape");
  await expect(status).toContainText("Backed up today");
  // A time, in localStorage under the app's prefix, and nothing else of it (Reset all data takes every such key).
  const stored = await page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.includes("backup"))
      .map(([key, value]) => [key, Number(value) > 0]),
  );
  expect(stored).toContainEqual(["wayfarer:last-backup", true]);
  // Days later: "3 days ago".
  await page.evaluate(() => localStorage.setItem("wayfarer:last-backup", String(Date.now() - 3 * 86_400_000 - 1000)));
  await page.reload();
  await expect(page.getByRole("contentinfo", { name: "Status" })).toContainText("Backed up 3 days ago");
});
