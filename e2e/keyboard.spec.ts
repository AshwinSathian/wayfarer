import { test, expect } from "@playwright/test";
import { ECHO } from "./support/echo";

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

test("editor mode: the Basic / JSON switch is a radio group driven by arrow keys", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const group = page.getByRole("radiogroup", { name: "Editor mode" });
  const basic = group.getByRole("radio", { name: "Basic" });
  const json = group.getByRole("radio", { name: "JSON" });
  await expect(basic).toBeChecked();

  await basic.focus();
  await page.keyboard.press("ArrowRight");
  await expect(json).toBeFocused();
  await expect(json).toBeChecked();
  await expect(basic).not.toBeChecked();
  await expect(page.locator(".monaco-editor").first()).toBeVisible({ timeout: 10_000 });

  await page.keyboard.press("ArrowLeft");
  await expect(basic).toBeChecked();
  await expect(page.getByLabel("Headers name, row 1")).toBeVisible();
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
