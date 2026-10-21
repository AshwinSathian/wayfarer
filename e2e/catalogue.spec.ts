// D3.3: the widget catalogue (src/app/catalogue/catalogue.ts), a page of
// development builds only. Every widget in each state passes axe in both
// themes, and in forced colours what is selected is still marked.
import { readdir, readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { axe } from "./support/axe";
import { settled } from "./support/settled";

// CI serves `npm run build:catalogue` on its own port (playwright.config.ts); `ng serve` is a development build.
const CATALOGUE = process.env["CI"] ? "http://localhost:4201/app/?catalogue" : "/app/?catalogue";

async function open(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript((value) => localStorage.setItem("wayfarer:theme", value), theme);
  await page.goto(CATALOGUE);
  await expect(page.getByRole("heading", { name: "Widget catalogue" })).toBeVisible();
}

/** Axe on the whole page; each state's violations are collected, not thrown. */
function scanner(page: Page, found: string[]) {
  return async (state: string) => {
    await settled(page);
    const results = await axe(page).analyze();
    for (const violation of results.violations) {
      for (const node of violation.nodes) found.push(`${state}: ${violation.id}: ${node.target.join(" ")}`);
    }
  };
}

for (const theme of ["light", "dark"] as const) {
  // A test of its own: with the other widgets' scans, Firefox on CI took more than the 30 s a test has.
  test(`the segmented choice, in each state, is free of WCAG 2.2 AA violations in the ${theme} theme`, async ({
    page,
  }) => {
    await open(page, theme);
    const found: string[] = [];
    const scan = scanner(page, found);

    const choice = page.getByRole("radiogroup", { name: "Theme" });
    await choice.getByRole("radio", { name: "Dark" }).click();
    await expect(choice.getByRole("radio", { name: "Dark" })).toBeChecked();
    await scan("segmented, one chosen by a click");
    await choice.getByRole("radio", { name: "Dark" }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(choice.getByRole("radio", { name: "Light" })).toBeFocused();
    await scan("segmented, one focused from the keyboard");
    await choice.getByRole("radio", { name: "System" }).hover();
    await scan("segmented, one under the pointer");

    expect(found).toEqual([]);
  });

  // A test of its own, as the segmented choice's.
  test(`the select, in each state, is free of WCAG 2.2 AA violations in the ${theme} theme`, async ({ page }) => {
    await open(page, theme);
    const found: string[] = [];
    const scan = scanner(page, found);
    const route = page.getByRole("combobox", { name: "Request route" });

    await expect(route).toHaveText("Inherit: Auto");
    await scan("select, closed on its null choice");
    await route.click();
    await expect(page.getByRole("listbox", { name: "Request route" })).toBeVisible();
    await scan("select, open");
    await page.getByRole("option", { name: "Direct" }).hover();
    await scan("select, an option under the pointer");
    await page.getByRole("option", { name: "Direct" }).click();
    await expect(route).toHaveText("Direct");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await scan("select, an option chosen");
    const environment = page.getByRole("combobox", { name: "Environment" });
    await environment.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("End");
    await expect(page.getByRole("option", { name: "Demo" })).toHaveAttribute("data-active", "true");
    await scan("select, a long list on its last option from the keyboard");

    expect(found).toEqual([]);
  });

  // A test of its own, as the segmented choice's: each scan reads the whole page.
  test(`the dialogs, in each state, are free of WCAG 2.2 AA violations in the ${theme} theme`, async ({ page }) => {
    await open(page, theme);
    const found: string[] = [];
    const scan = scanner(page, found);

    await page.getByRole("button", { name: "Open the dialog" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit request" });
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
    await scan("dialog, open");
    await dialog.getByRole("textbox", { name: "Name" }).focus();
    await scan("dialog, a field focused");
    await dialog.getByRole("button", { name: "Delete…" }).click();
    await expect(page.getByRole("alertdialog").getByRole("button", { name: "Cancel" })).toBeFocused();
    await scan("confirmation, centred, over the dialog");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Delete this request" }).click();
    await expect(page.getByRole("alertdialog").getByRole("button", { name: "Cancel" })).toBeFocused();
    await scan("confirmation, under its button");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Open the drawer" }).click();
    const drawer = page.getByRole("dialog", { name: "History" });
    await expect(drawer.getByRole("button", { name: "Close history" })).toBeFocused();
    await scan("drawer, open");
    await drawer.getByRole("textbox", { name: "Search history" }).focus();
    await scan("drawer, a field focused");

    expect(found).toEqual([]);
  });

  // A test of its own, as the segmented choice's: each scan reads the whole page.
  test(`the tooltips, in each state, are free of WCAG 2.2 AA violations in the ${theme} theme`, async ({ page }) => {
    await open(page, theme);
    const found: string[] = [];
    const scan = scanner(page, found);
    const tip = (text: string) => page.getByRole("tooltip").filter({ hasText: text });

    await page.getByRole("button", { name: "New tab", exact: true }).hover();
    await expect(tip("New tab (Alt+T)")).toBeVisible();
    await scan("tooltip, under the pointer");
    await page.getByRole("button", { name: "Delete", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(tip("Time to first byte")).toBeVisible();
    await scan("tooltip, long, from the keyboard");
    await page.getByText("GET /orders").hover();
    await expect(tip("200 OK")).toBeVisible();
    await scan("tooltip, a card");
    await page.mouse.move(0, 0);

    await page.getByRole("button", { name: "Open the drawer" }).focus();
    await page.keyboard.press("Enter");
    await expect(tip("Close history (Esc)")).toBeVisible();
    await scan("tooltip, in the drawer");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Open the dialog" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit request" });
    await dialog.getByRole("button", { name: "Duplicate" }).hover();
    await expect(tip("Duplicate")).toBeVisible();
    await scan("tooltip, in a dialog");

    expect(found).toEqual([]);
  });

  // A test of its own, as the segmented choice's.
  test(`the buttons, in each state, are free of WCAG 2.2 AA violations in the ${theme} theme`, async ({ page }) => {
    await open(page, theme);
    const found: string[] = [];
    const scan = scanner(page, found);
    await page.getByRole("heading", { name: "Buttons" }).scrollIntoViewIfNeeded();
    await scan("buttons, at rest");
    await page.getByRole("button", { name: "Outlined secondary" }).hover();
    await scan("buttons, one under the pointer");
    await page.getByRole("button", { name: "Text secondary" }).focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await scan("buttons, one focused from the keyboard");
    expect(found).toEqual([]);
  });

  // A test of its own, as the segmented choice's.
  test(`the text fields, in each state, are free of WCAG 2.2 AA violations in the ${theme} theme`, async ({ page }) => {
    await open(page, theme);
    const found: string[] = [];
    const scan = scanner(page, found);
    await page.getByRole("heading", { name: "Text fields" }).scrollIntoViewIfNeeded();
    await scan("text fields, at rest");
    await page.getByLabel("Name", { exact: true }).hover();
    await scan("text fields, one under the pointer");
    await page.getByLabel("Value", { exact: true }).focus();
    await scan("text fields, one focused");
    await page.getByLabel("Message", { exact: true }).fill("hello");
    await scan("text fields, several lines typed");
    expect(found).toEqual([]);
  });

  // A test of its own, as the segmented choice's.
  test(`the spinner is free of WCAG 2.2 AA violations in the ${theme} theme`, async ({ page }) => {
    await open(page, theme);
    const found: string[] = [];
    await page.getByRole("progressbar", { name: "Loading secrets" }).scrollIntoViewIfNeeded();
    await scanner(page, found)("spinner, in buttons and on its own");
    expect(found).toEqual([]);
  });

  // Two tests, not one: each scan reads the whole page, and with every family in it one test took more than its 30 s in Firefox on CI.
  test(`the tree and the menus, in each state, are free of WCAG 2.2 AA violations in the ${theme} theme`, async ({
    page,
  }) => {
    await open(page, theme);
    const found: string[] = [];
    const scan = scanner(page, found);
    const tree = page.getByRole("tree", { name: "Collections" });
    const row = (name: string) => tree.getByRole("treeitem", { name, exact: true });

    await scan("tree");
    await row("Webhooks").click();
    await expect(row("PUT Replay an event")).toBeVisible();
    await scan("tree, a folder opened and selected");
    await row("POST Create a refund").click();
    await scan("tree, a request selected");
    await page.keyboard.press("ArrowDown");
    await expect(row("GET Refund by id")).toBeFocused();
    await scan("tree, a row focused from the keyboard");
    await row("PATCH Update a plan").hover();
    await scan("tree, a row under the pointer");

    await page.getByRole("button", { name: "Export" }).click();
    await expect(page.getByRole("menuitem").first()).toBeFocused();
    await scan("menu, open from its button");
    await page.getByRole("menuitem", { name: "Delete" }).hover();
    await scan("menu, an item under the pointer");
    await page.keyboard.press("Escape");
    await row("HEAD Ping").click({ button: "right" });
    await expect(page.getByRole("menuitem").first()).toBeFocused();
    await scan("menu, a row's, at the pointer");
    await page.keyboard.press("Escape");

    expect(found).toEqual([]);
  });

  test(`the tabs and the accordion, in each state, are free of WCAG 2.2 AA violations in the ${theme} theme`, async ({
    page,
  }) => {
    await open(page, theme);
    const found: string[] = [];
    const scan = scanner(page, found);
    const parts = page.getByRole("tablist", { name: "Request parts" });
    await parts.getByRole("tab", { name: "Tests" }).click();
    await scan("tabs, one chosen by a click");
    await page.keyboard.press("ArrowLeft");
    await expect(parts.getByRole("tab", { name: "Body" })).toBeFocused();
    await scan("tabs, one focused from the keyboard");
    await parts.getByRole("tab", { name: "Params" }).hover();
    await scan("tabs, one under the pointer");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("tabpanel", { name: "Body" })).toBeFocused();
    await scan("tabs, a pane focused");
    await page.getByRole("button", { name: "Open the last request from code" }).click();
    await scan("tabs, a bar too narrow for its tabs");

    const header = (name: string) => page.locator(".catalogue-accordion").getByRole("button", { name, exact: true });
    await header("Auth").click();
    await expect(header("Auth")).toHaveAttribute("aria-expanded", "true");
    await scan("accordion, a section opened by a click");
    await header("Auth").focus();
    await page.keyboard.press("ArrowUp");
    await expect(header("Headers")).toBeFocused();
    await scan("accordion, a header focused from the keyboard");
    await header("Params").hover();
    await scan("accordion, a header under the pointer");
    await page.getByLabel("Header value").focus();
    await scan("accordion, a field in a section focused");

    expect(found).toEqual([]);
  });
}

test("tree: the keys of WAI-ARIA's tree pattern, typeahead, and one tab stop", async ({ page }) => {
  await open(page, "light");
  const tree = page.getByRole("tree", { name: "Collections" });
  const row = (name: string) => tree.getByRole("treeitem", { name, exact: true });

  // One row is in the tab order: the first, until one is selected.
  await expect(tree.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(row("Payments API")).toBeFocused();
  await expect(row("Payments API")).toHaveAttribute("aria-level", "1");
  await page.keyboard.press("ArrowDown");
  await expect(row("Refunds")).toBeFocused();
  await expect(row("Refunds")).toHaveAttribute("aria-level", "2");
  await page.keyboard.press("ArrowRight");
  await expect(row("POST Create a refund")).toBeFocused();
  await expect(row("POST Create a refund")).toHaveAttribute("aria-level", "3");
  await page.keyboard.press("ArrowLeft");
  await expect(row("Refunds")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(row("Refunds")).toHaveAttribute("aria-expanded", "false");
  await expect(row("POST Create a refund")).toHaveCount(0);
  await page.keyboard.press("End");
  await expect(row("A closed collection")).toBeFocused();
  // No wrap at either end.
  await page.keyboard.press("ArrowDown");
  await expect(row("A closed collection")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(row("Payments API")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(row("Payments API")).toBeFocused();

  // A letter goes to the next row that starts with it.
  await page.keyboard.press("w");
  await expect(row("Webhooks")).toBeFocused();

  // Enter selects. The tab stop is the row last focused, not the selected one: Tab back in returns to where the user was.
  await page.keyboard.press("Enter");
  await expect(row("Webhooks")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(tree.locator('[role="treeitem"][tabindex="0"]')).toHaveAccessibleName("Payments API");
});

test("menu: a button's menu, by the keys of WAI-ARIA's menu button pattern", async ({ page }) => {
  await open(page, "light");
  const button = page.getByRole("button", { name: "Export" });
  const item = (name: string) => page.getByRole("menuitem", { name, exact: true });
  await expect(button).toHaveAttribute("aria-haspopup", "true");
  await expect(button).toHaveAttribute("aria-expanded", "false");

  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("menuitem")).toHaveText(["Copy as cURL", "Export as HAR…", "Delete"]);
  await expect(item("Copy as cURL")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(item("Export as HAR…")).toBeFocused();
  await page.keyboard.press("End");
  await expect(item("Delete")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(item("Copy as cURL")).toBeFocused();
  // A letter goes to the next item that starts with it.
  await page.keyboard.press("d");
  await expect(item("Delete")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(button).toBeFocused();

  // ArrowUp opens it at its last item; Enter runs one, and focus goes back to the button.
  await page.keyboard.press("ArrowUp");
  await expect(item("Delete")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Chose Export as HAR….");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(button).toBeFocused();

  // Space opens it too; Tab leaves and closes it.
  await page.keyboard.press(" ");
  await expect(item("Copy as cURL")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("menu: a row's menu opens at the pointer and at the row, for that row, and gives focus back to it", async ({
  page,
}) => {
  await open(page, "light");
  const tree = page.getByRole("tree", { name: "Collections" });
  const row = (name: string) => tree.getByRole("treeitem", { name, exact: true });

  const box = (await row("HEAD Ping").boundingBox())!;
  await page.mouse.click(box.x + 120, box.y + box.height / 2, { button: "right" });
  const menu = page.getByRole("menu");
  await expect(page.getByRole("menuitem").first()).toBeFocused();
  // At the pointer: its corner is where the button was released.
  const at = (await menu.boundingBox())!;
  expect(Math.abs(at.x - (box.x + 120))).toBeLessThan(5);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Chose Duplicate for Ping.");
  await expect(row("HEAD Ping")).toBeFocused();

  // Shift+F10 opens it at the row; Escape closes it and focus goes back to the row.
  await page.keyboard.press("ArrowUp");
  await expect(row("PATCH Update a plan")).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(row("PATCH Update a plan")).toBeFocused();

  // A click outside closes it, and focus stays where the click put it.
  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.getByRole("menu")).toHaveCount(1);
  await expect(page.getByRole("menuitem").first()).toHaveText("Copy as cURL");
});

test("dialog: focus starts on its first element, Tab and Shift+Tab wrap, Escape closes it and focus goes back", async ({
  page,
}) => {
  await open(page, "light");
  const opener = page.getByRole("button", { name: "Open the dialog" });
  const dialog = page.getByRole("dialog", { name: "Edit request" });
  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  const close = dialog.getByRole("button", { name: "Close" });
  await expect(close).toBeFocused();

  // Close, the name, the select, the menu's button, the tooltip's, Delete, Cancel, Save; then Close again.
  for (let i = 0; i < 7; i++) await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Save" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Save" })).toBeFocused();

  // The page under it does not scroll.
  const scrolled = await page.evaluate(() => scrollY);
  await page.mouse.move(10, 10);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  // A click on the backdrop closes it.
  await page.keyboard.press("Enter");
  await expect(close).toBeFocused();
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
});

test("dialog: Escape closes a select's list or a menu inside it first, and a tooltip does not keep it open", async ({
  page,
}) => {
  await open(page, "light");
  await page.getByRole("button", { name: "Open the dialog" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit request" });
  const select = dialog.getByRole("combobox", { name: "Environment" });
  // A list is placed when it opens: in a dialog still growing in, against where the select was then (as on Material's).
  await dialog.evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));

  // The list is drawn over the dialog: both are in the top layer, the list the later.
  await select.focus();
  await page.keyboard.press("Enter");
  const list = page.getByRole("listbox", { name: "Environment" });
  await expect(list).toBeVisible();
  const box = (await list.boundingBox())!;
  // Against the select, as outside a dialog: the dialog's entrance left nothing that moves it.
  const field = (await select.boundingBox())!;
  await expect.poll(async () => Math.abs((await list.boundingBox())!.x - field.x)).toBeLessThan(2);
  expect(
    await list.evaluate(
      (el, [x, y]) => el.contains(document.elementFromPoint(x, y)),
      [box.x + box.width / 2, box.y + 12],
    ),
  ).toBe(true);
  await page.getByRole("option", { name: "Staging" }).click();
  await expect(select).toHaveText("Staging");
  await page.keyboard.press("Enter");
  await expect(list).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(select).toBeFocused();

  // A menu: its items take the pointer.
  await dialog.getByRole("button", { name: "Copy as" }).click();
  await page.getByRole("menuitem", { name: "Export as HAR…" }).click();
  await expect(page.getByRole("status")).toHaveText("Chose Export as HAR….");
  await dialog.getByRole("button", { name: "Copy as" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(dialog).toBeVisible();

  // A tooltip shown from the keyboard: Escape closes the dialog, and the tooltip with it.
  await page.mouse.move(400, 400);
  await dialog.getByRole("button", { name: "Copy as" }).focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Duplicate" })).toBeFocused();
  const tooltip = dialog.getByRole("tooltip").filter({ hasText: "Duplicate" });
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(tooltip).toHaveCount(0);
});

test("confirmation: over a dialog and under a button, focus on Cancel, Tab stays in, Escape or a click outside cancels, focus goes back", async ({
  page,
}) => {
  await open(page, "light");
  await page.getByRole("button", { name: "Open the dialog" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit request" });
  const ask = dialog.getByRole("button", { name: "Delete…" });
  await ask.focus();
  await page.keyboard.press("Enter");
  const confirm = page.getByRole("alertdialog", { name: "Delete the request?" });
  await expect(confirm).toHaveAccessibleDescription("It cannot be brought back.");
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(confirm.getByRole("button", { name: "Delete" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(ask).toBeFocused();
  await expect(page.getByRole("status")).toHaveText("Kept.");
  await page.keyboard.press("Escape");

  // Under its button, placed against it; a click outside is a no.
  const button = page.getByRole("button", { name: "Delete this request" });
  await button.click();
  const popup = page.getByRole("alertdialog", { name: "Remove this request?" });
  await expect(popup.getByRole("button", { name: "Cancel" })).toBeFocused();
  // 10 px under it, or above it where there is no room under it, centred on it; measured as laid out, not as it grows in.
  const place = await popup.evaluate(
    (el, b) => {
      const p = { y: el.offsetTop, height: el.offsetHeight, x: el.offsetLeft, width: el.offsetWidth };
      return {
        gap: p.y > b.y ? p.y - (b.y + b.height) : b.y - (p.y + p.height),
        off: Math.abs(p.x + p.width / 2 - (b.x + b.width / 2)),
      };
    },
    (await button.boundingBox())!,
  );
  // The button may sit at a fraction of a pixel: WebKit measured 9.5 on CI.
  expect(Math.abs(place.gap - 10)).toBeLessThan(1);
  expect(place.off).toBeLessThan(1);
  await page.mouse.click(5, 5);
  await expect(popup).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("Kept.");
  await button.click();
  await popup.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("status")).toHaveText("Deleted.");
});

test("drawer: a modal dialog at the window's edge, and what opens from it takes the pointer", async ({ page }) => {
  await open(page, "light");
  const opener = page.getByRole("button", { name: "Open the drawer" });
  const drawer = page.getByRole("dialog", { name: "History" });
  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(drawer).toHaveAttribute("aria-modal", "true");
  const close = drawer.getByRole("button", { name: "Close history" });
  await expect(close).toBeFocused();
  await expect.poll(async () => (await drawer.boundingBox())!.x).toBe(0);

  // Close, the search, the entry, Delete entry; then Close again.
  for (let i = 0; i < 3; i++) await page.keyboard.press("Tab");
  await expect(drawer.getByRole("button", { name: "Delete entry" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(drawer.getByRole("button", { name: "Delete entry" })).toBeFocused();

  // A confirmation from the drawer: over it, and its buttons take a click.
  await drawer.getByRole("button", { name: "Delete entry" }).click();
  const popup = page.getByRole("alertdialog", { name: "Remove this request?" });
  await popup.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("status")).toHaveText("Deleted.");
  await expect(drawer).toBeVisible();

  // A menu at the pointer, and a card on hover that stays while the pointer is on it: in the drawer, not in the inert page.
  const entry = drawer.getByText("GET /users");
  const at = (await entry.boundingBox())!;
  await page.mouse.click(at.x + 10, at.y + at.height / 2, { button: "right" });
  await expect(page.getByRole("menuitem").first()).toBeFocused();
  // At the pointer: the drawer's slide left nothing that moves a popup in it.
  const menuBox = (await page.getByRole("menu").boundingBox())!;
  expect(Math.abs(menuBox.x - (at.x + 10))).toBeLessThan(5);
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.getByRole("status")).toHaveText(/^Chose Duplicate/);
  await expect(entry).toBeFocused();
  await entry.hover();
  const card = page.getByRole("tooltip").filter({ hasText: "200 OK" });
  await expect(card).toBeVisible();
  const c = (await card.boundingBox())!;
  await page.mouse.move(c.x + 10, c.y + 5, { steps: 4 });
  await page.waitForTimeout(200);
  await expect(card).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(close).toBeFocused();
  await page.mouse.click(600, 300);
  await expect(drawer).toBeHidden();
});

/** Where a tooltip is, by its layout box: its entrance scales it. */
const layout = (tip: Locator) =>
  tip.evaluate((el: HTMLElement) => ({
    left: el.offsetLeft,
    top: el.offsetTop,
    right: el.offsetLeft + el.offsetWidth,
    bottom: el.offsetTop + el.offsetHeight,
  }));

test("tooltip: from the keyboard, described, above or below, and Escape hides it and goes on", async ({
  page,
  browserName,
}) => {
  await open(page, "light");
  // The pointer stays at (0, 0): nothing of a tooltip is ever drawn there.
  const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
  const tip = (text: string) => page.getByRole("tooltip").filter({ hasText: text });
  const newTab = page.getByRole("button", { name: "New tab", exact: true });
  await page.getByRole("button", { name: "Export" }).focus();
  for (let i = 0; i < 4 && !(await newTab.evaluate((el) => el === document.activeElement)); i++)
    await page.keyboard.press(tab);
  await expect(newTab).toBeFocused();
  await expect(tip("New tab (Alt+T)")).toBeVisible();
  // It adds a key to the name, so it describes the button; Delete's repeats the name, and does not.
  await expect(newTab).toHaveAccessibleDescription("New tab (Alt+T)");
  const host = (await newTab.boundingBox())!;
  expect(Math.abs((await layout(tip("New tab (Alt+T)"))).top - (host.y + host.height + 8))).toBeLessThan(1);

  await page.keyboard.press(tab);
  const del = page.getByRole("button", { name: "Delete", exact: true });
  await expect(del).toBeFocused();
  await expect(tip("New tab (Alt+T)")).toBeHidden();
  await expect(tip("Delete")).toBeVisible();
  await expect(del).toHaveAccessibleDescription("");
  const d = (await del.boundingBox())!;
  expect(Math.abs((await layout(tip("Delete"))).bottom - (d.y - 8))).toBeLessThan(1);

  // A long text wraps at its width.
  await page.keyboard.press(tab);
  const long = await layout(tip("Time to first byte"));
  expect(long.right - long.left).toBeLessThanOrEqual(222);
  expect(long.bottom - long.top).toBeGreaterThan(40);

  // A menu button stops Escape on itself: its tooltip hears the key first, and the menu stays closed.
  await page.keyboard.press(tab);
  const copy = page.getByRole("button", { name: "Copy as" }).first();
  await expect(copy).toBeFocused();
  await expect(tip("Copy the request")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tip("Copy the request")).toBeHidden();
  await expect(copy).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem").first()).toBeFocused();
  await expect(tip("Copy the request")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(copy).toBeFocused();

  // Elsewhere the key goes on to the page: a tooltip does not stop it.
  await page.keyboard.press(`Shift+${tab}`);
  await expect(tip("Time to first byte")).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { escapes: number }).escapes = 0;
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") (window as unknown as { escapes: number }).escapes++;
    });
  });
  await page.keyboard.press("Escape");
  await expect(tip("Time to first byte")).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { escapes: number }).escapes)).toBe(1);
});

test("tooltip: the pointer shows it, may rest on it, and a press or leaving hides it; a click's focus and a touch do not", async ({
  page,
}) => {
  await open(page, "light");
  const tip = page.getByRole("tooltip").filter({ hasText: "New tab (Alt+T)" });
  const newTab = page.getByRole("button", { name: "New tab", exact: true });
  await newTab.hover();
  await expect(tip).toBeVisible();
  // The gap to the button is the tooltip's: a pointer crossing it is never on neither, however slow its moves.
  const n = (await newTab.boundingBox())!;
  expect(
    await tip.evaluate(
      (el, [x, y]) => el.contains(document.elementFromPoint(x, y)),
      [n.x + n.width / 2, n.y + n.height + 4],
    ),
  ).toBe(true);
  const t = await layout(tip);
  await page.mouse.move(t.left + 10, t.top + 5, { steps: 4 });
  await page.waitForTimeout(200);
  await expect(tip).toBeVisible();
  await page.mouse.move(400, 10);
  await expect(tip).toBeHidden();

  await newTab.hover();
  await expect(tip).toBeVisible();
  await page.mouse.down();
  await expect(tip).toBeHidden();
  await page.mouse.up();
  await page.mouse.move(400, 10);
  await page.waitForTimeout(200);
  await expect(tip).toBeHidden();

  // A card: the pointer on it keeps it.
  await page.getByText("GET /orders").hover();
  const card = page.getByRole("tooltip").filter({ hasText: "200 OK" });
  await expect(card).toBeVisible();
  const c = await layout(card);
  await page.mouse.move(c.left + 10, c.top + 5, { steps: 4 });
  await page.waitForTimeout(200);
  await expect(card).toBeVisible();
});

test.describe("tooltip on a touch screen", () => {
  test.use({ hasTouch: true });
  test("a tap does not show it", async ({ page }) => {
    await open(page, "light");
    await page.getByRole("button", { name: "New tab", exact: true }).tap();
    await page.waitForTimeout(300);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  });
});

test("tooltip: at the window's edge it takes the other side and stays inside", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page, "light");
  const tip = (text: string) => page.getByRole("tooltip").filter({ hasText: text });

  const settings = page.getByRole("button", { name: "Settings", exact: true });
  await settings.hover();
  const s = await layout(tip("Settings (Ctrl+,)"));
  expect(s.right).toBeLessThanOrEqual(360 - 8);

  // Below, at the window's bottom: above. Above, at the window's top: below.
  const newTab = page.getByRole("button", { name: "New tab", exact: true });
  await page.mouse.move(0, 0);
  await newTab.evaluate((el) =>
    window.scrollBy({ top: el.getBoundingClientRect().bottom - innerHeight + 2, behavior: "instant" }),
  );
  await newTab.hover();
  const n = (await newTab.boundingBox())!;
  expect((await layout(tip("New tab (Alt+T)"))).bottom).toBeLessThanOrEqual(n.y - 7);

  const del = page.getByRole("button", { name: "Delete", exact: true });
  await page.mouse.move(0, 0);
  await del.evaluate((el) => window.scrollBy({ top: el.getBoundingClientRect().top - 2, behavior: "instant" }));
  await del.hover();
  const d = (await del.boundingBox())!;
  expect((await layout(tip("Delete"))).top).toBeGreaterThanOrEqual(d.y + d.height + 7);
});

test("tooltip: in the drawer it is in the drawer, and Escape closes the drawer and the tooltip", async ({ page }) => {
  await open(page, "light");
  await page.getByRole("button", { name: "Open the drawer" }).focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog", { name: "History" });
  const tip = drawer.getByRole("tooltip").filter({ hasText: "Close history (Esc)" });
  await expect(tip).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Close history" })).toHaveAccessibleDescription(
    "Close history (Esc)",
  );
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  // Opened by a click, the first element's focus is not the keyboard's: no tooltip.
  await page.getByRole("button", { name: "Open the drawer" }).click();
  await expect(drawer.getByRole("button", { name: "Close history" })).toBeFocused();
  await page.waitForTimeout(200);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("tooltip: with reduced motion it appears at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "light");
  await page.getByRole("button", { name: "New tab", exact: true }).hover();
  const tip = page.getByRole("tooltip").filter({ hasText: "New tab (Alt+T)" });
  await expect(tip).toBeVisible();
  const durations = await tip.evaluate((el) =>
    el.getAnimations().map((animation) => Number(animation.effect?.getComputedTiming().duration)),
  );
  expect(durations.every((ms) => ms <= 0.001)).toBe(true);
});

test("tabs: the keys of WAI-ARIA's tabs pattern, one tab stop, and the panes", async ({ page }) => {
  await open(page, "light");
  const parts = page.getByRole("tablist", { name: "Request parts" });
  const tab = (name: string) => parts.getByRole("tab", { name, exact: true });
  const shown = page.locator(".tabs", { has: parts }).getByRole("tabpanel");

  // One tab is in the tab order: the chosen one. Its pane is the only one shown, and is labelled by it.
  await expect(parts.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
  await tab("Headers").focus();
  await expect(tab("Headers")).toHaveAttribute("aria-selected", "true");
  await expect(shown).toHaveCount(1);
  await expect(shown).toHaveAccessibleName("Headers");
  await page.getByLabel("Header name").fill("Accept");

  // A focused tab is chosen. The arrows wrap; Home and End go to the ends.
  await tab("Headers").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab("Body")).toBeFocused();
  await expect(tab("Body")).toHaveAttribute("aria-selected", "true");
  await expect(shown).toHaveAccessibleName("Body");
  await page.keyboard.press("End");
  await expect(tab("Tests 2")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(tab("Params")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(tab("Tests 2")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(tab("Params")).toHaveAttribute("aria-selected", "true");
  await expect(parts.locator('[role="tab"][tabindex="0"]')).toHaveAccessibleName("Params");

  // Tab goes on to the pane, then into it; a pane kept its field while another was shown.
  await tab("Headers").click();
  await expect(page.getByLabel("Header name")).toHaveValue("Accept");
  await page.keyboard.press("Tab");
  await expect(shown).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Header name")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(tab("Headers")).toBeFocused();
});

test("tabs: a tab chosen by code takes the tab stop and is brought into a narrow bar", async ({ page }) => {
  await open(page, "light");
  const strip = page.getByRole("tablist", { name: "Open requests" });
  const tab = (name: RegExp) => strip.getByRole("tab", { name });
  await tab(/List users/).focus();
  await page.getByRole("button", { name: "Open the last request from code" }).click();
  await expect(tab(/Delete a customer/)).toHaveAttribute("aria-selected", "true");
  await expect(strip.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
  await expect(strip.locator('[role="tab"][tabindex="0"]')).toHaveAccessibleName(/Delete a customer/);
  const bar = (await strip.boundingBox())!;
  const chosen = (await tab(/Delete a customer/).boundingBox())!;
  expect(chosen.x + chosen.width).toBeLessThanOrEqual(bar.x + bar.width + 1);
  // The arrows move from it, not from the tab that had focus before. (Shift+Tab back from the button
  // is not used: WebKit left focus on a button focused by a script.)
  await tab(/Delete a customer/).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(tab(/Replay an event/)).toHaveAttribute("aria-selected", "true");
});

test("accordion: the keys of WAI-ARIA's accordion pattern, and keys typed inside a section", async ({ page }) => {
  await open(page, "light");
  const accordion = page.locator(".catalogue-accordion");
  const header = (name: string) => accordion.getByRole("button", { name, exact: true });

  // Every header is in the tab order; each names the region it opens.
  await expect(header("Headers")).toHaveAttribute("aria-expanded", "true");
  await expect(header("Params")).toHaveAttribute("aria-expanded", "false");
  await expect(accordion.getByRole("region")).toHaveCount(1);
  await expect(accordion.getByRole("region")).toHaveAccessibleName("Headers");
  await header("Params").focus();
  await page.keyboard.press("Tab");
  await expect(header("Headers")).toBeFocused();

  // Enter and Space open and close; the arrows, Home and End move between headers, without wrapping.
  await header("Params").focus();
  await page.keyboard.press("Enter");
  await expect(header("Params")).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press(" ");
  await expect(header("Params")).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowDown");
  await expect(header("Headers")).toBeFocused();
  await page.keyboard.press("End");
  await expect(header("Auth")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(header("Auth")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(header("Params")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(header("Params")).toBeFocused();

  // What is typed in a section is the field's: Space and the arrows do not open, close or move.
  const field = page.getByLabel("Header value");
  await field.click();
  await page.keyboard.type("text/plain; q=1");
  await page.keyboard.press("Home");
  await page.keyboard.type("x ");
  await expect(field).toHaveValue("x text/plain; q=1");
  await expect(field).toBeFocused();
  await expect(header("Headers")).toHaveAttribute("aria-expanded", "true");
  // Enter on a button in a section presses it.
  await accordion.getByRole("button", { name: "Add header" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Pressed Add header.");
  await expect(header("Headers")).toHaveAttribute("aria-expanded", "true");

  // A section keeps what was typed while it was closed.
  await header("Headers").click();
  await expect(field).toBeHidden();
  await header("Headers").click();
  await expect(field).toHaveValue("x text/plain; q=1");
});

test("segmented: the keys of WAI-ARIA's radio group, one tab stop, and a choice made by code", async ({ page }) => {
  await open(page, "light");
  const theme = page.getByRole("radiogroup", { name: "Theme" });
  const route = page.getByRole("radiogroup", { name: "Route" });
  const option = (group: typeof theme, name: string) => group.getByRole("radio", { name, exact: true });
  await expect(option(theme, "System")).toBeChecked();

  // The arrows move and choose, and wrap at both ends.
  await option(theme, "System").focus();
  await page.keyboard.press("ArrowRight");
  await expect(option(theme, "Light")).toBeFocused();
  await expect(option(theme, "Light")).toBeChecked();
  await page.keyboard.press("ArrowDown");
  await expect(option(theme, "Dark")).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(option(theme, "System")).toBeChecked();
  await page.keyboard.press("ArrowLeft");
  await expect(option(theme, "Dark")).toBeFocused();
  await expect(option(theme, "Dark")).toBeChecked();
  // The option an arrow moved to shows its focus ring (WebKit's own arrows took it away).
  await expect(option(theme, "Dark")).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Space");
  await expect(option(theme, "Dark")).toBeChecked();
  await expect(theme.getByRole("radio", { checked: true })).toHaveCount(1);

  // One tab stop a group, on its chosen option; the next group is apart from this one.
  await page.keyboard.press("Tab");
  await expect(option(route, "Auto")).toBeFocused();
  await expect(option(theme, "Dark")).toBeChecked();
  await page.keyboard.press("Tab");
  const fromCode = page.getByRole("button", { name: "Choose Local Bridge from code" });
  await expect(fromCode).toBeFocused();

  // A choice made by code takes the tab stop.
  await page.keyboard.press("Enter");
  await expect(option(route, "Local Bridge")).toBeChecked();
  await page.keyboard.press("Shift+Tab");
  await expect(option(route, "Local Bridge")).toBeFocused();

  // A click on an option's text chooses it: the text lets the pointer through to its radio button.
  const text = await route.getByText("Direct", { exact: true }).boundingBox();
  if (!text) throw new Error("Direct is not drawn");
  await page.mouse.click(text.x + text.width / 2, text.y + text.height / 2);
  await expect(option(route, "Direct")).toBeChecked();
});

test("select: closed keys choose, the list's keys, and focus kept on the select", async ({ page }) => {
  await open(page, "light");
  const route = page.getByRole("combobox", { name: "Request route" });
  const environment = page.getByRole("combobox", { name: "Environment" });
  const listbox = page.getByRole("listbox");
  const option = (name: string) => page.getByRole("option", { name, exact: true });

  // Closed, the arrows, Home, End and a letter choose, as a native select does, and the list stays shut.
  await route.focus();
  await page.keyboard.press("ArrowDown");
  await expect(route).toHaveText("Auto");
  await page.keyboard.press("End");
  await expect(route).toHaveText("Local Bridge");
  await page.keyboard.press("Home");
  await expect(route).toHaveText("Inherit: Auto");
  await page.keyboard.press("d");
  await expect(route).toHaveText("Direct");
  await expect(listbox).toHaveCount(0);
  await expect(route).toHaveAttribute("aria-expanded", "false");

  // Enter opens it on the chosen option; focus stays on the select, which points at the option the keys are on.
  await page.keyboard.press("Enter");
  await expect(option("Direct")).toHaveAttribute("aria-selected", "true");
  await expect(route).toHaveAttribute("aria-expanded", "true");
  await expect(route).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(route).toHaveAttribute("aria-activedescendant", (await option("Local Bridge").getAttribute("id")) ?? "");
  await page.keyboard.press("Enter");
  await expect(listbox).toHaveCount(0);
  await expect(route).toHaveText("Local Bridge");
  await expect(route).toBeFocused();

  // Space opens it, Escape closes it with nothing changed.
  await page.keyboard.press(" ");
  await expect(listbox).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Escape");
  await expect(listbox).toHaveCount(0);
  await expect(route).toHaveText("Local Bridge");
  await expect(route).toBeFocused();

  // Enter on the chosen option closes the list.
  await page.keyboard.press("Enter");
  await expect(listbox).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(listbox).toHaveCount(0);
  await expect(route).toHaveText("Local Bridge");

  // Keys sent at once after the one that opened it are kept.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(route).toHaveText("Inherit: Auto");
  await expect(listbox).toHaveCount(0);

  // Alt+ArrowDown opens it; Tab chooses the option the keys are on, and goes on to the next.
  await page.keyboard.press("Alt+ArrowDown");
  await expect(listbox).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  await expect(listbox).toHaveCount(0);
  await expect(route).toHaveText("Auto");
  await expect(environment).toBeFocused();

  // A long list scrolls to the option the keys are on; a letter finds one in it.
  await page.keyboard.press("Enter");
  await page.keyboard.press("End");
  const shown = () =>
    option("Demo").evaluate((el) => {
      const list = el.closest('[role="listbox"]')!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return box.top >= list.top && box.bottom <= list.bottom + 1;
    });
  await expect.poll(shown).toBe(true);
  await page.keyboard.press("s");
  await expect(option("Staging")).toHaveAttribute("data-active", "true");
  await page.keyboard.press("Enter");
  await expect(environment).toHaveText("Staging");

  // A press in the list, held as a person holds it, keeps focus on the select, and its release chooses.
  await route.click();
  const direct = await option("Direct").boundingBox();
  if (!direct) throw new Error("Direct is not drawn");
  await page.mouse.move(direct.x + direct.width / 2, direct.y + direct.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect(route).toHaveText("Direct");
  await expect(listbox).toHaveCount(0);
  await expect(route).toBeFocused();

  // A click outside closes it.
  await route.click();
  await expect(listbox).toBeVisible();
  await page.getByRole("heading", { name: "Widget catalogue" }).click();
  await expect(listbox).toHaveCount(0);
  await expect(route).toHaveText("Direct");
});

test("select: in forced colours the option the keys are on and the chosen one are still marked", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "light");
  test.skip(
    !(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)),
    "this engine does not emulate forced colours",
  );
  const route = page.getByRole("combobox", { name: "Request route" });
  await route.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  const option = (name: string) => page.getByRole("option", { name, exact: true });
  // The background that marks the option the keys are on is taken away; an outline is not.
  await expect(option("Auto")).toHaveCSS("outline-style", "solid");
  await expect(option("Inherit: Auto")).toHaveCSS("outline-style", "none");
  // The chosen option keeps its tick.
  await expect(option("Inherit: Auto").locator(".ui-select-check")).toBeVisible();
  await expect(option("Auto").locator(".ui-select-check")).toBeHidden();
});

test("segmented: in forced colours the chosen option is still marked", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "light");
  test.skip(
    !(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)),
    "this engine does not emulate forced colours",
  );
  const theme = page.getByRole("radiogroup", { name: "Theme" });
  // The raised background is taken away; a border is not.
  const mark = (name: string) =>
    theme
      .getByRole("radio", { name, exact: true })
      .evaluate((el) => `${getComputedStyle(el).borderTopStyle} ${getComputedStyle(el).borderTopWidth}`);
  await expect.poll(() => mark("System")).toBe("solid 2px");
  expect(await mark("Light")).not.toContain("solid");
});

test("accordion: in forced colours an open section is still marked", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "light");
  test.skip(
    !(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)),
    "this engine does not emulate forced colours",
  );
  const chevron = (name: string) =>
    page
      .locator(".catalogue-accordion")
      .getByRole("button", { name, exact: true })
      .locator(".section-chevron")
      .evaluate((el) => getComputedStyle(el).transform);
  // Its colour is taken away; the chevron turned over is not.
  await expect.poll(() => chevron("Headers")).not.toBe("none");
  expect(await chevron("Params")).toBe("none");
});

test("tabs: in forced colours the chosen tab is still marked", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "light");
  test.skip(
    !(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)),
    "this engine does not emulate forced colours",
  );
  const parts = page.getByRole("tablist", { name: "Request parts" });
  const line = (name: string) =>
    parts.getByRole("tab", { name, exact: true }).evaluate((el) => {
      const after = getComputedStyle(el, "::after");
      return after.content === "none" ? "none" : `${after.borderBottomStyle} ${after.borderBottomWidth}`;
    });
  await expect.poll(() => line("Headers")).toBe("solid 2px");
  expect(await line("Body")).toBe("none");
});

test("tree: in forced colours the selected row is still marked", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "light");
  test.skip(
    !(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)),
    "this engine does not emulate forced colours",
  );
  const tree = page.getByRole("tree", { name: "Collections" });
  const row = (name: string) => tree.getByRole("treeitem", { name, exact: true });
  await row("PATCH Update a plan").click();

  // The background that marks it otherwise is taken away.
  const mark = (name: string) => row(name).evaluate((el) => getComputedStyle(el).borderInlineStartWidth);
  // The class comes with the next render, not with the click.
  await expect.poll(() => mark("PATCH Update a plan")).toBe("4px");
  expect(await mark("HEAD Ping")).toBe("0px");
});

test("dialogs: in forced colours the edge of a dialog, a confirmation and the drawer still shows", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "light");
  test.skip(
    !(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)),
    "this engine does not emulate forced colours",
  );
  // The shadow and the backdrop are taken away; a border is not.
  const edge = (name: string, side: "Top" | "Right") =>
    page.getByRole(name === "Remove this request?" ? "alertdialog" : "dialog", { name }).evaluate((el, s) => {
      const style = getComputedStyle(el);
      return `${style.getPropertyValue(`border-${s.toLowerCase()}-style`)} ${style.getPropertyValue(`border-${s.toLowerCase()}-width`)}`;
    }, side);
  await page.getByRole("button", { name: "Open the dialog" }).click();
  expect(await edge("Edit request", "Top")).toBe("solid 1px");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Delete this request" }).click();
  expect(await edge("Remove this request?", "Top")).toBe("solid 1px");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open the drawer" }).click();
  expect(await edge("History", "Right")).toBe("solid 1px");
});

