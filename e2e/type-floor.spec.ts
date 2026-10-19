// D3.2: no text is drawn under 12 px. The token test holds the stylesheets to
// it; this holds what a browser draws, in each view, to it as well.
import { expect, test, type Page } from "@playwright/test";
import { openEnvironments, openSettings, seedAndOpen, send } from "./support/app";
import { ECHO } from "./support/echo";

/** Every visible text node under 12 px, as "font-size: text". Monaco sets its own size; it is left out. */
const smallText = (page: Page) =>
  page.evaluate(() => {
    const small: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const parent = node.parentElement;
      if (!text || !parent || parent.closest(".monaco-editor, [aria-hidden='true'], [hidden]")) continue;
      if (!parent.getClientRects().length || getComputedStyle(parent).visibility === "hidden") continue;
      const size = parseFloat(getComputedStyle(parent).fontSize);
      if (size < 12) small.push(`${size}px: ${text.slice(0, 40)}`);
    }
    return small;
  });

for (const width of [1440, 390]) {
  test(`no text is drawn under 12 px at ${width} px: the composer with a response, every Settings section, the environments`, async ({ page }) => {
    test.slow();
    // Seeded wide: below 1200 px the tree it opens the request from is a closed drawer.
    await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` });
    await page.setViewportSize({ width, height: 900 });
    await send(page);
    await expect(page.locator(".status-badge")).toHaveText("200");
    expect(await smallText(page), "the composer").toEqual([]);

    const settings = await openSettings(page);
    const sections = settings.getByRole("navigation", { name: "Settings sections" }).getByRole("button");
    for (const name of await sections.allInnerTexts()) {
      const section = name.trim();
      // Below 768 px the list is the dialog and a section opens in its place.
      const list = settings.getByRole("navigation", { name: "Settings sections" });
      if (!(await list.isVisible())) await settings.getByRole("button", { name: "All settings" }).click();
      await list.getByRole("button", { name: section, exact: true }).click();
      await expect(settings.getByRole("heading", { name: section, exact: true })).toBeVisible();
      expect(await smallText(page), `Settings, ${section}`).toEqual([]);
    }
    await page.keyboard.press("Escape");
    await expect(settings).toBeHidden();

    await openEnvironments(page);
    expect(await smallText(page), "the environments").toEqual([]);
  });
}
