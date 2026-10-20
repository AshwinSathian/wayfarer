// D3.3: the widget catalogue (src/app/catalogue/catalogue.ts), a page of
// development builds only. Every widget in each state passes axe in both
// themes, and in forced colours what is selected is still marked.
import { readdir, readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
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
  test(`the segmented choice, in each state, is free of WCAG 2.2 AA violations in the ${theme} theme`, async ({ page }) => {
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

  test(`every widget of the catalogue, in each state, is free of WCAG 2.2 AA violations in the ${theme} theme`, async ({ page }) => {
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

test("menu: a row's menu opens at the pointer and at the row, for that row, and gives focus back to it", async ({ page }) => {
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
  test.skip(!(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)), "this engine does not emulate forced colours");
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
  test.skip(!(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)), "this engine does not emulate forced colours");
  const theme = page.getByRole("radiogroup", { name: "Theme" });
  // The raised background is taken away; a border is not.
  const mark = (name: string) => theme.getByRole("radio", { name, exact: true }).evaluate((el) => `${getComputedStyle(el).borderTopStyle} ${getComputedStyle(el).borderTopWidth}`);
  await expect.poll(() => mark("System")).toBe("solid 2px");
  expect(await mark("Light")).not.toContain("solid");
});

test("accordion: in forced colours an open section is still marked", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "light");
  test.skip(!(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)), "this engine does not emulate forced colours");
  const chevron = (name: string) =>
    page.locator(".catalogue-accordion").getByRole("button", { name, exact: true }).locator(".section-chevron").evaluate((el) => getComputedStyle(el).transform);
  // Its colour is taken away; the chevron turned over is not.
  await expect.poll(() => chevron("Headers")).not.toBe("none");
  expect(await chevron("Params")).toBe("none");
});

test("tabs: in forced colours the chosen tab is still marked", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "light");
  test.skip(!(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)), "this engine does not emulate forced colours");
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
  test.skip(!(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)), "this engine does not emulate forced colours");
  const tree = page.getByRole("tree", { name: "Collections" });
  const row = (name: string) => tree.getByRole("treeitem", { name, exact: true });
  await row("PATCH Update a plan").click();

  // The background that marks it otherwise is taken away.
  const mark = (name: string) => row(name).evaluate((el) => getComputedStyle(el).borderInlineStartWidth);
  // The class comes with the next render, not with the click.
  await expect.poll(() => mark("PATCH Update a plan")).toBe("4px");
  expect(await mark("HEAD Ping")).toBe("0px");
});

test("the production build holds nothing of the catalogue", async () => {
  const dist = "dist/wayfarer/browser";
  const holders = [];
  for (const name of (await readdir(dist)).filter((entry) => entry.endsWith(".js"))) {
    if ((await readFile(`${dist}/${name}`, "utf8")).includes("Widget catalogue")) holders.push(name);
  }
  expect(holders).toEqual([]);
});
