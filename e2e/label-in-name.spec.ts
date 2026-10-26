import { expect, test } from "@playwright/test";
import { OPEN } from "./design/open";
import { SCREENS_INDEX } from "./design/screens";

// D4.11 (U-063, U-141; WCAG 2.5.3 Label in Name): a person who uses voice control says what they see. On every
// screen of D0.1's index, each control that shows words has an accessible name that starts with them. The names are
// the DOM's, the same in every engine, so this runs in Chromium only.

test.use({ serviceWorkers: "block" });

for (const { id } of SCREENS_INDEX) {
  test(`${id}: every control's name starts with the words it shows`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "names are the DOM's, not the engine's");
    test.slow();
    await page.setViewportSize({ width: 1440, height: 900 });
    await OPEN[id](page);
    const mismatched = await page.evaluate(() => {
      const words = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
      /** The text drawn in the control: not its icons, not what is hidden from everyone or shown only to a screen reader. */
      const shown = (element: Element) => {
        const copy = element.cloneNode(true) as Element;
        copy.querySelectorAll("app-icon, [aria-hidden='true'], .sr-only, ui-spinner").forEach((part) => part.remove());
        return words(copy.textContent ?? "");
      };
      const nameOf = (element: Element) => {
        const by = element.getAttribute("aria-labelledby");
        if (by)
          return words(
            by
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent ?? "")
              .join(" "),
          );
        return words(element.getAttribute("aria-label") ?? shown(element));
      };
      // With a modal dialog open, the page under it is inert: only the topmost dialog's controls can be reached.
      const modals = [...document.querySelectorAll("dialog")].filter((dialog) => dialog.matches(":modal"));
      const scope: ParentNode = modals.at(-1) ?? document;
      const controls = scope.querySelectorAll(
        "button, a[href], [role='button'], [role='tab'], [role='menuitem'], [role='option'], [role='link'], [role='radio']",
      );
      const found: string[] = [];
      for (const control of controls) {
        if (!control.checkVisibility() || control.closest("[aria-hidden='true']")) continue;
        const visible = shown(control);
        if (!visible) continue;
        const name = nameOf(control);
        if (!name.startsWith(visible)) found.push(`"${visible}" is named "${name}"`);
      }
      return [...new Set(found)];
    });
    expect(mismatched).toEqual([]);
  });
}
