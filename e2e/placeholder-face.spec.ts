import { test, expect } from "@playwright/test";

// U-148 (D4-e): a placeholder is the app's words, in its face; the wire's face is for what is typed or sent. One
// that shows an example value says so (placeholder-mono).
test("the address's placeholder is in the app's face and what is typed in it is in the wire's", async ({ page }) => {
  await page.goto("/app/");
  const address = page.locator("input.address-url");
  const face = (pseudo?: string) => address.evaluate((el, p) => getComputedStyle(el, p).fontFamily, pseudo);
  const sans = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--font-sans"));
  const mono = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--font-mono"));
  const first = (list: string) => list.split(",")[0].trim().replace(/["']/g, "");
  expect(first(await face("::placeholder"))).toBe(first(sans));
  expect(first(await face())).toBe(first(mono));
});
