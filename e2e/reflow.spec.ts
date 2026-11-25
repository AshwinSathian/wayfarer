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

// Text at twice the size in a 320 px window (WCAG 1.4.4 with 1.4.10): rem boxes grow with the text, so a row built on
// a basis or a width in rem is wider than the window unless it wraps or shrinks. The root's size is set as text-only
// zoom does (text-size.spec.ts sets the browser's own default in Firefox). What is outside the window must be inside
// something that scrolls or clips: a tab bar that scrolls with its fade, a table in its region, an editor's own lines.
for (const [id, size] of [
  ["first-run", 100],
  ["first-run", 200],
  ["response-json", 100],
  ["response-json", 200],
  ["response-error", 200],
  ["history", 200],
  ["run", 100],
  ["run", 200],
  ["settings-general", 200],
] as const) {
  test(`${id} at ${size}% text has nothing past a 320 px window that is not scrolled or clipped`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.addInitScript((percent) => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = `html { font-size: ${percent}% !important; }`;
        document.head.append(style);
      });
    }, size);
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
    const found = await page.evaluate(() => {
      const room = document.documentElement.clientWidth;
      const out: string[] = [];
      if (document.documentElement.scrollWidth > room)
        out.push(`the page is ${document.documentElement.scrollWidth} px`);
      for (const el of document.querySelectorAll("body *")) {
        const box = el.getBoundingClientRect();
        if (!box.width || box.right <= room + 1 || el.closest("dialog:not([open])")) continue;
        let clipped = false;
        for (let up = el.parentElement; up && up !== document.body; up = up.parentElement)
          if (getComputedStyle(up).overflowX !== "visible") {
            clipped = true;
            break;
          }
        if (!clipped)
          out.push(`${el.tagName}.${el.getAttribute("class")?.slice(0, 40)} ends at ${Math.round(box.right)}`);
      }
      return out.slice(0, 8);
    });
    expect(found).toEqual([]);
  });
}
