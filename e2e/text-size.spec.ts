import { expect, test } from "@playwright/test";

// U-153: a reader who sets the browser's text size to twice the default has a 1,440 px window that is 720 px to the
// layout, as with 200% zoom. Breakpoints in px kept the wide layout: the tree pinned at 700 px, the address and the
// status bar cut. The setting is the browser's default size, which a media query in em reads and the root's font-size
// does not (layout.spec.ts's 200% test sets that one): only Firefox lets a test set it.
test.use({
  launchOptions: { firefoxUserPrefs: { "font.size.variable.x-western": 32, "font.size.monospace.x-western": 26 } },
});

test("at a default text size of 32 px a 1,440 px window is laid out as a 720 px one: the tree a drawer, the composer's sections stacked", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "firefox", "only Firefox lets a test set the browser's text size");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("32px");
  await expect(page.getByRole("tree", { name: "Collections" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Params", exact: true })).toBeVisible();
  expect((await page.locator("input.address-url").boundingBox())?.width).toBeGreaterThan(400);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
});
