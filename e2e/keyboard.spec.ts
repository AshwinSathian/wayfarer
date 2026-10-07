import { test, expect } from "@playwright/test";
import { ECHO } from "./support/echo";

// Keyboard-only use of the app's own widgets (docs: WAI-ARIA Authoring
// Practices patterns). One test per widget, in all three engines.

test("composer tabs: arrow keys, Home and End move focus and show the matching panel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const composer = page.locator(".composer-pane");
  const tab = (name: string) => composer.getByRole("tab", { name, exact: true });

  await tab("Headers").focus();
  await expect(tab("Headers")).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ArrowRight");
  await expect(tab("Auth")).toBeFocused();
  await expect(tab("Auth")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#auth-type-select")).toBeVisible();

  await page.keyboard.press("End");
  await expect(tab("Scripts")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(tab("Params")).toBeFocused();
  await expect(composer.getByRole("button", { name: "Add parameter" })).toBeVisible();

  await page.keyboard.press("ArrowLeft");
  await expect(tab("Scripts")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(tab("Params")).toHaveAttribute("aria-selected", "true");

  // Exactly one tab is in the tab order, and its panel is the only one shown.
  await expect(composer.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
  await expect(composer.getByRole("tabpanel")).toHaveCount(1);
});

test("response tabs: arrow keys walk Body, Headers, Timings and Tests", async ({ page }) => {
  await page.goto("/");
  await page.locator("input.address-url").fill(`${ECHO}/content/json?keys=1`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  const viewer = page.locator("app-response-viewer");

  await viewer.getByRole("tab", { name: "Body" }).focus();
  for (const name of [/^Headers/, /^Timings/, /^Tests/, /^Body/]) {
    await page.keyboard.press("ArrowRight");
    await expect(viewer.getByRole("tab", { name })).toBeFocused();
    await expect(viewer.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
    await expect(viewer.getByRole("tabpanel")).toHaveCount(1);
  }
});

test("editor mode: the Basic / JSON switch is a radio group driven by arrow keys", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const group = page.getByRole("radiogroup", { name: "Editor mode" });
  const basic = group.getByRole("radio", { name: "Basic" });
  const json = group.getByRole("radio", { name: "JSON" });
  await expect(basic).toBeChecked();

  await basic.focus();
  await page.keyboard.press("ArrowRight");
  await expect(json).toBeFocused();
  await expect(json).toBeChecked();
  await expect(basic).not.toBeChecked();
  await expect(page.locator(".monaco-editor").first()).toBeVisible({ timeout: 10_000 });

  await page.keyboard.press("ArrowLeft");
  await expect(basic).toBeChecked();
  await expect(page.getByLabel("Headers name, row 1")).toBeVisible();
});

test("phone composer: Enter and Space open a section, one at a time, and a closed section is out of reach", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const header = (name: string) => page.getByRole("button", { name, exact: true });
  await expect(header("Headers")).toHaveAttribute("aria-expanded", "true");

  await header("Auth").focus();
  await page.keyboard.press("Enter");
  await expect(header("Auth")).toHaveAttribute("aria-expanded", "true");
  await expect(header("Headers")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#auth-type-select")).toBeVisible();
  // The closed section's fields are hidden from sight and from the keyboard.
  await expect(page.getByLabel("Headers name, row 1")).toBeHidden();
  expect(await page.getByLabel("Headers name, row 1").evaluate((el) => !!el.closest("[inert]"))).toBe(true);

  await header("Params").focus();
  await page.keyboard.press("Space");
  await expect(header("Params")).toHaveAttribute("aria-expanded", "true");
  await expect(header("Auth")).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Add parameter" })).toBeVisible();
});

test("method select: keyboard opens it, arrows and typing move, Enter picks, Escape leaves the value alone", async ({ page }) => {
  await page.goto("/");
  const method = page.getByRole("combobox", { name: /^HTTP method/ });
  await method.focus();
  await expect(method).toContainText("GET");

  await page.keyboard.press("ArrowDown");
  await expect(method).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("option")).toHaveCount(7);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(method).toContainText("POST");
  await expect(method).toHaveAttribute("aria-expanded", "false");
  await expect(method).toBeFocused();

  // Type-ahead: "d" goes to DELETE.
  await page.keyboard.press("d");
  await expect(page.getByRole("option", { name: "DELETE", exact: true })).toHaveClass(/active/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(method).toContainText("POST");
  await expect(method).toBeFocused();

  // The app is usable after the list closes.
  await page.locator("input.address-url").fill(`${ECHO}/echo?select=1`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
});

test("a select inside a dialog: Escape closes the list first, the dialog second", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New collection" }).click();
  await page.locator("#creation-name-input").fill("Keys");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("tree").getByText("Keys", { exact: true })).toBeVisible();
  await page.locator("input.address-url").fill(`${ECHO}/echo?dialog=1`);
  await page.getByRole("button", { name: "Save to Collection" }).click();
  const dialog = page.getByRole("dialog", { name: "Save to Collection" });
  await expect(dialog).toBeVisible();

  const collection = dialog.locator("#save-as-collection");
  await collection.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Keys" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(dialog).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(collection).toContainText("Keys");
});

test("export menu: opens from the keyboard, arrows move, Escape returns focus, Enter runs an item", async ({ page }) => {
  await page.goto("/");
  await page.locator("input.address-url").fill(`${ECHO}/content/json?menu=1`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  const trigger = page.getByRole("button", { name: "Export response" });

  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Copy as cURL" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Copy as HAR" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("menuitem", { name: "Copy as cURL" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  // The app is usable after the menu closes.
  await page.locator("app-response-viewer").getByRole("tab", { name: /^Headers/ }).click();
  await expect(page.locator("app-response-viewer").getByRole("tab", { name: /^Headers/ })).toHaveAttribute("aria-selected", "true");
});

test("collection context menu: arrow keys reach every action and Escape closes it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "New collection" }).click();
  await page.locator("#creation-name-input").fill("Menu target");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const node = page.getByRole("tree").getByText("Menu target", { exact: true });
  await expect(node).toBeVisible();

  await node.click({ button: "right" });
  const items = page.getByRole("menuitem");
  await expect(items).toHaveText(["New Folder", "New Request", "Rename", "Duplicate", "Export", "Delete"]);
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("menuitem", { name: "Export" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);

  // Opens again, and an item chosen with the keyboard runs.
  await node.click({ button: "right" });
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("p-tree input")).toBeVisible();
});

test("with the mouse: a second click on the Export button or on a select closes it again", async ({ page }) => {
  await page.goto("/");
  await page.locator("input.address-url").fill(`${ECHO}/content/json?toggle=1`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

  const exportButton = page.getByRole("button", { name: "Export response" });
  await exportButton.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await exportButton.click();
  await expect(page.getByRole("menu")).toHaveCount(0);

  const method = page.getByRole("combobox", { name: /^HTTP method/ });
  await method.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await method.click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
});