test("tooltip: in forced colours its edge still shows", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "light");
  test.skip(
    !(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)),
    "this engine does not emulate forced colours",
  );
  await page.getByRole("button", { name: "New tab", exact: true }).hover();
  const tip = page.getByRole("tooltip").filter({ hasText: "New tab (Alt+T)" });
  await expect(tip).toBeVisible();
  // The shadow is taken away; the border is not.
  expect(
    await tip.evaluate((el) => `${getComputedStyle(el).borderTopStyle} ${getComputedStyle(el).borderTopWidth}`),
  ).toBe("solid 1px");
});

test("spinner: named only on its own, takes no focus, and is a ring in forced colours and with reduced motion", async ({
  page,
  browserName,
}) => {
  await open(page, "light");
  // In a button the button's text says it; on its own it is a named progressbar.
  await expect(page.getByRole("progressbar")).toHaveCount(1);
  await expect(page.getByRole("progressbar", { name: "Loading secrets" })).toBeVisible();
  const saving = page.getByRole("button", { name: "Saving" });
  const inButton = saving.locator("ui-spinner");
  await expect(inButton).toHaveAttribute("aria-hidden", "true");
  // A press on it is the button's (WebKit focuses no button on a click).
  await inButton.click();
  if (browserName !== "webkit") await expect(saving).toBeFocused();
  await expect(inButton).not.toBeFocused();

  // In the button's colour: white on the filled button.
  const colours = await inButton.evaluate((el) => [
    getComputedStyle(el.querySelector("circle")!).stroke,
    getComputedStyle(el).color,
  ]);
  expect(colours[0]).toBe(colours[1]);

  // Reduced motion: it stands still, still a ring with a gap (Material's shrank to a dot).
  await page.emulateMedia({ reducedMotion: "reduce" });
  const still = await inButton.evaluate((el) => ({
    durations: el.getAnimations({ subtree: true }).map((a) => Number(a.effect?.getComputedTiming().duration)),
    dash: getComputedStyle(el.querySelector("circle")!).strokeDasharray,
  }));
  expect(still.durations.every((ms) => ms <= 0.001)).toBe(true);
  expect(still.dash).not.toBe("none");
});

