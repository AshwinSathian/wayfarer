import { test, expect } from "@playwright/test";
import { closeEnvironments, openEnvironments, seedAndOpen } from "./support/app";

test.describe("Environments", () => {
  test("@claim:C-025 creates an environment, adds a variable, and resolves it as a live chip while typing the URL", async ({
    page,
  }) => {
    await page.goto("/app/");

    await openEnvironments(page);
    await page.getByRole("button", { name: "New environment" }).first().click();
    const nameInput = page.locator("#new-env-name-input");
    await nameInput.fill("E2E Env");
    await page.getByRole("button", { name: "Create environment" }).click();

    // Creating an environment auto-selects it as active — confirmed by its
    // name also appearing in the toolbar's environment switcher, which is
    // why this scopes to the environments list specifically rather than
    // asserting the text appears exactly once on the page.
    await expect(page.locator("app-environments-manager").getByText("E2E Env", { exact: true })).toBeVisible();

    // Add a variable in the Key/Value editor.
    await page.getByRole("button", { name: "Add variable" }).click();
    const keyInputs = page.locator("input[placeholder='KEY']");
    const valueInputs = page.locator("input[placeholder='Value']");
    await keyInputs.last().fill("baseHost");
    await valueInputs.last().fill("example.com");
    await page.getByRole("button", { name: "Save changes" }).click();
    await closeEnvironments(page);

    // Typing {{baseHost}} into the URL should resolve against the active
    // environment and stop flagging it as missing.
    const urlInput = page.locator("input.address-url");
    await urlInput.fill("https://{{baseHost}}/v1/resource");
    await expect(page.getByText("baseHost", { exact: false }).first()).toBeVisible();
    await expect(page.locator(".var-chip.var-missing")).toHaveCount(0);
  });
});

// U-001 and U-012 of docs/design/audit.md: the environments are a dialog, not the bottom of the page.
test("a click on an environment variable's chip opens the environments with that variable shown", async ({ page }) => {
  await seedAndOpen(page, { host: "example.com" }, { method: "GET", url: "https://{{host}}/x" });
  await expect(page.getByRole("dialog", { name: "Environments", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^host environment/ }).click();
  const dialog = page.getByRole("dialog", { name: "Environments", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("input[placeholder='KEY']")).toHaveValue("host");
  await expect(dialog.locator(".ring-2")).toHaveCount(1);
});
