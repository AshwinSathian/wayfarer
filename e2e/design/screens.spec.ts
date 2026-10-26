import { expect, test, type Locator, type Page } from "@playwright/test";
import { OPEN, quiet, still } from "./open";
import { SCREENS_INDEX, WIDTHS } from "./screens";

// D0.1 of PLAN-design.md: every screen of the index (screens.ts) at four widths, in both themes, as a
// `toHaveScreenshot` baseline (section 10). It runs in the design-* projects only, a CI job of its own
// that does not fail the build. The snapshots are Linux's: take them in Playwright's Docker image
// (docs/design/baseline/index.md says how).

// A service worker takes control of the page sooner or later, and Diagnostics says which: none here.
test.use({ serviceWorkers: "block" });

async function steady(page: Page): Promise<void> {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest(".monaco-editor")) continue;
      const text = node.textContent ?? "";
      const fixed = text
        .replace(/\d+(\.\d+)?\s?(µs|ms)\b/g, "12 ms")
        // Only what the browser stores ("73.7 kB of 10.7 GB", "73.7 kB used"), not a limit the copy names.
        .replace(/\d+(\.\d+)?\s?(B|kB|MB|GB)(?= used| of )|(?<=of )\d+(\.\d+)?\s?(B|kB|MB|GB)/g, "12 kB");
      if (fixed !== text) node.textContent = fixed;
    }
    // A HAR's preview writes what the browser measured as JSON numbers, and when the exchange started.
    for (const preview of document.querySelectorAll(".har-export-preview")) {
      const text = preview.textContent ?? "";
      const fixed = text
        .replace(/("(?:time|blocked|dns|connect|send|wait|receive|ssl)": )-?\d+(\.\d+)?/g, "$112")
        .replace(/("startedDateTime": ")[^"]*"/g, '$12026-10-22T09:30:00.000Z"');
      if (fixed !== text) preview.textContent = fixed;
    }
  });
}
const THRESHOLD = { maxDiffPixels: 200 };
/** Masked: an editor's caret, and what differs from build to build or with what the browser has stored. */
const masked = (page: Page): Locator[] => [
  page.locator(".monaco-editor .cursors-layer"),
  page.getByText(/^\s*[0-9a-f]{7,40}\s*$/),
  page.getByText(/^\s*\d+\.\d+\.\d+\s*$/),
  page.locator('[aria-label*=" used of "]'),
];

for (const { id } of SCREENS_INDEX) {
  for (const { width, height } of WIDTHS) {
    test(`${id} at ${width} px`, async ({ page }) => {
      test.slow();
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
      await page.clock.setFixedTime(new Date("2026-10-22T09:30:00Z"));
      await OPEN[id](page);
      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await page.mouse.move(width - 2, height - 2);
        await quiet(page);
        await still(page);
        await steady(page);
        await expect(page).toHaveScreenshot(`${id}-${width}-${theme}.png`, {
          animations: "disabled",
          mask: masked(page),
          ...THRESHOLD,
        });
      }
    });
  }
}
