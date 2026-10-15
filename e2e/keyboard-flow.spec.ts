import { test, expect, type Locator, type Page } from "@playwright/test";
import { ECHO } from "./support/echo";

// P7.1: the core flow with the keyboard alone, and a focus ring on every
// stop Tab reaches. No click, no fill: keys only, as a user without a
// pointer has them.

/** Whether what has focus shows it: its own outline, or the field or checkbox it belongs to. */
async function focusShown(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const element = document.activeElement;
    // Past the page's last stop focus leaves for the browser's own UI: the document has none.
    if (!(element instanceof HTMLElement) || element === document.body) return null;
    const ringed = (node: Element) => {
      const style = getComputedStyle(node);
      return (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== "none";
    };
    // Monaco types into a hidden text area: the editor around it shows the focus.
    const editor = element.closest(".monaco-editor");
    if (editor) return ringed(editor) ? null : "a Monaco editor has focus and shows no ring";
    if (ringed(element)) return null;
    // A text field draws its focus on the field's outline, a checkbox on its box.
    if (element.closest(".mat-focused")) return null;
    const box = element.closest(".mat-mdc-checkbox")?.querySelector(".mdc-checkbox__background");
    if (box && ringed(box)) return null;
    const name = element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 40) ?? "";
    return `${element.tagName.toLowerCase()} "${name}" has focus and shows no ring`;
  });
}

/** Tab, as each engine moves through every control: WebKit, as Safari, gives buttons Tab only with Alt. */
let TAB = "Tab";
test.beforeEach(({ browserName }) => {
  TAB = browserName === "webkit" ? "Alt+Tab" : "Tab";
});

/**
 * Presses Tab until `target` has focus, or Shift+Tab when it comes earlier in
 * the page (Firefox does not bring focus back into the page past its end),
 * checking the ring at every stop on the way.
 */
async function tabTo(page: Page, target: Locator, max = 120): Promise<void> {
  const has = () => target.evaluate((element) => element === document.activeElement || element.contains(document.activeElement));
  if (await has()) return;
  const before = await target.evaluate((element) => {
    const active = document.activeElement;
    return !!active && active !== document.body && (element.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
  const key = before ? `Shift+${TAB}` : TAB;
  for (let stop = 0; stop < max; stop++) {
    await page.keyboard.press(key);
    expect(await focusShown(page)).toBeNull();
    if (await has()) return;
  }
  throw new Error(`Tab did not reach ${target} in ${max} stops`);
}

test("@claim:C-067 every stop Tab reaches shows a focus ring, in both themes", async ({ page }) => {
  for (const theme of ["light", "dark"] as const) {
    await page.addInitScript((value) => localStorage.setItem("wayfarer:theme", value), theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator("input.address-url")).toBeVisible();
    const seen = new Set<string>();
    for (let stop = 0; stop < 60; stop++) {
      await page.keyboard.press(TAB);
      expect(await focusShown(page), `${theme}, stop ${stop}`).toBeNull();
      seen.add(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 60) ?? ""));
    }
    // The walk went somewhere: not one element over and over.
    expect(seen.size).toBeGreaterThan(20);
  }
});

test("@claim:C-067 the core flow by keyboard alone: a collection, a new tab, an address, a header, send, save, run", async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();

  // A collection to save into: the sidebar's New collection, its name, Enter.
  await tabTo(page, page.getByRole("button", { name: "New collection" }));
  await page.keyboard.press("Enter");
  await expect(page.locator("#creation-name-input")).toBeFocused();
  await page.keyboard.type("Keys");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("tree").getByText("Keys", { exact: true })).toBeVisible();

  // A new tab, and its address.
  await page.keyboard.press("Alt+t");
  await expect(page.getByRole("tablist", { name: "Open requests" }).getByRole("tab")).toHaveCount(2);
  // A new tab puts focus in its address.
  await expect(page.locator("input.address-url")).toBeFocused();
  await page.keyboard.type(`${ECHO}/echo?by=keys`);

  // A header: to the composer's tabs (one stop: the open one), arrows to Headers, then its first row.
  const headers = page.locator(".composer-pane").getByRole("tab", { name: "Headers", exact: true });
  await tabTo(page, page.locator('.composer-pane [role="tab"][tabindex="0"]'));
  for (let step = 0; step < 6 && !(await headers.evaluate((element) => element === document.activeElement)); step++) await page.keyboard.press("ArrowLeft");
  await expect(headers).toBeFocused();
  await tabTo(page, page.getByLabel("Headers name, row 1"));
  await page.keyboard.type("X-By");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Headers value, row 1")).toBeFocused();
  await page.keyboard.type("keyboard");

  // Send: Tab goes on round the page to it.
  await tabTo(page, page.getByRole("button", { name: "Send request" }));
  const sent = page.waitForRequest((request) => request.url().endsWith("/echo?by=keys"));
  await page.keyboard.press("Enter");
  expect((await sent).headers()["x-by"]).toBe("keyboard");
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

  // Save into the collection.
  await tabTo(page, page.getByRole("button", { name: "Save to Collection" }));
  await page.keyboard.press("Enter");
  await expect(page.locator("#save-as-name")).toBeFocused();
  await page.keyboard.type("By keys");
  await tabTo(page, page.locator("#save-as-collection"));
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#save-as-collection")).toContainText("Keys");
  await tabTo(page, page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const tree = page.getByRole("tree");
  await expect(tree.getByText("By keys", { exact: true })).toBeVisible();

  // Run the collection: its row, its menu by Shift+F10, Run…, then Run.
  await tabTo(page, tree.getByRole("treeitem").first());
  await page.keyboard.press("Shift+F10");
  const run = page.getByRole("menuitem", { name: "Run…" });
  await expect(page.getByRole("menuitem").first()).toBeFocused();
  for (let item = 0; item < 12 && !(await run.evaluate((element) => element === document.activeElement)); item++) await page.keyboard.press("ArrowDown");
  await expect(run).toBeFocused();
  await page.keyboard.press("Enter");
  const view = page.locator("app-run-view");
  await expect(view).toBeVisible();
  await tabTo(page, view.getByRole("button", { name: "Run", exact: true }));
  await page.keyboard.press("Enter");
  await expect(view.getByRole("button", { name: "Run again" })).toBeVisible({ timeout: 15_000 });
  await expect(view).toContainText("By keys");
});

