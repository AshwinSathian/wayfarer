import { test, expect, type Locator, type Page } from "@playwright/test";
import { ECHO } from "./support/echo";
import { still } from "./support/settled";

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

// The Basic / JSON switch this test drove is gone (P2.12, Q1). What replaced it is driven the same way.
test("headers and body: Bulk edit and the body type are driven from the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByLabel("Headers name, row 1").fill("Accept");
  await page.getByLabel("Headers value, row 1").fill("*/*");

  const bulk = page.getByRole("button", { name: "Bulk edit" });
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

// The method was a select of seven until P2.16. It is a text field now, so
// any method can be typed, with the common ones in a menu beside it.
test("method: any one can be typed and is upper-cased; the menu of common ones is driven from the keyboard", async ({ page }) => {
  await page.goto("/");
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
  await page.keyboard.press("Enter");
  await expect(page.getByRole("option", { name: "Keys" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Enter");
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
  await expect(items).toHaveText(["New Folder", "New Request", "Variables", "Rename", "Duplicate", "Export", "Export with credentials", "Delete"]);
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("menuitem", { name: "Export with credentials" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);

  // Opens again, and an item chosen with the keyboard runs.
  await node.click({ button: "right" });
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tree").getByRole("textbox")).toBeVisible();
});

/**
 * Clicks where `trigger` is while its menu or list is open. Material puts a
 * transparent backdrop over the page, a frame after the panel, and that is
 * what a second click in the same place lands on.
 */
async function clickAgain(page: Page, trigger: Locator): Promise<void> {
  await expect(page.locator(".cdk-overlay-backdrop-showing")).toBeVisible();
  const box = (await trigger.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test("with the mouse: a second click on the Export button or on a select closes it again", async ({ page }) => {
  await page.goto("/");
  await page.locator("input.address-url").fill(`${ECHO}/content/json?toggle=1`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

  const exportButton = page.getByRole("button", { name: "Export response" });
  await exportButton.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await clickAgain(page, exportButton);
  await expect(page.getByRole("menu")).toHaveCount(0);

  const methods = page.getByRole("button", { name: "Common methods" });
  await methods.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await clickAgain(page, methods);
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

test("settings dialog: focus moves in, Tab stays in, Escape closes at once and focus returns", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const opener = page.getByRole("button", { name: "Settings", exact: true });
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
  await page.goto("/");
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

test("phone navigation drawer: focus moves in, Tab stays in, Escape closes and focus returns", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
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

// Material reports that a drawer has closed when its slide ends, by which
// time the page may already have asked for it again. The shell once took
// that late report as the state, and shut the drawer it had just opened.
test("history drawer: asked for again as the last close is reported, it opens and stays open", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const opener = page.getByRole("button", { name: "Request history" });
  const drawer = page.getByRole("dialog", { name: "Request history" });
  await opener.click();
  await expect(drawer).toBeVisible();
  await page.getByRole("button", { name: "Close history" }).click();
  await expect(drawer).toHaveCount(0);
  await still(page.locator("mat-sidenav.mat-drawer-end"));

  // In one task: the click that asks for the drawer, then the event Material
  // ends a slide on, before Angular has told Material about the click.
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('button[aria-label="Request history"]')!.click();
    document.querySelector("mat-sidenav.mat-drawer-end")!.dispatchEvent(new TransitionEvent("transitionend"));
  });

  await expect(drawer).toBeVisible();
  await still(page.locator("mat-sidenav.mat-drawer-end"));
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Close history" })).toBeVisible();
});

test("confirmations: focus starts on Cancel, Tab stays in, Escape cancels and focus returns", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator("input.address-url").fill(`${ECHO}/content/json?confirm=1`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  await page.getByRole("button", { name: "Request history" }).click();
  const drawer = page.getByRole("dialog", { name: "Request history" });
  const entry = drawer.getByRole("button", { name: /^Load request .*confirm=1 into composer$/ });
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

test("composer and response split: the gutter is a focusable separator moved by arrow keys, Home and End, and the result is kept", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const gutter = page.getByRole("separator", { name: "Resize the composer and the response" });
  const composer = page.locator(".composer-pane");
  await still(gutter);
  const total = (await page.locator(".composer-response-splitter").boundingBox())!.width;
  const width = async () => (await composer.boundingBox())!.width;

  await gutter.focus();
  await expect(gutter).toHaveAttribute("aria-valuenow", "55");
  const start = await width();
  await page.keyboard.press("ArrowRight");
  await expect.poll(width).toBeGreaterThan(start + 10);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => Math.abs((await width()) - start)).toBeLessThan(1);

  await page.keyboard.press("Home");
  await expect(gutter).toHaveAttribute("aria-valuenow", "28");
  await expect.poll(async () => Math.abs((await width()) - total * 0.28)).toBeLessThan(2);
  await page.keyboard.press("End");
  await expect.poll(async () => Math.abs((await page.locator(".response-pane").boundingBox())!.width - total * 0.22)).toBeLessThan(2);
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

test("collections tree: arrow keys walk and expand it, F2 renames, Alt+Arrow reorders, Shift+F10 opens the menu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "New collection" }).click();
  await page.locator("#creation-name-input").fill("Tree Col");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await createUnder(page, "Tree Col", "New Folder", "Tree Folder");
  await createUnder(page, "Tree Col", "New Request", "Tree Req 1");
  await createUnder(page, "Tree Col", "New Request", "Tree Req 2");
  await createUnder(page, "Tree Folder", "New Request", "Tree Inner");
  const item = (name: string) => page.getByRole("treeitem", { name, exact: true });
  const order = async () => (await page.getByRole("treeitem").evaluateAll((items) => items.map((i) => i.getAttribute("aria-label") ?? ""))).filter((n) => n.startsWith("Tree "));

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

test("phone: Escape with a tree row's menu open closes the menu and leaves the navigation drawer open", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await drawer.getByRole("button", { name: "New collection" }).click();
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
