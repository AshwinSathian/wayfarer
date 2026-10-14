import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/** WCAG 2.2 at levels A and AA, with the rules of 2.0 and 2.1 it keeps (P7.1). */
export const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];

/**
 * An axe scan of the page at WCAG 2.2 AA, every impact. The one exclusion:
 * .monaco-editor, a third-party widget with its own DOM and rendering that
 * the app's templates cannot reach.
 */
export function axe(page: Page): AxeBuilder {
  return new AxeBuilder({ page }).withTags(WCAG_AA).exclude(".monaco-editor");
}
