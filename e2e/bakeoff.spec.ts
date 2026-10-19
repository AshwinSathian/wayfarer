// D1.5's bake-off (prototype branch only): the same checks for each widget
// candidate, in three engines. A failure here is a finding about the
// candidate, not a bug to fix before merging: this file is never merged.
import { expect, test, type Page } from "@playwright/test";
import { axe } from "./support/axe";

const CANDIDATES = ["material", "aria", "platform"] as const;
type Candidate = (typeof CANDIDATES)[number];

const row = (page: Page, name: string) => page.getByRole("treeitem", { name, exact: true });
const order = (page: Page) => page.locator("[role=treeitem][data-key]").evaluateAll((rows) => rows.map((el) => (el as HTMLElement).dataset["key"]));
const log = (page: Page) => page.getByTestId("log");
const env = (page: Page) => page.getByTestId("env");
const select = (page: Page) => page.getByRole("combobox", { name: "Environment" });
/** Keys at a person's pace (50 ms apart). Aria's select drops a key sent within a few ms of opening, in Chromium: the probe records that. */
async function keys(page: Page, ...names: string[]): Promise<void> {
  for (const name of names) {
    await page.keyboard.press(name);
    await page.waitForTimeout(50);
  }
}

async function open(page: Page, candidate: Candidate, theme: "light" | "dark" = "dark", query = ""): Promise<void> {
  await page.addInitScript((value) => localStorage.setItem("wayfarer:theme", value), theme);
  await page.goto(`/app/?bakeoff=${candidate}${query}`);
  await expect(row(page, "Shop API")).toBeVisible();
}

/** Every violation axe finds, of any impact: the bake-off reports all of them. */
async function violations(page: Page): Promise<string[]> {
  const results = await axe(page).include(".bake-page").analyze();
  return results.violations.flatMap((v) => v.nodes.map((node) => `${v.impact}: ${v.id}: ${node.target.join(" ")}`));
}

/** Focus the tree's top row the way a keyboard user does: Tab from the select. */
async function tabIntoTree(page: Page): Promise<void> {
  await select(page).focus();
  await page.keyboard.press("Tab");
}

