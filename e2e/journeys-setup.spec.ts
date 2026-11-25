import { test, expect, type Page } from "@playwright/test";
import { openEnvironments, openSettings } from "./support/app";

// Overhaul S5c: setting up. One Import menu wherever Import is offered, an import that ends on a request, a vault whose
// set-up says what it is, and the globals in the Environments pane.

const postman = JSON.stringify({
  info: { name: "Pets", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
  item: [
    { name: "List pets", request: { method: "GET", url: "https://api.example.com/pets" } },
    { name: "Add a pet", request: { method: "POST", url: "https://api.example.com/pets" } },
  ],
});

/** The first three items of the Import menu the button opens, then the menu closed. */
async function menuItems(page: Page, button: ReturnType<Page["getByRole"]>): Promise<string[]> {
  await button.click();
  await expect(page.getByRole("menuitem").first()).toBeVisible();
  const items = await page.getByRole("menuitem").allTextContents();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem")).toHaveCount(0);
  return items.slice(0, 3).map((item) => item.trim());
}

test("@claim:C-110 Import is one menu, with a file, a cURL command and a link, in the sidebar, in Environments and in Settings", async ({
  page,
}) => {
  await page.goto("/app/");
  const wanted = ["File…", "cURL command…", "Link…"];
  const sidebar = page.locator("app-collections-sidebar");
  expect(await menuItems(page, sidebar.getByRole("button", { name: "Import", exact: true }))).toEqual(wanted);

  const environments = await openEnvironments(page);
  expect(await menuItems(page, environments.getByRole("button", { name: "Import", exact: true }))).toEqual(wanted);

  const settings = await openSettings(page, "Data and storage");
  expect(await menuItems(page, settings.getByRole("button", { name: "Import", exact: true }))).toEqual(wanted);

  // A choice goes down the one road: the box for a command is the same dialog from here as from the sidebar.
  await settings.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("menuitem", { name: "cURL command…", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Import" }).getByLabel("A cURL command")).toBeVisible();
});

test("@claim:C-111 a file's Import ends with its first request open in the composer", async ({ page }) => {
  await page.goto("/app/");
  await page.locator('app-collections-sidebar input[type="file"]').setInputFiles({
    name: "pets.postman_collection.json",
    mimeType: "application/json",
    buffer: Buffer.from(postman),
  });
  const report = page.getByRole("dialog", { name: "Import collection" });
  // The report says what goes where, once.
  await expect(report).toContainText("2 requests go to:");
  await expect(report.getByLabel("Hosts its requests go to")).toContainText("api.example.com");
  await expect(report).toContainText("Nothing is stored until you choose Import.");
  await report.getByRole("button", { name: "Import", exact: true }).click();
  await expect(report).toHaveCount(0);
  await expect(page.locator("input.address-url")).toHaveValue("https://api.example.com/pets");
});

test("@claim:C-112 setting up the vault says what it is, shows the passphrase on request and warns it cannot be recovered", async ({
  page,
}) => {
  await page.goto("/app/");
  await page.getByRole("button", { name: "Set up vault to store secrets", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Set up vault", exact: true });
  await expect(dialog).toContainText("The vault keeps secrets encrypted on this device.");
  await expect(dialog).toContainText("There is no way to recover a forgotten passphrase.");
  const passphrase = dialog.getByLabel("Passphrase", { exact: true });
  await passphrase.fill("a long passphrase");
  await expect(passphrase).toHaveAttribute("type", "password");
  await dialog.getByRole("checkbox", { name: "Show passphrase" }).check();
  await expect(passphrase).toHaveAttribute("type", "text");
  await expect(dialog.getByLabel("Confirm passphrase", { exact: true })).toHaveAttribute("type", "text");
});

test("@claim:C-113 the global variables are the first row of the Environments list and open in the pane, written as they are left", async ({
  page,
}) => {
  await page.goto("/app/");
  const pane = await openEnvironments(page);
  // With none, the pane says what an environment is for and offers one action to make it.
  await expect(pane.getByRole("heading", { name: "No environments yet." })).toBeVisible();
  await pane.getByRole("button", { name: "New environment" }).last().click();
  await page.locator("#new-env-name-input").fill("Staging");
  await page.locator("#new-env-name-input").press("Enter");
  await expect(pane.getByLabel("Name", { exact: true })).toHaveValue("Staging");

  await pane.getByRole("button", { name: /^Globals/ }).click();
  await expect(pane.getByRole("heading", { name: "Globals", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await pane.getByRole("button", { name: "Add variable" }).click();
  await pane.getByPlaceholder("Name", { exact: true }).last().fill("region");
  await pane.getByPlaceholder("Value", { exact: true }).last().fill("eu");
  await pane.getByPlaceholder("Value", { exact: true }).last().blur();

  await pane.getByRole("button", { name: /^Staging/ }).click();
  await pane.getByRole("button", { name: /^Globals/ }).click();
  await expect(pane.getByPlaceholder("Value", { exact: true })).toHaveValue("eu");
});
