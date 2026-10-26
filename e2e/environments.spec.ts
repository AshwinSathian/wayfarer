import { test, expect, type Locator, type Page } from "@playwright/test";
import { closeEnvironments, dumpIdb, openEnvironments, PASSPHRASE, seedAndOpen } from "./support/app";

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
    // Written as focus leaves the field: there is no Save button (DQ9).
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

// U-060 and D4.11's AC (DQ9): the editor writes as it goes. Whichever way it is left, the edit is there when it opens again.
test.describe("the environment editor keeps what was typed", () => {
  async function twoEnvironments(page: Page): Promise<Locator> {
    await page.goto("/app/");
    const dialog = await openEnvironments(page);
    for (const name of ["First", "Second"]) {
      await dialog.getByRole("button", { name: "New environment" }).first().click();
      await page.locator("#new-env-name-input").fill(name);
      await page.getByRole("button", { name: "Create environment" }).click();
      await expect(page.locator("#new-env-name-input")).toHaveCount(0);
    }
    await dialog.locator(".env-item-select", { hasText: "First" }).click();
    await dialog.getByRole("button", { name: "Add variable" }).click();
    // Add variable puts the keyboard in the new row (U-145).
    await expect(dialog.getByPlaceholder("KEY", { exact: true })).toBeFocused();
    await page.keyboard.type("host");
    await dialog.getByPlaceholder("Value", { exact: true }).fill("typed.example");
    return dialog;
  }

  async function expectKept(page: Page): Promise<void> {
    const dialog = await openEnvironments(page);
    await dialog.locator(".env-item-select", { hasText: "First" }).click();
    await expect(dialog.getByPlaceholder("Value", { exact: true })).toHaveValue("typed.example");
    await expect.poll(async () => JSON.stringify((await dumpIdb(page))["environments"])).toContain("typed.example");
  }

  test("closed with ×", async ({ page }) => {
    const dialog = await twoEnvironments(page);
    await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
    await expect(dialog).toHaveCount(0);
    await expectKept(page);
  });

  test("closed with Escape", async ({ page }) => {
    const dialog = await twoEnvironments(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expectKept(page);
  });

  test("left for another environment", async ({ page }) => {
    const dialog = await twoEnvironments(page);
    await dialog.locator(".env-item-select", { hasText: "Second" }).click();
    await expect(dialog.getByPlaceholder("KEY", { exact: true })).toHaveCount(0);
    await page.reload();
    await expectKept(page);
  });

  test("a row with a value and no name says it is not kept", async ({ page }) => {
    const dialog = await twoEnvironments(page);
    await dialog.getByPlaceholder("KEY", { exact: true }).fill("");
    await expect(dialog.getByText("This row has no name, so it is not kept. Give it one.")).toBeVisible();
    await dialog.getByRole("button", { name: "Mark variable as secret" }).click();
    await expect(dialog.getByText("A variable needs a name and a value to be kept as a secret.")).toBeVisible();
  });
});

// U-135, U-136 and C-003: with no vault, the row makes it, and what is stored is the reference, never the value.
test("marking a variable secret with no vault makes the vault in the row and stores no plain value", async ({
  page,
}) => {
  await page.goto("/app/");
  const dialog = await openEnvironments(page);
  await dialog.getByRole("button", { name: "New environment" }).first().click();
  await page.locator("#new-env-name-input").fill("Vaulted");
  await page.getByRole("button", { name: "Create environment" }).click();
  await dialog.getByRole("button", { name: "Add variable" }).click();
  await dialog.getByPlaceholder("KEY", { exact: true }).fill("token");
  await dialog.getByPlaceholder("Value", { exact: true }).fill("plain-value-123");
  await dialog.getByRole("button", { name: "Mark variable as secret" }).click();
  // In the row, not a second dialog; the keyboard is already in the passphrase.
  await expect(page.getByRole("dialog", { name: "Create vault passphrase" })).toHaveCount(0);
  await expect(dialog.getByLabel("Passphrase", { exact: true })).toBeFocused();
  // Leaving the value for the lock wrote nothing of it: the row waits to be the secret's reference.
  await page.waitForTimeout(300);
  expect(JSON.stringify(await dumpIdb(page))).not.toContain("plain-value-123");
  await page.keyboard.type(PASSPHRASE);
  await dialog.getByLabel("Confirm passphrase", { exact: true }).fill(PASSPHRASE);
  await page.keyboard.press("Enter");
  await expect(dialog.getByText("Secret stored")).toBeVisible();
  // Stored at once: closed without anything else, the environment holds the reference.
  await page.keyboard.press("Escape");
  await expect
    .poll(async () => JSON.stringify((await dumpIdb(page))["environments"]))
    .toMatch(/\{\{\$secret\.[a-z0-9-]+\}\}/);
  expect(JSON.stringify(await dumpIdb(page))).not.toContain("plain-value-123");
});
