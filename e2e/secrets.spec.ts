import { test, expect } from "@playwright/test";

test.describe("Secrets vault", () => {
  test("first-use flow: create a vault passphrase, then it's usable to lock/unlock", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Unlock secrets" }).click();
    await expect(page.getByText("Create vault passphrase")).toBeVisible();

    const passphraseInputs = page.locator("input[type='password']");
    await passphraseInputs.nth(0).fill("correct horse battery staple");
    await passphraseInputs.nth(1).fill("correct horse battery staple");
    await page.getByRole("button", { name: "Create vault" }).click();

    // Vault is now unlocked — the toolbar button flips to the "lock" state.
    await expect(page.getByRole("button", { name: "Lock secrets" })).toBeVisible();

    // Locking it should flip the toolbar state back.
    await page.getByRole("button", { name: "Lock secrets" }).click();
    await expect(page.getByRole("button", { name: "Unlock secrets" })).toBeVisible();

    // Nothing is actually persisted to the vault just from setting a
    // passphrase — no secret has been encrypted yet — so re-opening the
    // dialog correctly asks to create the vault again rather than treating
    // this as a returning user. (hasAnySecrets() only becomes true once a
    // variable is actually protected via the environments editor's lock
    // icon; that's covered by its own flow, not this one.)
    await page.getByRole("button", { name: "Unlock secrets" }).click();
    await expect(page.locator(".p-dialog-title")).toHaveText("Create vault passphrase");
  });

  test("rejects a mismatched passphrase confirmation on first use", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Unlock secrets" }).click();
    const passphraseInputs = page.locator("input[type='password']");
    await passphraseInputs.nth(0).fill("first passphrase here");
    await passphraseInputs.nth(1).fill("a different passphrase");
    await page.getByRole("button", { name: "Create vault" }).click();

    await expect(page.getByText(/do not match/i)).toBeVisible();
  });
});
