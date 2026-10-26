import { expect, test } from "@playwright/test";
import { OPEN } from "./design/open";
import { SCREENS_INDEX } from "./design/screens";

// U-065 (WCAG 1.4.10 Reflow): at 320 px, a phone or 400% zoom on a 1,280 px window, no screen of D0.1's index scrolls
// sideways, and every open dialog and drawer is inside the window. The page's width is measured beside its scrollbar:
// in WebKit a drawer 100vw wide lost its first 5 px under the window's left edge.

test.use({ serviceWorkers: "block" });

for (const { id } of SCREENS_INDEX) {
  test(`${id} fits a 320 px window`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await OPEN[id](page);
    // A drawer slides in: measure where it ends.
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .every(
          (animation) =>
            animation.playState !== "running" ||
            !(animation.effect as KeyframeEffect | null)?.target?.matches("dialog"),
        ),
    );
    const outside = await page.evaluate(() => {
      const room = document.documentElement.clientWidth;
      const found: string[] = [];
      if (document.documentElement.scrollWidth > room)
        found.push(`the page is ${document.documentElement.scrollWidth} px`);
      for (const dialog of document.querySelectorAll("dialog[open]")) {
        const box = dialog.getBoundingClientRect();
        const name = dialog.getAttribute("aria-label") ?? dialog.className;
        if (box.left < -0.5 || box.right > room + 0.5) found.push(`${name} is at ${box.left}–${box.right}`);
        if (dialog.scrollWidth > dialog.clientWidth + 1) found.push(`${name} scrolls sideways`);
      }
      return found;
    });
    expect(outside).toEqual([]);
  });
}