for (const candidate of CANDIDATES) {
  test.describe(`bake-off: ${candidate}`, () => {
    for (const theme of ["light", "dark"] as const) {
      test(`axe: no violation of any impact, ${theme}`, async ({ page }) => {
        await open(page, candidate, theme);
        expect(await violations(page)).toEqual([]);
      });
    }

    test("the tree, the rows and the select have the roles and names a screen reader reads", async ({ page }) => {
      await open(page, candidate);
      await expect(page.getByRole("tree", { name: "Collections" })).toBeVisible();
      await expect(row(page, "GET Health")).toHaveAttribute("aria-level", "2");
      await expect(row(page, "Shop API")).toHaveAttribute("aria-expanded", "true");
      await expect(row(page, "Users")).toHaveAttribute("aria-expanded", "false");
      await expect(select(page)).toBeVisible();
      await expect(select(page)).toContainText("No environment");
    });

    test("Tab reaches the tree once, at its top row", async ({ page }) => {
      await open(page, candidate);
      await tabIntoTree(page);
      await expect(row(page, "Shop API")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "After the tree" })).toBeFocused();
    });

    test("Tab back into the tree lands on the selected row", async ({ page }) => {
      await open(page, candidate);
      await row(page, "GET Health").click();
      await expect(row(page, "GET Health")).toHaveAttribute("aria-selected", "true");
      await select(page).focus();
      await page.keyboard.press("Tab");
      await expect(row(page, "GET Health")).toBeFocused();
    });

    test("arrow keys, Home and End walk the tree as WAI-ARIA's pattern says", async ({ page }) => {
      await open(page, candidate);
      await tabIntoTree(page);
      await page.keyboard.press("ArrowDown");
      await expect(row(page, "Users")).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(row(page, "Users")).toHaveAttribute("aria-expanded", "true");
      await expect(row(page, "GET List users")).toBeVisible();
      await page.keyboard.press("ArrowRight");
      await expect(row(page, "GET List users")).toBeFocused();
      await page.keyboard.press("ArrowLeft");
      await expect(row(page, "Users")).toBeFocused();
      await page.keyboard.press("ArrowLeft");
      await expect(row(page, "Users")).toHaveAttribute("aria-expanded", "false");
      await page.keyboard.press("End");
      await expect(row(page, "GET Invoices")).toBeFocused();
      await page.keyboard.press("Home");
      await expect(row(page, "Shop API")).toBeFocused();
    });

    test("a letter moves to the next row that starts with it", async ({ page }) => {
      await open(page, candidate);
      await tabIntoTree(page);
      await page.keyboard.press("o");
      await expect(row(page, "Orders")).toBeFocused();
    });

    test("Enter opens the row and selects it; a click does too", async ({ page }) => {
      await open(page, candidate);
      await tabIntoTree(page);
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await expect(log(page)).toHaveText("opened Invoices");
      await expect(row(page, "GET Invoices")).toHaveAttribute("aria-selected", "true");
      await row(page, "GET Health").click();
      await expect(log(page)).toHaveText("opened Health");
      await expect(row(page, "GET Health")).toHaveAttribute("aria-selected", "true");
      await expect(row(page, "GET Invoices")).not.toHaveAttribute("aria-selected", "true");
    });

    test("Alt+ArrowDown and Alt+ArrowUp move a row among its siblings, and focus stays on it", async ({ page }) => {
      await open(page, candidate);
      await tabIntoTree(page);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Alt+ArrowDown");
      await expect.poll(() => order(page)).toEqual(["shop", "orders", "users", "health", "billing", "invoices"]);
      await expect(row(page, "Users")).toBeFocused();
      await page.keyboard.press("Alt+ArrowUp");
      await expect.poll(() => order(page)).toEqual(["shop", "users", "orders", "health", "billing", "invoices"]);
      await expect(row(page, "Users")).toBeFocused();
      // After a move the arrow keys still walk the new order.
      await page.keyboard.press("ArrowDown");
      await expect(row(page, "Orders")).toBeFocused();
    });

    test("a drag puts a row before another of the same parent", async ({ page }) => {
      await open(page, candidate);
      await row(page, "GET Health").dragTo(row(page, "Users"), { targetPosition: { x: 40, y: 3 } });
      await expect.poll(() => order(page)).toEqual(["shop", "health", "users", "orders", "billing", "invoices"]);
      await expect(log(page)).toHaveText("moved health");
    });

    test("Shift+F10 opens the row's menu: its items, first one focused, arrows, Escape back to the row", async ({ page }) => {
      await open(page, candidate);
      await tabIntoTree(page);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Shift+F10");
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("menuitem")).toHaveText(["New request", "Rename", "Duplicate", "Delete"]);
      await expect(menu.getByRole("menuitem").first()).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(menu.getByRole("menuitem", { name: "Rename" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(row(page, "Users")).toBeFocused();
    });

    test("Enter on a menu item runs it, closes the menu and gives focus back to the row", async ({ page }) => {
      await open(page, candidate);
      await tabIntoTree(page);
      await page.keyboard.press("o");
      // Material's typeahead moves focus after a pause; the others at once.
      await expect(row(page, "Orders")).toBeFocused();
      await page.keyboard.press("Shift+F10");
      await expect(page.getByRole("menuitem").first()).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(log(page)).toHaveText("Rename: Orders");
      await expect(page.getByRole("menu")).toBeHidden();
      await expect(row(page, "Orders")).toBeFocused();
    });

    test("a right-click opens the menu at the pointer, with the items of what was clicked", async ({ page }) => {
      await open(page, candidate);
      const box = await row(page, "GET Health").boundingBox();
      if (!box) throw new Error("no row");
      const at = { x: box.x + 60, y: box.y + box.height / 2 };
      await page.mouse.click(at.x, at.y, { button: "right" });
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("menuitem")).toHaveText(["Open in new tab", "Rename", "Duplicate", "Delete"]);
      const placed = await menu.boundingBox();
      expect(placed && Math.abs(placed.x - at.x) < 24 && Math.abs(placed.y - at.y) < 24).toBe(true);
      await menu.getByRole("menuitem", { name: "Duplicate" }).click();
      await expect(log(page)).toHaveText("Duplicate: Health");
      await expect(menu).toBeHidden();
    });

    test("a click outside closes the menu and runs nothing", async ({ page }) => {
      await open(page, candidate);
      await row(page, "Users").click({ button: "right" });
      await expect(page.getByRole("menu")).toBeVisible();
      await page.mouse.click(500, 600);
      await expect(page.getByRole("menu")).toBeHidden();
      await expect(log(page)).toHaveText("");
    });

    test("axe with the menu open", async ({ page }) => {
      await open(page, candidate);
      await row(page, "Users").click({ button: "right" });
      await expect(page.getByRole("menu")).toBeVisible();
      const results = await axe(page).analyze();
      expect(results.violations.flatMap((v) => v.nodes.map((node) => `${v.impact}: ${v.id}: ${node.target.join(" ")}`))).toEqual([]);
    });

    test("the select: Enter opens it, End and Enter pick the last choice, focus stays on it", async ({ page }) => {
      test.skip(candidate === "platform", "a native select's list is the browser's own: the keyboard there is not the page's to test");
      await open(page, candidate);
      await select(page).focus();
      await keys(page, "Enter");
      await expect(page.getByRole("listbox")).toBeVisible();
      await keys(page, "End", "Enter");
      await expect(env(page)).toHaveText("prod");
      await expect(page.getByRole("listbox")).toBeHidden();
      await expect(select(page)).toBeFocused();
      await expect(select(page)).toContainText("Production");
    });

    test("the select: the empty choice gives back the placeholder; Escape changes nothing", async ({ page }) => {
      await open(page, candidate);
      if (candidate === "platform") {
        await select(page).selectOption("staging");
        await expect(env(page)).toHaveText("staging");
        await select(page).selectOption("");
        await expect(env(page)).toHaveText("none");
        await expect(select(page)).toHaveValue("");
        return;
      }
      await select(page).focus();
      await page.keyboard.press("Enter");
      await page.getByRole("option", { name: "Staging" }).click();
      await expect(env(page)).toHaveText("staging");
      await select(page).focus();
      await keys(page, "Enter", "Home", "Enter");
      await expect(env(page)).toHaveText("none");
      await expect(select(page)).toContainText("No environment");
      // Enter on the choice already made closes the list too.
      await keys(page, "Enter", "Enter");
      await expect(page.getByRole("listbox")).toBeHidden();
      await select(page).focus();
      await keys(page, "Enter", "ArrowDown", "Escape");
      await expect(page.getByRole("listbox")).toBeHidden();
      await expect(env(page)).toHaveText("none");
      await expect(select(page)).toBeFocused();
    });

    test("axe with the select open", async ({ page }) => {
      test.skip(candidate === "platform", "a native select's list is not in the page");
      await open(page, candidate);
      await select(page).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("listbox")).toBeVisible();
      const results = await axe(page).analyze();
      expect(results.violations.flatMap((v) => v.nodes.map((node) => `${v.impact}: ${v.id}: ${node.target.join(" ")}`))).toEqual([]);
    });

    test("probe, not a pass mark: keys sent as fast as a script can, open, End, Enter", async ({ page }, info) => {
      test.skip(candidate === "platform", "a native select's list is the browser's own");
      await open(page, candidate);
      await select(page).focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
      info.annotations.push({ type: "rapid-keys", description: (await env(page).textContent()) ?? "" });
    });

    test("a tree of 1,000 requests, every folder open, renders and walks", async ({ page }, info) => {
      // When the last row appears, from the page's start: the candidate's code loads, builds and draws.
      await page.addInitScript(() => {
        new MutationObserver((_, observer) => {
          if (!document.querySelector('[data-key="f49-r19"]')) return;
          (window as unknown as { lastRow: number }).lastRow = performance.now();
          observer.disconnect();
        }).observe(document, { childList: true, subtree: true });
      });
      await open(page, candidate, "dark", "&n=1000");
      await expect(row(page, "GET Request 49.19")).toBeAttached();
      const lastRow = await page.evaluate(() => Math.round((window as unknown as { lastRow: number }).lastRow));
      info.annotations.push({ type: "last-row-ms", description: String(lastRow) });
      const started = Date.now();
      await tabIntoTree(page);
      await page.keyboard.press("End");
      await expect(row(page, "GET Request 49.19")).toBeFocused();
      info.annotations.push({ type: "end-key-ms", description: String(Date.now() - started) });
      expect(lastRow).toBeLessThan(5000);
    });
  });
}
