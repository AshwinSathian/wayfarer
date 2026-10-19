// D3.3: the widget catalogue (src/app/catalogue/catalogue.ts), a page of
// development builds only. Every widget in each state passes axe in both
// themes, and in forced colours what is selected is still marked.
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

test("tree: in forced colours the selected row is still marked", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "light");
  test.skip(!(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)), "this engine does not emulate forced colours");
  const tree = page.getByRole("tree", { name: "Collections" });
  const row = (name: string) => tree.getByRole("treeitem", { name, exact: true });
  await row("PATCH Update a plan").click();

  // The background that marks it otherwise is taken away.
  const mark = (name: string) => row(name).evaluate((el) => getComputedStyle(el).borderInlineStartWidth);
  expect(await mark("PATCH Update a plan")).toBe("4px");
  expect(await mark("HEAD Ping")).toBe("0px");
});
