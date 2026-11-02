import { test, expect, type Page } from "@playwright/test";
import { openSettings, seedAndOpen, send } from "./support/app";
import { ECHO } from "./support/echo";

// D3.6 (U-116): forced colours paint every background as the canvas and take every shadow away. Five marks were
// drawn by one or the other and vanished: the select's focus, the unsaved dot, the timing bars, the storage meter
// and the tree's drop line. Each keeps a mark in a system colour.

async function forced(page: Page): Promise<void> {
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/app/");
  test.skip(
    !(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)),
    "this engine does not emulate forced colours",
  );
}

/**
 * A background is kept only where `forced-color-adjust: none` says so: then it is not the canvas. WebKit emulates the
 * media query but paints nothing over, and has no such property: there the fill is only checked to be drawn.
 */
const painted = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const style = getComputedStyle(el);
      const canvas = getComputedStyle(document.body).backgroundColor;
      const kept = !CSS.supports("forced-color-adjust", "none") || style.forcedColorAdjust === "none";
      return kept && style.backgroundColor !== canvas && style.backgroundColor !== "rgba(0, 0, 0, 0)";
    });

test("in forced colours the select's focus, the unsaved dot and the timing bars keep their marks", async ({ page }) => {
  await forced(page);
  const environment = page.getByRole("combobox", { name: "Environment" });
  await environment.focus();
  await expect(environment).toHaveCSS("outline-style", "solid");
  await expect(environment).toHaveCSS("outline-width", "2px");

  await page.locator("input.address-url").fill(`${ECHO}/content/json?todo=1`);
  await expect(page.getByRole("img", { name: "Unsaved changes" })).toBeVisible();
  expect(await painted(page, ".request-tab-unsaved")).toBe(true);

  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  await page.locator("app-response-viewer").getByRole("tab", { name: "Timings" }).click();
  await expect(page.locator(".timing-bar-fill").first()).toBeVisible();
  expect(await painted(page, ".timing-bar-fill")).toBe(true);
});

test("in forced colours the storage meter keeps its edge and its fill", async ({ page }) => {
  await forced(page);
  const dialog = await openSettings(page, "Data and storage");
  const meter = dialog.locator(".settings-meter");
  await expect(meter).toBeVisible();
  await expect(meter).toHaveCSS("border-top-style", "solid");
  expect(await painted(page, ".settings-meter > span")).toBe(true);
});

test("in forced colours the tree's drop line is a border, not a shadow", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/content/json` });
  test.skip(
    !(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)),
    "this engine does not emulate forced colours",
  );
  const row = page.getByRole("tree").getByRole("treeitem").first();
  await expect(row).toBeVisible();
  for (const [mark, side] of [
    ["ui-tree-row--drop-before", "top"],
    ["ui-tree-row--drop-after", "bottom"],
  ] as const) {
    await row.evaluate((el, cls) => el.classList.add(cls), mark);
    await expect(row).toHaveCSS(`border-${side}-width`, "2px");
    await expect(row).toHaveCSS(`border-${side}-style`, "solid");
    await row.evaluate((el, cls) => el.classList.remove(cls), mark);
  }
});

// U-099: a value is the wire's and reads left to right on a right-to-left page.
test("under dir=rtl the address and the response read left to right", async ({ page }) => {
  await page.goto("/app/");
  await page.evaluate(() => document.documentElement.setAttribute("dir", "rtl"));
  const address = page.locator("input.address-url");
  await address.fill(`${ECHO}/content/json?todo=1`);
  await expect(address).toHaveCSS("direction", "ltr");
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  const editor = page.locator("app-response-viewer .monaco-editor").first();
  await expect(editor).toHaveCSS("direction", "ltr");
  // The editor draws its lines: under rtl it drew none.
  await expect(editor.locator(".view-line").first()).toBeVisible();
  expect(await editor.locator(".view-line").count()).toBeGreaterThan(1);
});
