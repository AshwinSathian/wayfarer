import { test, expect, type Locator, type Page } from "@playwright/test";
import { treeRow, withoutMethod } from "./support/app";
import { ECHO } from "./support/echo";

// Keyboard-only use of the app's own widgets (docs: WAI-ARIA Authoring
// Practices patterns). One test per widget, in all three engines.

test("composer tabs: arrow keys, Home and End move focus and show the matching panel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const composer = page.locator(".composer-pane");
  const tab = (name: string) => composer.getByRole("tab", { name, exact: true });

  await tab("Headers").focus();
  await expect(tab("Headers")).toHaveAttribute("aria-selected", "true");

  // Body is there for every method (U-017).
  await page.keyboard.press("ArrowRight");
  await expect(tab("Body")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(tab("Auth")).toBeFocused();
  await expect(tab("Auth")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#auth-type-select")).toBeVisible();

  await page.keyboard.press("End");
  await expect(tab("Settings")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(tab("Params")).toBeFocused();
  await expect(composer.getByRole("button", { name: "Add parameter" })).toBeVisible();

  await page.keyboard.press("ArrowLeft");
  await expect(tab("Settings")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(tab("Params")).toHaveAttribute("aria-selected", "true");

  // Exactly one tab is in the tab order, and its panel is the only one shown.
  await expect(composer.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
  await expect(composer.getByRole("tabpanel")).toHaveCount(1);
});

test("response tabs: arrow keys walk Body, Headers, Timings and Tests", async ({ page }) => {
  await page.goto("/app/");
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

// The Basic / JSON switch this test drove is gone (P2.12, Q1). What replaced it is driven the same way.
test("headers and body: Bulk edit and the body type are driven from the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await page.getByRole("tab", { name: "Headers", exact: true }).click();
  await page.getByLabel("Headers name, row 1").fill("Accept");
  await page.getByLabel("Headers value, row 1").fill("*/*");

  const bulk = page.getByRole("button", { name: "Edit as text" });
  await bulk.focus();
  await page.keyboard.press("Enter");
  const text = page.getByRole("textbox", { name: /^Headers, one/ });
  await expect(text).toHaveValue("Accept: */*");
  await text.focus();
  await page.keyboard.press("End");
  await page.keyboard.type("\n# X-Off: 1\nAccept: text/plain");

  const rows = page.getByRole("button", { name: "Edit as rows" });
  await rows.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Headers name, row 3")).toHaveValue("Accept");
  await expect(page.getByLabel("Headers value, row 3")).toHaveValue("text/plain");
  await expect(page.getByRole("checkbox", { name: "Send headers row 2" })).not.toBeChecked();

  await page.getByRole("textbox", { name: "HTTP method" }).fill("POST");
  const bodyTab = page.getByRole("tab", { name: "Body", exact: true }).first();
  await bodyTab.focus();
  const type = page.getByRole("combobox", { name: "Body", exact: true });
  await type.focus();
  // A closed select takes arrow keys, as the native one does.
  await page.keyboard.press("ArrowDown");
  await expect(type).toContainText("Raw");
  await expect(page.locator(".monaco-editor").first()).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("ArrowDown");
  await expect(type).toContainText("Form (URL-encoded)");
  await expect(page.getByLabel("Body name, row 1")).toBeVisible();
});

test("phone composer: Enter and Space open a section, one at a time, and a closed section is out of reach", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/");
  const header = (name: string) => page.getByRole("button", { name, exact: true });
  // Params is open first (U-017).
  await expect(header("Params")).toHaveAttribute("aria-expanded", "true");

  await header("Auth").focus();
  await page.keyboard.press("Enter");
  await expect(header("Auth")).toHaveAttribute("aria-expanded", "true");
  await expect(header("Params")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#auth-type-select")).toBeVisible();
  // The closed section's fields are hidden from sight and from the keyboard.
  const addParameter = page.getByRole("button", { name: "Add parameter", includeHidden: true });
  await expect(addParameter).toBeHidden();
  expect(await addParameter.evaluate((el) => !!el.closest("[inert]"))).toBe(true);

  await header("Headers").focus();
  await page.keyboard.press("Space");
  await expect(header("Headers")).toHaveAttribute("aria-expanded", "true");
  await expect(header("Auth")).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Headers name, row 1")).toBeVisible();
});

// The method was a select of seven until P2.16. It is a text field now, so
// any method can be typed, with the common ones in a menu beside it.
test("method: any one can be typed and is upper-cased; the menu of common ones is driven from the keyboard", async ({
  page,
}) => {
  await page.goto("/app/");
  const method = page.getByRole("textbox", { name: "HTTP method" });
  await expect(method).toHaveValue("GET");

  await method.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("purge");
  await expect(method).toHaveValue("PURGE");

  const methods = page.getByRole("button", { name: "Common methods" });
  await methods.focus();
  await page.keyboard.press("Enter");
  const items = page.getByRole("menuitem");
  await expect(items).toHaveText(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
  // The menu reads its keys once its first item has focus.
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(method).toHaveValue("POST");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(methods).toBeFocused();

  // Escape leaves the method as it was.
  await page.keyboard.press("Enter");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(method).toHaveValue("POST");
  await expect(methods).toBeFocused();
  await method.fill("GET");

  // The app is usable after the menu closes.
  await page.locator("input.address-url").fill(`${ECHO}/echo?select=1`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
});

test("a select inside a dialog: Escape closes the list first, the dialog second", async ({ page }) => {
  await page.goto("/app/");
  await page.getByRole("button", { name: "New collection" }).first().click();
  await page.locator("#creation-name-input").fill("Keys");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("tree").getByText("Keys", { exact: true })).toBeVisible();
  await page.locator("input.address-url").fill(`${ECHO}/echo?dialog=1`);
  await page.getByRole("button", { name: "Save to collection" }).click();
  const dialog = page.getByRole("dialog", { name: "Save to collection" });
  await expect(dialog).toBeVisible();

  const collection = dialog.locator("#save-as-collection");
  await collection.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("option", { name: "Keys" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(collection).toContainText("Keys");
});

test("export menu: opens from the keyboard, arrows move, Escape returns focus, Enter runs an item", async ({
  page,
}) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/content/json?menu=1`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  const trigger = page.getByRole("button", { name: "Export response" });

  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Copy as cURL", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Copy as HAR", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("menuitem", { name: "Copy as cURL", exact: true })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Copy as cURL", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  // The app is usable after the menu closes.
  await page
    .locator("app-response-viewer")
    .getByRole("tab", { name: /^Headers/ })
    .click();
  await expect(page.locator("app-response-viewer").getByRole("tab", { name: /^Headers/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("collection context menu: arrow keys reach every action and Escape closes it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await page.getByRole("button", { name: "New collection" }).first().click();
  await page.locator("#creation-name-input").fill("Menu target");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const node = page.getByRole("tree").getByText("Menu target", { exact: true });
  await expect(node).toBeVisible();

  await node.click({ button: "right" });
  const items = page.getByRole("menuitem");
  await expect(items).toHaveText([
    "Run…",
    "New Folder",
    "New Request",
    "Settings",
    "Rename",
    "Duplicate",
    "Export",
    "Export with credentials",
    "Export for Postman…",
    "Delete",
  ]);
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("menuitem", { name: "Export for Postman…" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("menuitem", { name: "Export with credentials" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);

  // Opens again, and an item chosen with the keyboard runs.
  await node.click({ button: "right" });
  await expect(items.first()).toBeFocused();
  // Past Run…, New Folder, New Request and Settings.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tree").getByRole("textbox")).toBeVisible();
});

test("with the mouse: a second click on the Export button or on Common methods closes its menu again", async ({
  page,
}) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/content/json?toggle=1`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

  const exportButton = page.getByRole("button", { name: "Export response" });
  await exportButton.click();
  await expect(page.getByRole("menu")).toBeVisible();
  // No backdrop covers the page: the second click lands on the button itself.
  await exportButton.click();
  await expect(page.getByRole("menu")).toHaveCount(0);

  const methods = page.getByRole("button", { name: "Common methods" });
  await methods.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await methods.click();
  await expect(page.getByRole("menu")).toHaveCount(0);
});

// ── Modal surfaces (WAI-ARIA dialog and alert dialog patterns) ─────────────
// Each one: focus moves in on open, Tab cannot leave, Escape closes, focus
// goes back to what opened it, and the page takes a click afterwards.

/** Presses Tab `times` times each way and checks focus never leaves `surface`. Safari tabs to buttons with Option+Tab. */
async function expectFocusTrapped(page: Page, surface: Locator, browserName: string, times = 8) {
  const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
  const inside = () => surface.evaluate((el) => el.contains(document.activeElement));
  expect(await inside()).toBe(true);
  for (const key of [tab, `Shift+${tab}`]) {
    for (let i = 0; i < times; i++) {
      await page.keyboard.press(key);
      expect(await inside(), `focus left the surface on ${key} #${i + 1}`).toBe(true);
    }
  }
}

test("settings dialog: focus moves in, Tab stays in, Escape closes at once and focus returns", async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const opener = page.getByRole("banner").getByRole("button", { name: "Settings", exact: true });
  await opener.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expectFocusTrapped(page, dialog, browserName);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  // Open again and close the moment it is there, without waiting for the fade.
  await page.keyboard.press("Enter");
  await expect(dialog).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  await page.locator("input.address-url").click();
  await expect(page.locator("input.address-url")).toBeFocused();
});

test("history drawer: focus moves in, Tab stays in, Escape closes and focus returns", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const opener = page.getByRole("button", { name: "Request history" });
  await opener.focus();
  await page.keyboard.press("Enter");

  const drawer = page.getByRole("dialog", { name: "Request history" });
  await expect(drawer).toBeVisible();
  await expectFocusTrapped(page, drawer, browserName, 4);

  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.locator("input.address-url").click();
  await expect(page.locator("input.address-url")).toBeFocused();
});

test("phone navigation drawer: focus moves in, Tab stays in, Escape closes and focus returns", async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/");
  const opener = page.getByRole("button", { name: "Toggle sidebar" });
  await opener.focus();
  await page.keyboard.press("Enter");

  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(drawer).toBeVisible();
  await expectFocusTrapped(page, drawer, browserName);

  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.locator("input.address-url").click();
  await expect(page.locator("input.address-url")).toBeFocused();
});

// While the drawer is open the page under it is inert: the shell closes it
// before it moves focus to the address, or the field took none.
test("phone navigation drawer: New request closes it and puts focus in the address", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/");
  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await drawer.getByRole("button", { name: "New request" }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.locator("input.address-url")).toBeFocused();
});

// #223: the shell once moved focus in on Material's openedStart, a frame
// after the key, and a Tab (or a check) inside that frame found it still on
// the page. Focus is inside by the end of the task that asked for the drawer.
for (const [width, opener, name] of [
  [1440, "Request history", "Request history"],
  [390, "Toggle sidebar", "Navigation"],
] as const) {
  test(`${name} drawer at ${width} px: focus is inside by the end of the click that opens it`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/app/");
    await expect(page.getByRole("button", { name: opener })).toBeVisible();
    const inside = await page.evaluate(
      ([label, dialog]) => {
        document.querySelector<HTMLElement>(`button[aria-label="${label}"]`)!.click();
        return document.activeElement?.closest(`[aria-label="${dialog}"]`) !== null;
      },
      [opener, name],
    );
    expect(inside).toBe(true);
  });

  // Opened and closed before Angular has run once: the [opened] binding saw false both times, and the drawer stayed open.
  test(`${name} drawer at ${width} px: Escape in the task that opened it closes it`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/app/");
    await expect(page.getByRole("button", { name: opener })).toBeVisible();
    await page.evaluate((label) => {
      document.querySelector<HTMLElement>(`button[aria-label="${label}"]`)!.click();
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }, opener);
    await expect(page.getByRole("dialog", { name })).toHaveCount(0);
  });
}

// The shell shows and closes a drawer in the task that asks (#223). Asked
// for, closed and asked for again before Angular has drawn any of it, the
// drawer is open, with focus in it.
test("history drawer: opened, closed and opened again in one task, it is open and has focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const drawer = page.getByRole("dialog", { name: "Request history" });
  const focused = await page.evaluate(() => {
    const opener = document.querySelector<HTMLElement>('button[aria-label="Request history"]')!;
    opener.click();
    document.querySelector<HTMLElement>('button[aria-label="Close history"]')!.click();
    opener.click();
    return document.activeElement?.getAttribute("aria-label");
  });
  expect(focused).toBe("Close history");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Close history" })).toBeFocused();
  await page.waitForTimeout(400);
  await expect(drawer).toBeVisible();
});

