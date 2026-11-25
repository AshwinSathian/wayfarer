import { expect, test, type Page } from "@playwright/test";
import { ECHO } from "./support/echo";
import { openPalette, seedAndOpen, send } from "./support/app";

// BB2 (keyboard first): G, then a letter, goes to a place; the palette reaches what a menu or a pane reached; the route
// strip, a variable's popover and a comparison of two history entries need no pointer.

const address = (page: Page) => page.locator("input.address-url");
const history = (page: Page) => page.getByRole("dialog", { name: "History", exact: true });
const settings = (page: Page) => page.getByRole("dialog", { name: "Settings", exact: true });
const palette = (page: Page) => page.getByRole("dialog", { name: "Search and commands" });

/** Focus on the page and no field: where a jump may start. */
async function onThePage(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

const jump = async (page: Page, letter: string) => {
  await page.keyboard.press("g");
  await page.keyboard.press(letter);
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("@claim:C-123 G then a letter goes to History, Environments, Settings, the address, the collections, the response, the variables and the route strip", async ({
  page,
}) => {
  await seedAndOpen(page, { fromEnv: "v" }, { method: "GET", url: `${ECHO}/echo?a={{fromEnv}}` });
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

  await onThePage(page);
  await jump(page, "a");
  await expect(address(page)).toBeFocused();

  await onThePage(page);
  await jump(page, "r");
  await expect(page.locator("app-response-viewer").getByRole("tab", { selected: true })).toBeFocused();

  await onThePage(page);
  await jump(page, "v");
  await expect(page.locator("app-variable-chips .var-chip").first()).toBeFocused();

  await onThePage(page);
  await jump(page, "p");
  await expect(page.locator("app-route-strip").getByRole("group")).toBeFocused();

  await onThePage(page);
  await jump(page, "c");
  await expect(page.getByRole("tree").getByRole("treeitem", { selected: true }).first()).toBeFocused();
  // In the tree the letters are the tree's (type-ahead): G, then E, jumps nowhere.
  await jump(page, "e");
  await expect(page.getByRole("region", { name: "Environments", exact: true })).toHaveCount(0);

  await onThePage(page);
  await jump(page, "e");
  await expect(page.getByRole("region", { name: "Environments", exact: true })).toBeVisible();

  await onThePage(page);
  await jump(page, "h");
  await expect(history(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(history(page)).toHaveCount(0);

  await onThePage(page);
  await jump(page, "s");
  await expect(settings(page)).toBeVisible();
});

test("@claim:C-123 a jump key is a letter where text is typed, in a dialog, in a menu, with a modifier, and when turned off in Settings", async ({
  page,
}) => {
  await page.goto("/app/");
  // A field: the letters are typed.
  await address(page).click();
  await page.keyboard.type("gh");
  await expect(address(page)).toHaveValue("gh");
  await expect(history(page)).toHaveCount(0);
  // The palette's field is in a dialog.
  await openPalette(page);
  await page.keyboard.type("gs");
  await expect(page.getByRole("combobox", { name: /^Search requests/ })).toHaveValue("gs");
  await page.keyboard.press("Escape");
  // A modifier makes it another key.
  await onThePage(page);
  await page.keyboard.press("g");
  await page.keyboard.press("Shift+H");
  await expect(history(page)).toHaveCount(0);
  // The jump waits for its second key only a moment, and a key that is not one ends it.
  await page.keyboard.press("g");
  await page.keyboard.press("x");
  await page.keyboard.press("h");
  await expect(history(page)).toHaveCount(0);
  // Said while it waits, and in Settings › Shortcuts with the others.
  await page.keyboard.press("g");
  const hint = page.locator(".jump-hint");
  await expect(hint).toContainText("History");
  // A screen reader gets one short line, not the eight places; and the hint is above the status bar, not on it.
  await expect(page.getByRole("status").filter({ hasText: "press a letter" })).toHaveText(
    "Jump: press a letter. Escape cancels.",
  );
  const [shown, bar] = await Promise.all([hint.boundingBox(), page.locator("footer.status-bar").boundingBox()]);
  expect(shown && bar && shown.y + shown.height <= bar.y).toBe(true);
  // It waits a while (WCAG 2.2.1): a second later it is still waiting.
  await page.waitForTimeout(2000);
  await expect(hint).toContainText("History");
  await page.keyboard.press("s");
  const dialog = settings(page);
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button", { name: "Shortcuts" })
    .click();
  for (const words of ["Go to History", "Go to the route strip", "Go to the response"])
    await expect(dialog).toContainText(words);
  // Open Settings, a dialog: its letters are not jumps.
  await page.keyboard.press("Tab");
  await jump(page, "e");
  await expect(page.getByRole("region", { name: "Environments", exact: true })).toHaveCount(0);
  // Turned off: G is a letter like any other, also after a reload.
  await dialog.getByRole("checkbox", { name: "Jump keys" }).uncheck();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await onThePage(page);
  await jump(page, "h");
  await expect(history(page)).toHaveCount(0);
});

test("@claim:C-124 the palette reaches each Settings section, Import, New environment, Compare two history entries, Clear history, Copy as, and the tabs", async ({
  page,
}) => {
  await page.goto("/app/");
  const field = await openPalette(page);
  const has = async (text: string) => {
    await field.fill(text);
    await expect(
      page.getByRole("listbox", { name: "Results" }).getByRole("option", { name: new RegExp(text) }),
    ).not.toHaveCount(0);
  };
  for (const label of [
    "Settings: Shortcuts",
    "Settings: Data and storage",
    "Settings: Diagnostics",
    "Import a file",
    "Import a cURL command",
    "Open a shared link",
    "New environment",
    "Compare two history entries",
    "Clear history",
    "Copy as cURL",
    "Copy as HTTPie",
  ])
    await has(label);
  // A jump's keys are on its row.
  await field.fill("History");
  await expect(
    page
      .getByRole("listbox", { name: "Results" })
      .getByRole("option", { name: /^History/ })
      .locator("kbd")
      .first(),
  ).toHaveText("G then H");
  // A section, by name.
  await field.fill("Settings: Shortcuts");
  await page.keyboard.press("Enter");
  await expect(settings(page).getByRole("heading", { name: "Shortcuts", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  // Two tabs: Next and Previous.
  await page.getByRole("button", { name: "New tab" }).click();
  const tabs = page.getByRole("tablist", { name: "Open requests" }).getByRole("tab");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await openPalette(page);
  await page.keyboard.type("Previous tab");
  await page.keyboard.press("Enter");
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(palette(page)).toHaveCount(0);
});

test("@claim:C-125 the route strip's offer, a variable's popover and a comparison of two history entries are used with the keyboard alone", async ({
  page,
}) => {
  await seedAndOpen(page, { fromEnv: "env-value" }, { method: "GET", url: `${ECHO}/echo?run=one&a={{fromEnv}}` });
  // The strip: its offer is a command, and G then P goes to the strip.
  await address(page).fill("curl https://example.test/pets");
  await onThePage(page);
  await jump(page, "p");
  await expect(page.locator("app-route-strip .route-problem").getByRole("button")).toBeFocused();
  await openPalette(page);
  await page.keyboard.type("Import as request");
  await page.keyboard.press("Enter");
  await expect(page.locator("app-route-strip .route-problem").getByRole("button")).toHaveCount(0);

  // The variable: G then V, Enter opens its popover, Escape closes it and gives focus back.
  await address(page).fill(`${ECHO}/echo?run=two&a={{fromEnv}}`);
  await onThePage(page);
  await jump(page, "v");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Variable fromEnv" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("app-variable-chips .var-chip").first()).toBeFocused();

  // Two entries: the palette ticks the rows, Space ticks two, Compare the two.
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  await address(page).fill(`${ECHO}/echo?run=three`);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  await openPalette(page);
  await page.keyboard.type("Compare two history entries");
  await page.keyboard.press("Enter");
  const drawer = history(page);
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Tick two entries with Space");
  const ticks = drawer.getByRole("checkbox");
  await expect(ticks.first()).toBeFocused();
  await page.keyboard.press("Space");
  await expect(drawer.getByRole("button", { name: "Compare the two" })).toHaveCount(0);
  await ticks.nth(1).focus();
  await page.keyboard.press("Space");
  const compare = drawer.getByRole("button", { name: "Compare the two" });
  await expect(compare).toBeVisible();
  await compare.focus();
  await page.keyboard.press("Enter");
  await expect(drawer.locator("app-exchange-diff")).toBeVisible();
});
