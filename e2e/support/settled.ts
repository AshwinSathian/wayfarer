import type { Page } from "@playwright/test";

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
