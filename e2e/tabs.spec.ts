import { test, expect, type Locator, type Page } from "@playwright/test";
import { seedAndOpen } from "./support/app";
import { ECHO } from "./support/echo";

// P5.1: the composer's tabs. What a reload keeps of them is in the second half of this file.

const strip = (page: Page): Locator => page.getByRole("tablist", { name: "Open requests" });
const tabs = (page: Page): Locator => strip(page).getByRole("tab");
const address = (page: Page): Locator => page.locator("input.address-url");
const unsaved = (tab: Locator): Locator => tab.getByRole("img", { name: "Unsaved changes" });

test("a new tab is an empty request, and each tab keeps its own request and response", async ({ page }) => {
  await page.goto("/");
  await expect(tabs(page)).toHaveCount(1);
  await address(page).fill(`${ECHO}/content/json?keys=1`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

  await page.getByRole("button", { name: "New tab" }).click();
  await expect(tabs(page)).toHaveCount(2);
  await expect(tabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(address(page)).toHaveValue("");
  await expect(address(page)).toBeFocused();
  await expect(page.locator(".status-badge")).toHaveCount(0);
  await address(page).fill(`${ECHO}/status/204`);

  await tabs(page).nth(0).click();
  await expect(address(page)).toHaveValue(`${ECHO}/content/json?keys=1`);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await tabs(page).nth(1).click();
  await expect(address(page)).toHaveValue(`${ECHO}/status/204`);
});

test("a tab says what it holds: the method and the address, or the saved request's name and where it is kept", async ({ page }) => {
  await seedAndOpen(page, {}, { method: "POST", url: `${ECHO}/echo`, folder: {} });
  await expect(tabs(page)).toHaveCount(1);
  await expect(tabs(page).first()).toContainText("POST");
  await expect(tabs(page).first()).toContainText("Tripwire request");
  await expect(unsaved(tabs(page).first())).toHaveCount(0);
  const crumbs = page.getByRole("navigation", { name: "Saved request" });
  await expect(crumbs).toHaveText(/Tripwire collection\s*\/\s*Tripwire folder\s*\/\s*Tripwire request/);

  await page.getByRole("button", { name: "New tab" }).click();
  await expect(crumbs).toHaveCount(0);
  await expect(tabs(page).nth(1)).toContainText("New request");
  await address(page).fill("https://api.example.test/items");
  await expect(tabs(page).nth(1)).toContainText("api.example.test/items");
});

test("an edit marks the tab unsaved; a saved request opened again goes to its tab, edits kept", async ({ page }) => {
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` });
  await address(page).fill(`${ECHO}/echo?edited=1`);
  await expect(unsaved(tabs(page).first())).toBeVisible();

  await page.getByRole("button", { name: "New tab" }).click();
  await page.getByRole("tree").getByText("Tripwire request", { exact: true }).dblclick();
  await expect(tabs(page)).toHaveCount(2);
  await expect(tabs(page).first()).toHaveAttribute("aria-selected", "true");
  await expect(address(page)).toHaveValue(`${ECHO}/echo?edited=1`);

  // Saved: the mark goes.
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(unsaved(tabs(page).first())).toHaveCount(0);
});

test("closing a tab with unsaved changes asks first; a clean one closes at once", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New tab" }).click();
  await expect(tabs(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Close tab" }).click();
  await expect(tabs(page)).toHaveCount(1);

  await address(page).fill("https://api.example.test/keep");
  await page.getByRole("button", { name: "Close tab" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Close this tab?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep it open" }).click();
  await expect(address(page)).toHaveValue("https://api.example.test/keep");

  await page.getByRole("button", { name: "Close tab" }).click();
  await dialog.getByRole("button", { name: "Close tab" }).click();
  // The last tab is replaced by an empty one.
  await expect(tabs(page)).toHaveCount(1);
  await expect(address(page)).toHaveValue("");
});

test("Duplicate tab opens a second tab with the same request, unsaved changes included", async ({ page }) => {
  await page.goto("/");
  await address(page).fill("https://api.example.test/copy");
  await page.getByRole("button", { name: "Duplicate tab" }).click();
  await expect(tabs(page)).toHaveCount(2);
  await expect(tabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(address(page)).toHaveValue("https://api.example.test/copy");
  await expect(unsaved(tabs(page).nth(1))).toBeVisible();

  await address(page).fill("https://api.example.test/changed");
  await tabs(page).nth(0).click();
  await expect(address(page)).toHaveValue("https://api.example.test/copy");
});

test("keyboard: Alt+T opens a tab and Alt+W closes it, in the app and not in the browser; arrow keys walk the strip", async ({ page, context }) => {
  await page.goto("/");
  await address(page).fill("https://api.example.test/first");
  // In the address field, where on macOS Option+T would type a dagger.
  await page.keyboard.press("Alt+KeyT");
  await expect(tabs(page)).toHaveCount(2);
  await expect(address(page)).toHaveValue("");
  await expect(address(page)).toBeFocused();
  await page.keyboard.press("Alt+KeyT");
  await expect(tabs(page)).toHaveCount(3);
  await expect(address(page)).toHaveValue("");

  await tabs(page).nth(2).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(tabs(page).nth(1)).toBeFocused();
  await expect(tabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(tabs(page).nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(address(page)).toHaveValue("https://api.example.test/first");
  await expect(strip(page).locator('[role="tab"][tabindex="0"]')).toHaveCount(1);

  await page.keyboard.press("End");
  await page.keyboard.press("Alt+KeyW");
  await expect(tabs(page)).toHaveCount(2);
  await page.keyboard.press("Alt+KeyW");
  await expect(tabs(page)).toHaveCount(1);
  await expect(address(page)).toHaveValue("https://api.example.test/first");

  // The browser opened no tab of its own and closed none.
  expect(context.pages()).toHaveLength(1);
  expect(page.isClosed()).toBe(false);
  await expect(page).toHaveURL(/\/$/);
});

test("while a request is on its way the open tab stays open", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New tab" }).click();
  await address(page).fill(`${ECHO}/delay/3000`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("button", { name: "New tab" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Close tab" })).toBeDisabled();
  await expect(tabs(page).nth(0)).toBeDisabled();
  await page.getByRole("button", { name: "Cancel request" }).click();
  await expect(tabs(page).nth(0)).toBeEnabled();
});

test("the open tab is in view when the strip holds more tabs than fit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");
  for (let opened = 1; opened <= 6; opened++) {
    await page.getByRole("button", { name: "New tab" }).click();
    await expect(tabs(page)).toHaveCount(opened + 1);
  }
  await expect(tabs(page).nth(6)).toBeInViewport({ ratio: 1 });
  await expect(tabs(page).nth(0)).not.toBeInViewport();
});
