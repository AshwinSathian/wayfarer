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

for (const theme of ["light", "dark"] as const) {
  test(`every widget of the catalogue, in each state, is free of WCAG 2.2 AA violations in the ${theme} theme`, async ({ page }) => {
    await open(page, theme);
    const found: string[] = [];
    const scan = async (state: string) => {
      await settled(page);
      const results = await axe(page).analyze();
      for (const violation of results.violations) {
        for (const node of violation.nodes) found.push(`${state}: ${violation.id}: ${node.target.join(" ")}`);
      }
    };
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
