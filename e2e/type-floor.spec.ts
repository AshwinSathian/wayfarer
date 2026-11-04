// D3.2: no text is drawn under 12 px. The token test holds the stylesheets to
// it; this holds what a browser draws, in each view, to it as well.
import { expect, test, type Page } from "@playwright/test";
import { openEnvironments, openSettings, seedAndOpen, send } from "./support/app";
import { ECHO } from "./support/echo";
import { OPEN } from "./design/open";

/** Every visible text node under 12 px, as "font-size: text". Monaco sets its own size; it is left out. */
const smallText = (page: Page) =>
  page.evaluate(() => {
    const small: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const parent = node.parentElement;
      if (!text || !parent || parent.closest(".monaco-editor, [aria-hidden='true'], [hidden]")) continue;
      if (!parent.getClientRects().length || getComputedStyle(parent).visibility === "hidden") continue;
      const size = parseFloat(getComputedStyle(parent).fontSize);
      if (size < 12) small.push(`${size}px: ${text.slice(0, 40)}`);
    }
    return small;
  });

for (const width of [1440, 390]) {
  test(`no text is drawn under 12 px at ${width} px: the composer with a response, every Settings section, the environments`, async ({
    page,
  }) => {
    test.slow();
    // Seeded wide: below 1200 px the tree it opens the request from is a closed drawer.
    await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` });
    await page.setViewportSize({ width, height: 900 });
    await send(page);
    await expect(page.locator(".status-badge")).toHaveText("200");
    expect(await smallText(page), "the composer").toEqual([]);

    const settings = await openSettings(page);
    const sections = settings.getByRole("navigation", { name: "Settings sections" }).getByRole("button");
    for (const name of await sections.allInnerTexts()) {
      const section = name.trim();
      // Below 768 px the list is the dialog and a section opens in its place.
      const list = settings.getByRole("navigation", { name: "Settings sections" });
      if (!(await list.isVisible())) await settings.getByRole("button", { name: "All settings" }).click();
      await list.getByRole("button", { name: section, exact: true }).click();
      await expect(settings.getByRole("heading", { name: section, exact: true })).toBeVisible();
      expect(await smallText(page), `Settings, ${section}`).toEqual([]);
    }
    await page.keyboard.press("Escape");
    await expect(settings).toBeHidden();

    await openEnvironments(page);
    expect(await smallText(page), "the environments").toEqual([]);
  });
}

test("what a user typed or a server sent is monospace; names and prose are not", async ({ page }) => {
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` });
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  const family = (locator: ReturnType<Page["locator"]>) =>
    locator.first().evaluate((el) => getComputedStyle(el).fontFamily);
  const mono = /^"?JetBrains Mono/;
  expect(await family(page.locator("input.address-url")), "the address").toMatch(mono);
  expect(await family(page.getByLabel("HTTP method")), "the method").toMatch(mono);
  expect(await family(page.getByLabel("Filter the JSON by path")), "the path filter").toMatch(mono);
  await page.getByRole("tab", { name: "Headers" }).first().click();
  await page.getByRole("button", { name: "Add Header" }).click();
  expect(await family(page.getByLabel(/^Header name, 1 of /)), "a header's name").toMatch(mono);
  expect(await family(page.getByLabel("Value of this header")), "a header's value").toMatch(mono);
  const environments = await openEnvironments(page);
  await environments
    .getByRole("button", { name: /New environment|Create/ })
    .first()
    .click();
  expect(await family(page.locator("#new-env-name-input")), "an environment's name").not.toMatch(mono);
});

test("a bare form control takes the font of the text around it, not the browser's own", async ({ page }) => {
  await page.goto("/app/");
  await expect(page.locator("input.address-url")).toBeVisible();
  // WebKit on macOS gives a bare <button> 11 px of its own; Chromium 13.33 px; Linux's engines other sizes.
  const fonts = await page.evaluate(() => {
    const host = document.createElement("div");
    host.style.fontSize = "17px";
    // Made one by one: the page's Trusted Types policy is not asked to take HTML.
    for (const tag of ["button", "input", "select", "textarea"]) host.append(document.createElement(tag));
    document.body.append(host);
    const out = [...host.children].map(
      (el) =>
        `${el.tagName} ${getComputedStyle(el).fontSize} ${getComputedStyle(el).fontFamily === getComputedStyle(host).fontFamily}`,
    );
    host.remove();
    return out;
  });
  expect(fonts).toEqual(["BUTTON 17px true", "INPUT 17px true", "SELECT 17px true", "TEXTAREA 17px true"]);
});

// The final pass (L-8 to L-10): the wire's face is never under 13 px (CLAUDE.md, U-151). A `font-mono` span inside
// 12 px text inherited 12 px: the exchange record's host and reported words, the bridge's command, History's status.
for (const id of ["response-error", "history", "response-headers", "run"] as const) {
  test(`no JetBrains Mono text is under 13 px: ${id}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await OPEN[id](page);
    const small = await page.evaluate(() => {
      const out: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const element = node.parentElement;
        const text = node.textContent?.trim();
        if (!element || !text || element.closest(".monaco-editor, [inert], [hidden]")) continue;
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        if (!box.width || !box.height || style.visibility === "hidden") continue;
        if (/^"?JetBrains Mono/.test(style.fontFamily) && parseFloat(style.fontSize) < 13)
          out.push(`${style.fontSize} "${text.slice(0, 40)}"`);
      }
      return out;
    });
    expect(small).toEqual([]);
  });
}
