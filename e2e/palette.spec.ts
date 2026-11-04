import { test, expect, type Page } from "@playwright/test";
import { openPalette, seedAndOpen, send } from "./support/app";
import { ECHO } from "./support/echo";

// U-011: the palette is the shell's. It has no title and no close button, finds commands, requests, collections and
// folders, environments and past requests by typing, in groups, and shows each command's shortcut as keycaps.

const field = (page: Page) => page.getByRole("combobox", { name: /^Search requests/ });
const option = (page: Page, name: string | RegExp) =>
  page.getByRole("listbox", { name: "Results" }).getByRole("option", { name });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("@claim:C-030 ⌘K from the address field opens the palette on its field, with no title and no close button", async ({
  page,
}) => {
  await page.goto("/app/");
  await page.locator("input.address-url").click();
  await page.keyboard.press("ControlOrMeta+K");
  await expect(field(page)).toBeFocused();
  const dialog = page.getByRole("dialog", { name: "Search and commands" });
  await expect(dialog.getByRole("heading")).toHaveCount(0);
  await expect(dialog.getByRole("button")).toHaveCount(0);
  // A command's shortcut is a keycap, and its aria-keyshortcuts.
  await expect(option(page, /^New request/)).toHaveAttribute("aria-keyshortcuts", "Alt+T");
  await expect(option(page, /^New request/).locator("kbd")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("the arrows move through the results and Enter runs the active one", async ({ page }) => {
  await page.goto("/app/");
  await openPalette(page);
  await page.keyboard.type("new");
  await expect(option(page, /^New request/)).toHaveAttribute("aria-selected", "true");
  const first = await field(page).getAttribute("aria-activedescendant");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => field(page).getAttribute("aria-activedescendant")).not.toBe(first);
  const second = await field(page).getAttribute("aria-activedescendant");
  await expect(page.locator(`#${second}`)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowUp");
  await expect(field(page)).toHaveAttribute("aria-activedescendant", first!);
  // Enter runs it: New request, a tab of its own.
  const tabs = page.getByRole("tablist", { name: "Open requests" }).getByRole("tab");
  await expect(tabs).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(tabs).toHaveCount(2);
});

test("it finds a saved request by name or address and opens it", async ({ page }) => {
  await seedAndOpen(page, { host: ECHO }, { method: "POST", url: `${ECHO}/content/json?find=me` });
  await page.getByRole("button", { name: "New tab" }).click();
  await openPalette(page);
  await page.keyboard.type("find=me");
  const requests = page.getByRole("group", { name: "Requests" });
  await expect(requests).toBeVisible();
  await expect(requests.getByRole("option", { name: /Tripwire request/ })).toContainText("POST");
  await page.keyboard.press("Enter");
  await expect(page.locator("input.address-url")).toHaveValue(`${ECHO}/content/json?find=me`);
});

test("it finds an environment, says which is in use, and makes the chosen one the one in use", async ({ page }) => {
  await seedAndOpen(page, { host: ECHO }, { method: "GET", url: `${ECHO}/echo` });
  await openPalette(page);
  await page.keyboard.type("tripwire env");
  const environments = page.getByRole("group", { name: "Environments" });
  await expect(environments).toBeVisible();
  await expect(environments.getByRole("option", { name: /Tripwire env/ })).toContainText("In use");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Search and commands" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Environment" })).toContainText("Tripwire env");
});

test("it finds a collection and selects it in the sidebar", async ({ page }) => {
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo`, folder: {} });
  await openPalette(page);
  await page.keyboard.type("tripwire folder");
  await expect(page.getByRole("group", { name: "Collections and folders" })).toBeVisible();
  await page.keyboard.press("Enter");
  const row = page.getByRole("tree").getByRole("treeitem", { name: /Tripwire folder/ });
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(row).toBeFocused();
});

test("it finds a past request in History and loads it", async ({ page }) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/content/json?from=history`);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  await page.getByRole("button", { name: "New tab" }).click();
  await openPalette(page);
  await page.keyboard.type("from=history");
  await expect(page.getByRole("group", { name: "History" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("input.address-url")).toHaveValue(`${ECHO}/content/json?from=history`);
});
