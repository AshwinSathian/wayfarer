import { test, expect, type Locator } from "@playwright/test";
import { seedAndOpen } from "./support/app";
import { ECHO } from "./support/echo";

// S2b: a method is its name and one glyph before it, so that PUT, PATCH and OPTIONS (hues close together) and a
// colour-blind reader are told apart by shape: ring = reads, dot = writes, bar = DELETE. Undo leaves the page: it is
// a strip over the status bar's row, never over the composer, the response or the splitter (audit 21).

const glyphOf = (scope: Locator) => scope.locator("ui-method-glyph").first();

test("a method's glyph is a ring, a dot or a bar by its class, whatever its case", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/content/json` });
  const tab = page.getByRole("tab", { selected: true }).first();
  const method = page.getByRole("textbox", { name: "HTTP method" });
  const classes: [string, string][] = [
    ["GET", "ring"],
    ["HEAD", "ring"],
    ["OPTIONS", "ring"],
    ["POST", "dot"],
    ["PUT", "dot"],
    ["patch", "dot"],
    ["PURGE", "dot"],
    ["DELETE", "bar"],
  ];
  for (const [name, glyph] of classes) {
    await method.fill(name);
    await expect(glyphOf(tab)).toHaveAttribute("data-glyph", glyph);
    await expect(glyphOf(tab).locator("svg")).toHaveAttribute("aria-hidden", "true");
  }
  await expect(page.getByRole("tree").locator("ui-method-glyph").first()).toBeVisible();
});

test("a method column keeps its place at every depth and its glyph is the method's colour", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAndOpen(page, {}, { method: "DELETE", url: `${ECHO}/content/json`, folder: {} });
  const tree = page.getByRole("tree");
  await expect(tree.locator(".method-tag").first()).toBeVisible();
  const box = await tree.locator(".method-tag").first().boundingBox();
  const name = await tree.locator(".tree-request-name").first().boundingBox();
  expect(box && name && name.x - (box.x + box.width)).toBeGreaterThanOrEqual(0);
  const colours = await tree
    .locator(".method-tag")
    .first()
    .evaluate((tag) => [getComputedStyle(tag).color, getComputedStyle(tag.querySelector("ui-method-glyph")!).color]);
  expect(colours[0]).toBe(colours[1]);
});

test("in forced colours a method's glyph is CanvasText", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await seedAndOpen(page, {}, { method: "POST", url: `${ECHO}/content/json` });
  test.skip(
    !(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)),
    "this engine does not emulate forced colours",
  );
  const [glyph, canvasText] = await page
    .locator("ui-method-glyph")
    .first()
    .evaluate((el) => {
      const probe = document.createElement("span");
      probe.style.color = "CanvasText";
      document.body.append(probe);
      const text = getComputedStyle(probe).color;
      probe.remove();
      return [getComputedStyle(el).color, text];
    });
  expect(glyph).toBe(canvasText);
});

for (const width of [390, 820, 1440]) {
  test(`Undo stays off the composer, the response and the splitter at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/content/json`, folder: {} });
    await page.setViewportSize({ width, height: 900 });
    if (width < 1200) await page.getByRole("button", { name: /^(Show|Hide) sidebar$/ }).click();
    await page.getByRole("tree").getByText("Tripwire folder", { exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const bar = page.locator(".undo-bar");
    await expect(bar).toContainText("Deleted Tripwire folder");
    const area = await bar.boundingBox();
    const viewport = page.viewportSize();
    expect(area && viewport && area.y + area.height).toBeCloseTo(viewport?.height ?? 0, 0);
    // The strip is the foot: it is the status bar's row where there is one, and nothing of the page is under it on
    // desktop (the composer ends where the status bar begins).
    if (width >= 768) {
      const footer = await page.locator(".status-bar").boundingBox();
      expect(area && footer && area.y).toBeGreaterThanOrEqual((footer?.y ?? 0) - 4);
      for (const selector of ["app-composer", ".composer-response-splitter"]) {
        const box = await page.locator(selector).first().boundingBox();
        expect(box && area && box.y + box.height).toBeLessThanOrEqual((area?.y ?? 0) + 1);
      }
    }
  });
}

test("Undo is offered for 10 s and stays while the pointer is on it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.install();
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/content/json`, folder: {} });
  await page.getByRole("tree").getByText("Tripwire folder", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const bar = page.locator(".undo-bar");
  await expect(bar).toContainText("Deleted");
  await page.clock.runFor(9_000);
  await expect(bar).toContainText("Deleted");
  await bar.hover();
  await page.clock.runFor(30_000);
  await expect(bar).toContainText("Deleted");
  await page.mouse.move(5, 5);
  await page.clock.runFor(10_500);
  await expect(bar).not.toContainText("Deleted");
});
