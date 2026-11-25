import { expect, test } from "@playwright/test";
import { send } from "./support/app";
import { ECHO } from "./support/echo";

// The response's status line: the class of a status is a glyph of its own shape and a word, so that 200, 404 and 500
// are not told apart by their digits and hue alone.

test("@claim:C-126 each class of status has a glyph of its own shape and a word for a screen reader", async ({
  page,
}) => {
  await page.goto("/app/");
  const shapes = new Map<number, string>();
  for (const [code, word] of [
    [200, "Success"],
    [404, "Client error"],
    [500, "Server error"],
  ] as const) {
    await page.locator("input.address-url").fill(`${ECHO}/status/${code}`);
    await send(page);
    await expect(page.locator(".status-badge")).toHaveText(String(code), { timeout: 15_000 });
    const line = page.locator(".response-status");
    await expect(line.locator(".sr-only", { hasText: word })).toHaveCount(1);
    const glyph = line.locator("app-icon").first();
    await expect(glyph).toBeVisible();
    shapes.set(code, await glyph.evaluate((el) => el.innerHTML));
  }
  expect(new Set(shapes.values()).size, "three codes, three shapes").toBe(3);
});
