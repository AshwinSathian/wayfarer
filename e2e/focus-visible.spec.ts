import { expect, test, type Page } from "@playwright/test";
import { ECHO } from "./support/echo";

// WCAG 2.4.7: where the keyboard is, shows. The app draws no focus ring (CLAUDE.md), so each control draws its own
// change: a field's edge, a row's fill, an inset edge for a button, a tab or a splitter. This holds every control the
// keyboard can reach: focused from the keyboard, its box must not look as it does at rest. (loupe's review of 3.5.0
// found 14 of 43 stops of the first-run screen identical, by pixels.)

async function stopsWithNoChange(page: Page): Promise<string[]> {
  // The keyboard was the last input: focus() then draws what Tab would, and a transition ends at once.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press("Tab");
  await page.mouse.move(1, 1);
  const stops = await page.evaluate(() => {
    const selector =
      'button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role="tab"]';
    const out: { index: number; name: string; x: number; y: number; width: number; height: number }[] = [];
    document.querySelectorAll<HTMLElement>(selector).forEach((element, index) => {
      if ((element as HTMLButtonElement).disabled || element.closest("[inert], [hidden]")) return;
      const box = element.getBoundingClientRect();
      if (box.width < 4 || box.height < 4) return;
      if (box.top < 0 || box.left < 0 || box.bottom > innerHeight || box.right > innerWidth) return;
      // The one on top at its centre is the element (not hidden under another layer, such as the page under a dialog).
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      if (top !== element && !element.contains(top) && !top?.contains(element)) return;
      if (getComputedStyle(element).visibility !== "visible") return;
      element.dataset["focusProbe"] = String(index);
      out.push({
        index,
        name: (
          element.getAttribute("aria-label") ||
          element.textContent ||
          element.getAttribute("placeholder") ||
          element.tagName
        )
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 40),
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      });
    });
    // Tabs last: focusing one chooses it (Aria), and the panes of the others are inert until it is chosen again.
    return out.sort((a, b) => Number(isTab(a.index)) - Number(isTab(b.index)));
    function isTab(index: number): boolean {
      return document.querySelector(`[data-focus-probe="${index}"]`)?.getAttribute("role") === "tab";
    }
  });
  const same: string[] = [];
  for (const stop of stops) {
    const clip = {
      x: Math.max(0, stop.x - 4),
      y: Math.max(0, stop.y - 4),
      width: stop.width + 8,
      height: stop.height + 8,
    };
    const probe = page.locator(`[data-focus-probe="${stop.index}"]`);
    // A control in a pane chosen away from while earlier tabs were focused is not reachable now.
    if (await probe.evaluate((element) => element.closest("[inert]") !== null)) continue;
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const rest = await page.screenshot({ clip });
    await probe.evaluate((element) => (element as HTMLElement).focus());
    // Two frames: a style change and its transition (a thousandth of a millisecond with reduced motion) are drawn.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const focused = await page.screenshot({ clip });
    if (rest.equals(focused)) same.push(stop.name);
  }
  expect(stops.length, "the page has controls to check").toBeGreaterThan(8);
  return same;
}

test("@claim:C-097 every control the keyboard reaches shows that it has focus, on the first-run screen", async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await expect(page.locator("input.address-url")).toBeVisible();
  expect(await stopsWithNoChange(page)).toEqual([]);
});

test("@claim:C-097 every control the keyboard reaches shows that it has focus, with a collection and a response", async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await page.getByRole("button", { name: "New collection" }).first().click();
  await page.locator("#creation-name-input").fill("Focus");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator("#creation-name-input")).toHaveCount(0);
  await page.locator("input.address-url").fill(`${ECHO}/echo`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  expect(await stopsWithNoChange(page)).toEqual([]);
});

test("@claim:C-097 every control the keyboard reaches shows that it has focus, on a phone", async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/");
  await expect(page.locator("input.address-url")).toBeVisible();
  expect(await stopsWithNoChange(page)).toEqual([]);
});