test("spinner: in forced colours it is drawn in the text's colour", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "light");
  test.skip(
    !(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)),
    "this engine does not emulate forced colours",
  );
  const spinner = page.getByRole("progressbar", { name: "Loading secrets" });
  const [stroke, color] = await spinner.evaluate((el) => [
    getComputedStyle(el.querySelector("circle")!).stroke,
    getComputedStyle(el).color,
  ]);
  expect(stroke).toBe(color);
  expect(stroke).not.toBe("rgba(0, 0, 0, 0)");
});

test("button: Enter and Space press it, Tab passes over a disabled one, and Enter follows a link", async ({
  page,
  browserName,
}) => {
  await open(page, "light");
  const status = page.getByRole("status");
  const filled = page.getByRole("button", { name: "Filled", exact: true });
  await filled.focus();
  await page.keyboard.press("Enter");
  await expect(status).toHaveText("Pressed Filled.");
  await page.getByRole("button", { name: "Send", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(status).toHaveText("Pressed Send.");
  // The send button's disabled twin is passed over, to the link (Option+Tab is Safari's key for every button and link).
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(page.getByRole("link", { name: "A link" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(status).toHaveText("Followed the link.");
  // A disabled one is in the tree as disabled, and is not pressed.
  await expect(page.getByRole("button", { name: "Filled disabled" })).toBeDisabled();
});

test("button: none of the browser's look; under the pointer, focused from the keyboard, pressed and disabled", async ({
  page,
  browserName,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "light");
  const css = (locator: Locator, property: string) =>
    locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);
  for (const name of ["Filled", "Outlined", "Text", "Icon", "Plain", "Send"]) {
    expect(await css(page.getByRole("button", { name, exact: true }), "appearance"), name).toBe("none");
  }
  const outlined = page.getByRole("button", { name: "Outlined secondary" });
  const rest = await css(outlined, "background-color");
  await outlined.hover();
  await expect.poll(() => css(outlined, "background-color")).not.toBe(rest);

  // The ring is the app's, and the button keeps its own corners with it: the global :focus-visible rule sets another radius.
  const plain = page.getByRole("button", { name: "Plain", exact: true });
  const radius = await css(plain, "border-top-left-radius");
  await page.getByRole("button", { name: "Small icon success" }).focus();
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(plain).toBeFocused();
  expect(await css(plain, "outline-style")).toBe("solid");
  expect(await css(plain, "outline-width")).toBe("2px");
  expect(await css(plain, "border-top-left-radius")).toBe(radius);

  // Pressed, it is drawn smaller.
  const filled = page.getByRole("button", { name: "Filled", exact: true });
  const box = (await filled.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => css(filled, "transform")).not.toBe("none");
  await page.mouse.up();

  // Disabled: faded, and a press goes through it to what is under it.
  const disabled = page.getByRole("button", { name: "Filled disabled" });
  expect(await css(disabled, "opacity")).toBe("0.6");
  expect(await css(disabled, "pointer-events")).toBe("none");
  expect(await css(page.getByRole("button", { name: "Send disabled" }), "opacity")).toBe("0.4");
});

test("button: an icon alone sits in its middle, square or not", async ({ page }) => {
  await open(page, "light");
  for (const name of ["Square", "Small square", "Icon", "Small icon", "Plain"]) {
    const button = page.getByRole("button", { name, exact: true });
    const [outer, inner] = [(await button.boundingBox())!, (await button.locator(".app-icon").boundingBox())!];
    expect(Math.abs(inner.x + inner.width / 2 - (outer.x + outer.width / 2)), name).toBeLessThanOrEqual(0.5);
    expect(Math.abs(inner.y + inner.height / 2 - (outer.y + outer.height / 2)), name).toBeLessThanOrEqual(1);
  }
});

test("button: in forced colours each keeps an edge but the plain icon, and the send button gains one", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "light");
  test.skip(
    !(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)),
    "this engine does not emulate forced colours",
  );
  const edge = (name: string) =>
    page
      .getByRole("button", { name, exact: true })
      .evaluate((el) => `${getComputedStyle(el).borderTopStyle} ${getComputedStyle(el).borderTopWidth}`);
  for (const name of ["Filled", "Outlined", "Text", "Square", "Icon", "Send"])
    expect(await edge(name), name).toBe("solid 1px");
  expect(await edge("Plain")).toBe("none 0px");
});

test("text field: Tab reaches each one and passes over a disabled one, and what is typed is its value", async ({
  page,
}) => {
  await open(page, "light");
  const field = (name: string) => page.getByLabel(name, { exact: true });
  await field("Name").focus();
  for (const name of [
    "Value",
    "Passphrase",
    "Timeout",
    "Search",
    "Message",
    "Rename Users",
    "HTTP method",
    "Address",
  ]) {
    await page.keyboard.press("Tab");
    await expect(field(name), name).toBeFocused();
  }
  await expect(field("Subprotocols")).toBeDisabled();
  await field("Value").fill("Bearer abc");
  await expect(field("Value")).toHaveValue("Bearer abc");
  // Enter in a text area is a new line; the arrows in a number step it.
  await field("Message").fill("one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("two");
  await expect(field("Message")).toHaveValue("one\ntwo");
  await field("Timeout").focus();
  await page.keyboard.press("ArrowUp");
  await expect(field("Timeout")).toHaveValue("30001");
});

test("text field: none of the browser's look; under the pointer, focused and disabled", async ({
  page,
  browserName,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "light");
  const css = (locator: Locator, property: string) =>
    locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);
  const field = (name: string) => page.getByLabel(name, { exact: true });
  for (const name of ["Name", "Value", "Passphrase", "Timeout", "Search", "Subprotocols", "Message"]) {
    expect(await css(field(name), "appearance"), name).toBe("none");
    expect(await css(field(name), "border-top-style"), name).toBe("solid");
  }
  // A value is monospace, a name is not.
  expect(await css(field("Value"), "font-family")).toContain("JetBrains Mono");
  expect(await css(field("Name"), "font-family")).not.toContain("JetBrains Mono");

  const name = field("Name");
  const rest = await css(name, "border-top-color");
  await name.hover();
  await expect.poll(() => css(name, "border-top-color")).not.toBe(rest);

  // Focused, it draws its border and glow and keeps its corners: the global :focus-visible rule sets another radius.
  const radius = await css(name, "border-top-left-radius");
  await name.focus();
  await expect.poll(() => css(name, "box-shadow")).not.toBe("none");
  expect(await css(name, "border-top-left-radius")).toBe(radius);
  expect(await css(name, "outline-style")).toBe("none");

  // Disabled, it reads as an enabled one, and the pointer changes nothing.
  const disabled = field("Subprotocols");
  expect(await css(disabled, "color")).toBe(await css(field("Value"), "color"));
  expect(await css(disabled, "-webkit-text-fill-color")).toBe(await css(field("Value"), "color"));
  const edge = await css(disabled, "border-top-color");
  await disabled.hover({ force: true });
  await page.waitForTimeout(200);
  expect(await css(disabled, "border-top-color")).toBe(edge);

  // The address bar's halves draw no box of their own: the bar does.
  for (const half of ["HTTP method", "Address"]) {
    expect(await css(field(half), "border-top-width"), half).toBe("0px");
    expect(await css(field(half), "box-shadow"), half).toBe("none");
  }
});

test("text field: in forced colours each keeps its edge and a focused one shows its outline", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "light");
  test.skip(
    !(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)),
    "this engine does not emulate forced colours",
  );
  const css = (name: string, property: string) =>
    page.getByLabel(name, { exact: true }).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);
  for (const name of ["Name", "Subprotocols", "Message"])
    expect(await css(name, "border-top-style"), name).toBe("solid");
  // The glow is taken away; the outline is painted in the system's colour.
  for (const name of ["Name", "Address"]) {
    await page.getByLabel(name, { exact: true }).focus();
    expect(await css(name, "outline-style"), name).toBe("solid");
    expect(await css(name, "outline-width"), name).toBe("2px");
  }
});

test("the production build holds nothing of the catalogue", async () => {
  const dist = "dist/wayfarer/browser";
  const holders = [];
  for (const name of (await readdir(dist)).filter((entry) => entry.endsWith(".js"))) {
    if ((await readFile(`${dist}/${name}`, "utf8")).includes("Widget catalogue")) holders.push(name);
  }
  expect(holders).toEqual([]);
});
