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
    await page.locator("#new-env-name-input").press("Enter");

    // Creating an environment auto-selects it as active — confirmed by its
    // name also appearing in the toolbar's environment switcher, which is
    // why this scopes to the environments list specifically rather than
    // asserting the text appears exactly once on the page.
    await expect(page.locator("app-environments-manager").getByText("E2E Env", { exact: true })).toBeVisible();

    // Add a variable in the Key/Value editor.
    await page.getByRole("button", { name: "Add variable" }).click();
    const keyInputs = page.locator("input[placeholder='Name']");
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
  await expect(page.getByRole("region", { name: "Environments", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^host environment/ }).click();
  const dialog = page.getByRole("region", { name: "Environments", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("input[placeholder='Name']")).toHaveValue("host");
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
      await page.locator("#new-env-name-input").press("Enter");
      await expect(page.locator("#new-env-name-input")).toHaveCount(0);
    }
    await dialog.locator(".env-item-select", { hasText: "First" }).click();
    await dialog.getByRole("button", { name: "Add variable" }).click();
    // Add variable puts the keyboard in the new row (U-145).
    await expect(dialog.getByPlaceholder("Name", { exact: true })).toBeFocused();
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

  // The editor is a tab since D4.5: it is closed as a tab is, or left for another tab.
  test("closed with the tab's ×", async ({ page }) => {
    const dialog = await twoEnvironments(page);
    const tab = page.getByRole("tablist", { name: "Open requests" }).getByRole("tab", { name: /Environments/ });
    await tab.hover();
    await tab.locator(".request-tab-close").click();
    await expect(dialog).toHaveCount(0);
    await expectKept(page);
  });

  test("left for another tab", async ({ page }) => {
    const dialog = await twoEnvironments(page);
    await page.getByRole("tablist", { name: "Open requests" }).getByRole("tab").first().click();
    await expect(dialog).toHaveCount(0);
    await expectKept(page);
  });

  test("left for another environment", async ({ page }) => {
    const dialog = await twoEnvironments(page);
    await dialog.locator(".env-item-select", { hasText: "Second" }).click();
    await expect(dialog.getByPlaceholder("Name", { exact: true })).toHaveCount(0);
    await page.reload();
    await expectKept(page);
  });

  test("a row with a value and no name says it is not kept", async ({ page }) => {
    const dialog = await twoEnvironments(page);
    await dialog.getByPlaceholder("Name", { exact: true }).fill("");
    await expect(dialog.getByText("This row has no name, so it is not kept. Give it one.")).toBeVisible();
    await dialog.getByRole("button", { name: /^Mark .* as secret$/ }).click();
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
  await page.locator("#new-env-name-input").press("Enter");
  await dialog.getByRole("button", { name: "Add variable" }).click();
  await dialog.getByPlaceholder("Name", { exact: true }).fill("token");
  await dialog.getByPlaceholder("Value", { exact: true }).fill("plain-value-123");
  await dialog.getByRole("button", { name: /^Mark .* as secret$/ }).click();
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

// U-080 and DQ9: deleting an environment asked through the browser's own confirm(). It goes at once, the line says so,
// and Undo puts it back, in use again if it was. U-043: the one in use is said once, by its tag; the others have Use.
test("a deleted environment comes back by Undo, in use again", async ({ page }) => {
  await seedAndOpen(page, { host: "example.com" }, { method: "GET", url: "https://{{host}}/x" });
  const region = await openEnvironments(page);
  const row = region.locator(".env-item", { hasText: "Tripwire env" });
  await expect(row).toContainText("In use");
  await expect(row.getByRole("button", { name: /^Use / })).toHaveCount(0);
  await row.getByRole("button", { name: "Delete Tripwire env" }).click();
  await expect(region.locator(".env-item", { hasText: "Tripwire env" })).toHaveCount(0);
  await expect(page.locator(".undo-bar")).toContainText("Removed Tripwire env.");
  await page.locator(".undo-bar").getByRole("button", { name: "Undo" }).click();
  await expect(region.locator(".env-item", { hasText: "Tripwire env" })).toContainText("In use");
  await expect(page.getByRole("combobox", { name: "Environment" })).toContainText("Tripwire env");
});

// No environment, chosen, lasted until the next read of the environments: an edit, or a reload, put the first back.
test("No environment, chosen in the toolbar, stays chosen after an edit and a reload", async ({ page }) => {
  await seedAndOpen(page, { host: "example.com" }, { method: "GET", url: "https://{{host}}/x" });
  const select = page.getByRole("banner").getByRole("combobox", { name: "Environment", exact: true });
  await expect(select).toContainText("Tripwire env");
  await select.click();
  await page.getByRole("option", { name: "No environment" }).click();
  await expect(select).toHaveText("No environment");
  await expect.poll(async () => JSON.stringify((await dumpIdb(page))["meta"])).toContain('"activeEnvironmentId":null');

  const region = await openEnvironments(page);
  const row = region.locator(".env-item", { hasText: "Tripwire env" });
  await expect(row).not.toContainText("In use");
  await row.locator(".env-item-select").click();
  await region.getByRole("checkbox", { name: "Use host" }).uncheck();
  await expect
    .poll(async () => JSON.stringify((await dumpIdb(page))["environments"]))
    .toContain('"key":"host","value":"example.com","enabled":false');
  await expect(row).not.toContainText("In use");
  await closeEnvironments(page);
  await expect(select).toHaveText("No environment");

  await page.reload();
  await expect(select).toHaveText("No environment");
  const again = await openEnvironments(page);
  await expect(again.locator(".env-item", { hasText: "Tripwire env" })).not.toContainText("In use");
});

// U-041: a variable can be switched off and keeps its value; the request then has none, and a reload keeps both.
test("a variable switched off keeps its value and is not used", async ({ page }) => {
  await seedAndOpen(page, { host: "example.com" }, { method: "GET", url: "https://{{host}}/x" });
  const region = await openEnvironments(page);
  const use = region.getByRole("checkbox", { name: "Use host" });
  await expect(use).toBeChecked();
  await use.uncheck();
  await expect
    .poll(async () => JSON.stringify((await dumpIdb(page))["environments"]))
    .toContain('"key":"host","value":"example.com","enabled":false');
  await closeEnvironments(page);
  await expect(page.getByRole("button", { name: /^host Missing/ })).toBeVisible();
  await page.reload();
  const again = await openEnvironments(page);
  await expect(again.getByRole("checkbox", { name: "Use host" })).not.toBeChecked();
  await expect(again.getByPlaceholder("Value", { exact: true })).toHaveValue("example.com");
  await again.getByRole("checkbox", { name: "Use host" }).check();
  await closeEnvironments(page);
  await expect(page.getByRole("button", { name: /^host environment/ })).toBeVisible();
});
