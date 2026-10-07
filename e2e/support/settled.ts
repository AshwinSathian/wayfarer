import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Resolves once every finite animation and transition on the page has
 * finished. Overlays fade in with CSS: until that ends, axe reads blended
 * colours, and PrimeNG 21 has not yet bound the overlay's Escape handler.
 */
export function settled(page: Page): Promise<unknown> {
  return page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity)
  );
}

/**
 * Resolves once the element has stopped moving and resizing. The composer
 * and response panes keep resizing for a few hundred ms after a response
 * arrives; a click or drag aimed at an element's old position lands beside it.
 */
export async function still(locator: Locator): Promise<void> {
  let last = "";
  await expect
    .poll(async () => {
      const box = await locator.boundingBox();
      const now = box ? `${box.x},${box.y},${box.width},${box.height}` : "";
      const same = now !== "" && now === last;
      last = now;
      return same;
    })
    .toBe(true);
}