test("@claim:C-067 every dialog and drawer the toolbar opens gives focus back to its button when Escape closes it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();
  for (const opener of ["Request history", "Settings", "Local Bridge settings", "Manage secrets", "New environment", "New collection", "Import a cURL command", "Open command palette"]) {
    const button = page.getByRole("button", { name: opener, exact: true });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog").first(), opener).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null), { message: opener }).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog"), opener).toHaveCount(0);
    await expect(button, opener).toBeFocused();
  }
});

// A dialog that is there to take a name or a passphrase opens on that field:
// its Close button came first, and a keyboard user had to Tab to type.
test("@claim:C-067 a dialog with a field to fill opens with focus on that field", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();
  const opens = async (opener: string, field: Locator) => {
    const button = page.getByRole("button", { name: opener, exact: true });
    // Save to Collection is disabled until the draft has an address, and
    // focus() on a disabled button does nothing: in CI's trace (#316) it came
    // 1 ms after the last key, before the button was enabled.
    await expect(button, `${opener} can take focus`).toBeEnabled();
    await button.focus();
    await expect(button, `${opener} has focus before Enter`).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(field, opener).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog"), opener).toHaveCount(0);
    await expect(button, opener).toBeFocused();
  };
  // A collection, so that Save to Collection has its name field.
  await page.getByRole("button", { name: "New collection", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#creation-name-input")).toBeFocused();
  await page.keyboard.type("Fields");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await opens("Open command palette", page.getByPlaceholder("Type a command"));
  await opens("New environment", page.locator("#new-env-name-input"));
  await opens("Import a cURL command", page.locator("#import-paste-text"));
  await opens("Unlock secrets", page.locator('input[type="password"]').first());
  await page.locator("input.address-url").focus();
  await page.keyboard.type(`${ECHO}/echo`);
  await opens("Save to Collection", page.locator("#save-as-name"));
});

// Send became Cancel and then Send again as two different buttons: the one
// that had focus was removed, and focus fell to the page's body.
test("@claim:C-067 focus stays on Send through a send started from the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator("input.address-url").focus();
  await page.keyboard.type(`${ECHO}/delay/1500`);
  // Send is disabled until the draft has an address, and focus() on a disabled
  // button does nothing: in a local trace (session 11) it came 13 ms after the
  // last key, and Enter sent nothing.
  const send = page.getByRole("button", { name: "Send request" });
  await expect(send, "Send can take focus").toBeEnabled();
  await send.focus();
  await expect(send, "Send has focus before Enter").toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Cancel request" })).toBeFocused();
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Send request" })).toBeFocused();
});
