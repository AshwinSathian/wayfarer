import { test, expect } from "@playwright/test";

test.describe("Secrets vault", () => {
  test("@claim:C-027 first-use flow: create a vault passphrase, then it's usable to lock/unlock", async ({ page }) => {
    await page.goto("/app/");

    await page.getByRole("button", { name: "Vault locked", exact: true }).click();
    await expect(page.getByText("Create vault passphrase")).toBeVisible();

    const passphraseInputs = page.locator("input[type='password']");
    await passphraseInputs.nth(0).fill("correct horse battery staple");
    await passphraseInputs.nth(1).fill("correct horse battery staple");
    await page.getByRole("button", { name: "Create vault" }).click();

    // Vault is now unlocked — the toolbar button flips to the "lock" state.
    await expect(page.getByRole("button", { name: "Vault unlocked", exact: true })).toBeVisible();

    // Locking it should flip the toolbar state back.
    await page.getByRole("button", { name: "Vault unlocked", exact: true }).click();
    await expect(page.getByRole("button", { name: "Vault locked", exact: true })).toBeVisible();

    // The passphrase is the vault's from now on, also before any secret is
    // stored: opening the dialog again asks for it, not for a new one.
    await page.getByRole("button", { name: "Vault locked", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Unlock secrets", exact: true })).toBeVisible();
  });

  test("rejects a mismatched passphrase confirmation on first use", async ({ page }) => {
    await page.goto("/app/");

    await page.getByRole("button", { name: "Vault locked", exact: true }).click();
    const passphraseInputs = page.locator("input[type='password']");
    await passphraseInputs.nth(0).fill("first passphrase here");
    await passphraseInputs.nth(1).fill("a different passphrase");
    await page.getByRole("button", { name: "Create vault" }).click();

    await expect(page.getByRole("alert").filter({ hasText: /do not match/i })).toBeVisible();
  });
});
