import { test, expect } from "@playwright/test";

test.describe("Secrets management view", () => {
  test("opens from the toolbar and shows an empty state with no secrets", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Manage secrets" }).click();
    await expect(page.locator(".p-dialog-title")).toHaveText("Secrets");
    await expect(page.getByText("No secrets yet")).toBeVisible();
  });

  test("opens from the command palette", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Meta+K");
    await expect(page.getByPlaceholder("Type a command")).toBeVisible();
    await page.getByPlaceholder("Type a command").fill("Manage Secrets");
    await page.getByText("Manage Secrets", { exact: true }).click();
    await expect(page.getByPlaceholder("Type a command")).toBeHidden();
    await expect(page.locator(".p-dialog-title")).toHaveText("Secrets");
  });

  test("lists a protected variable, supports reveal, rename, locate, and delete", async ({ page }) => {
    await page.goto("/");

    // Create an environment with one variable.
    await page.getByRole("button", { name: "New environment" }).click();
    await page.locator("#new-env-name-input").fill("Secrets E2E Env");
    await page.getByRole("button", { name: "Create environment" }).click();
    await expect(page.locator(".env-item", { hasText: "Secrets E2E Env" })).toBeVisible();

    // Scoped to the environment editor's own KEY/Value inputs (exact,
    // case-sensitive match) — the composer's Params tab has its own
    // lowercase "key"/"value" placeholders always mounted (PrimeNG's
    // p-tabs keeps every tabpanel's content in the DOM, [hidden] on the
    // inactive ones rather than removing it), which a loose/case-
    // insensitive placeholder match would otherwise collide with.
    await page.getByRole("button", { name: "Add variable" }).click();
    await page.getByPlaceholder("KEY", { exact: true }).fill("API_TOKEN");
    await page.getByPlaceholder("Value", { exact: true }).fill("super-secret-value");

    // Unlock the vault (first-use flow) before protecting the variable.
    await page.getByRole("button", { name: "Mark variable as secret" }).click();
    await expect(page.getByText("Create vault passphrase")).toBeVisible();
    const passphraseInputs = page.locator("input[type='password']");
    await passphraseInputs.nth(0).fill("correct horse battery staple");
    await passphraseInputs.nth(1).fill("correct horse battery staple");
    await page.getByRole("button", { name: "Create vault" }).click();
    await expect(page.getByRole("button", { name: "Lock secrets" })).toBeVisible();

    // Protecting the variable didn't happen automatically after unlocking —
    // the click that triggered the unlock dialog didn't itself protect the
    // variable, so do it again now that the vault is open.
    await page.getByRole("button", { name: "Mark variable as secret" }).click();
    await expect(page.getByText("Secret stored")).toBeVisible();

    // Protecting a variable only updates the in-editor draft — persist it so
    // EnvironmentsService (and therefore the Secrets view's usage
    // cross-reference) actually picks up the {{$secret.<id>}} reference.
    await page.getByRole("button", { name: "Save changes" }).click();

    // Open the Secrets view and verify the new secret is listed with its usage.
    await page.getByRole("button", { name: "Manage secrets" }).click();
    await expect(page.locator(".p-dialog-title")).toHaveText("Secrets");
    await expect(page.getByText("API_TOKEN", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Locate API_TOKEN in environment Secrets E2E Env/ })).toBeVisible();

    // Reveal.
    await page.getByRole("button", { name: "Reveal value for API_TOKEN" }).click();
    await expect(page.getByText("super-secret-value")).toBeVisible();
    await page.getByRole("button", { name: "Hide value for API_TOKEN" }).click();
    await expect(page.getByText("super-secret-value")).toBeHidden();

    // Rename.
    await page.getByRole("button", { name: "Rename API_TOKEN" }).click();
    await page.getByLabel("Secret name").fill("Renamed Token");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByText("Renamed Token", { exact: true })).toBeVisible();

    // Delete (routed through the app's global confirm dialog — its headless
    // template always renders "Proceed"/"Cancel" regardless of the
    // acceptLabel passed to ConfirmationService, see app-shell.component.html).
    await page.getByRole("button", { name: "Delete Renamed Token" }).click();
    await page.getByRole("button", { name: "Proceed", exact: true }).click();
    await expect(page.getByText("No secrets yet")).toBeVisible();
  });
});