test("confirmations: focus starts on Cancel, Tab stays in, Escape cancels and focus returns", async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/content/json?confirm=1`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  await page.getByRole("button", { name: "Request history" }).click();
  const drawer = page.getByRole("dialog", { name: "Request history" });
  const entry = drawer.getByRole("button", { name: /confirm=1$/ });
  await expect(entry).toBeVisible();

  // The centred alert dialog.
  const clear = drawer.getByRole("button", { name: "Clear all history" });
  await clear.focus();
  await page.keyboard.press("Enter");
  const alert = page.getByRole("alertdialog", { name: "Are you sure?" });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expectFocusTrapped(page, alert, browserName, 3);
  await page.keyboard.press("Escape");
  await expect(alert).toHaveCount(0);
  await expect(clear).toBeFocused();
  await expect(entry).toBeVisible();

  // The small popup under a history entry's Delete button.
  const del = drawer.getByRole("button", { name: "Delete history entry" });
  await del.focus();
  await page.keyboard.press("Enter");
  const popup = page.getByRole("alertdialog", { name: "Remove this request from history?" });
  await expect(popup).toBeVisible();
  await expect(popup.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expectFocusTrapped(page, popup, browserName, 3);
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(del).toBeFocused();
  await expect(entry).toBeVisible();

  // Escape closed only the confirmation: the drawer is still open and closes on the next one.
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
});

test("composer and response split: the gutter is a focusable separator moved by arrow keys, Home and End, and the result is kept", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const gutter = page.getByRole("separator", { name: "Resize the composer and the response" });
  const composer = page.locator(".composer-pane");
  const total = (await page.locator(".composer-response-splitter").boundingBox())!.width;
  const width = async () => (await composer.boundingBox())!.width;

  await gutter.focus();
  await expect(gutter).toHaveAttribute("aria-valuenow", "45");
  const start = await width();
  await page.keyboard.press("ArrowRight");
  await expect.poll(width).toBeGreaterThan(start + 10);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => Math.abs((await width()) - start)).toBeLessThan(1);

  await page.keyboard.press("Home");
  await expect(gutter).toHaveAttribute("aria-valuenow", "28");
  await expect.poll(async () => Math.abs((await width()) - total * 0.28)).toBeLessThan(2);
  await page.keyboard.press("End");
  await expect
    .poll(async () => Math.abs((await page.locator(".response-pane").boundingBox())!.width - total * 0.22))
    .toBeLessThan(2);
  const atEnd = await width();

  await page.reload();
  await expect.poll(async () => Math.abs((await width()) - atEnd)).toBeLessThan(2);
});

/** Opens a tree row's context menu, picks an item, and fills the creation dialog. */
async function createUnder(page: Page, parent: string, item: string, name: string): Promise<void> {
  await page.getByRole("treeitem", { name: parent, exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: item }).click();
  await page.locator("#creation-name-input").fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("collections tree: arrow keys walk and expand it, F2 renames, Alt+Arrow reorders, Shift+F10 opens the menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await page.getByRole("button", { name: "New collection" }).first().click();
  await page.locator("#creation-name-input").fill("Tree Col");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await createUnder(page, "Tree Col", "New Folder", "Tree Folder");
  await createUnder(page, "Tree Col", "New Request", "Tree Req 1");
  await createUnder(page, "Tree Col", "New Request", "Tree Req 2");
  await createUnder(page, "Tree Folder", "New Request", "Tree Inner");
  const item = (name: string) => treeRow(page, name);
  const order = async () =>
    (await page.getByRole("treeitem").evaluateAll((items) => items.map((i) => i.getAttribute("aria-label") ?? "")))
      .map(withoutMethod)
      .filter((n) => n.startsWith("Tree "));

  // Exactly one row is in the tab order.
  await expect(page.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);

  // Walk and expand.
  await item("Tree Col").focus();
  await expect(item("Tree Col")).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowDown");
  await expect(item("Tree Folder")).toBeFocused();
  await expect(item("Tree Folder")).toHaveAttribute("aria-expanded", "false");
  await expect(item("Tree Inner")).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(item("Tree Folder")).toHaveAttribute("aria-expanded", "true");
  // Material draws the children a frame after it marks the row expanded.
  await expect(item("Tree Inner")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(item("Tree Inner")).toBeFocused();
  await expect(item("Tree Inner")).toHaveAttribute("aria-level", "3");
  await page.keyboard.press("ArrowLeft");
  await expect(item("Tree Folder")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(item("Tree Inner")).toHaveCount(0);
  await page.keyboard.press("End");
  await expect(item("Tree Req 2")).toBeFocused();

  // Enter selects.
  await page.keyboard.press("Enter");
  await expect(item("Tree Req 2")).toHaveAttribute("aria-selected", "true");

  // Alt+ArrowUp moves the request above its sibling, keeps focus on it, and the order is saved.
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(order).toEqual(["Tree Col", "Tree Folder", "Tree Req 2", "Tree Req 1"]);
  await expect(item("Tree Req 2")).toBeFocused();

  // F2 renames in place; Enter saves and focus returns to the row.
  await page.keyboard.press("F2");
  const field = page.getByRole("tree").getByRole("textbox");
  await expect(field).toBeFocused();
  await page.keyboard.type("Tree Req Two");
  await page.keyboard.press("Enter");
  await expect(item("Tree Req Two")).toBeFocused();

  // Escape abandons a rename.
  await page.keyboard.press("F2");
  await expect(field).toBeFocused();
  await page.keyboard.type("discarded");
  await page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);
  await expect(item("Tree Req Two")).toBeFocused();

  // Shift+F10 opens the row's menu; Escape closes it and focus returns to the row.
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menuitem")).toHaveText(["Rename", "Duplicate", "Delete"]);
  await expect(page.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(item("Tree Req Two")).toBeFocused();

  await page.reload();
  await expect.poll(order).toEqual(["Tree Col", "Tree Folder", "Tree Req Two", "Tree Req 1"]);
});

test("phone: Escape with a tree row's menu open closes the menu and leaves the navigation drawer open", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/");
  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await drawer.getByRole("button", { name: "New collection" }).first().click();
  await page.locator("#creation-name-input").fill("Phone Col");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await drawer.getByRole("treeitem", { name: "Phone Col" }).click({ button: "right" });
  // Material's menu reads keys from its own panel, so it has to hold focus:
  // it takes it a moment after the right-click.
  await expect(page.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("treeitem", { name: "Phone Col" })).toBeFocused();
});

test("Send and Save have keys (U-032): Enter in the address, ⌘↵ or Ctrl+Enter from an editor, ⌘S or Ctrl+S", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const status = page.locator(".status-badge");
  const address = page.locator("input.address-url");
  await address.fill(`${ECHO}/content/json?keys=enter`);
  await address.press("Enter");
  await expect(status).toHaveText("200");

  // From inside Monaco, which would otherwise insert a line: the keys are read before it.
  await page.getByRole("textbox", { name: "HTTP method" }).fill("POST");
  await address.fill(`${ECHO}/status/201`);
  await page.getByRole("tab", { name: "Body", exact: true }).first().click();
  await page.getByRole("combobox", { name: "Body", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  const editor = page.locator(".monaco-editor").first();
  await expect(editor).toBeVisible({ timeout: 10_000 });
  await editor.click();
  await page.keyboard.type("{}");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(status).toHaveText("201");
  await expect(editor.locator(".view-line")).toHaveCount(1);

  // Save: the browser's Save page is not opened, the app's is.
  await page.keyboard.press("ControlOrMeta+s");
  const save = page.getByRole("dialog", { name: "Save to collection" });
  await expect(save).toBeVisible();
  // Under a dialog the keys do nothing.
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(save).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(save).toHaveCount(0);

  // Where each works, it says so.
  const sendButton = page.getByRole("button", { name: "Send request" });
  await expect(sendButton).toHaveAttribute("aria-keyshortcuts", /^(Meta|Control)\+Enter$/);
  await sendButton.hover();
  await expect(page.getByRole("tooltip").locator("kbd")).toHaveText(/^(⌘↵|Ctrl\+Enter)$/);
});
