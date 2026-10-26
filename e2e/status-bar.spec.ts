import { test, expect } from "@playwright/test";
import { PASSPHRASE } from "./support/app";

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
  await status.getByRole("button", { name: "Vault locked", exact: true }).click();
  const create = page.getByRole("dialog", { name: "Create vault passphrase", exact: true });
  await create.locator("input[type='password']").nth(0).fill(PASSPHRASE);
  await create.locator("input[type='password']").nth(1).fill(PASSPHRASE);
  await create.getByRole("button", { name: "Create vault" }).click();
  await expect(said).toHaveText("Vault unlocked.");
  await status.getByRole("button", { name: "Vault unlocked", exact: true }).click();
  await expect(said).toHaveText("Vault locked.");
  await expect(status.getByRole("button", { name: "Vault locked", exact: true })).toBeVisible();
});
