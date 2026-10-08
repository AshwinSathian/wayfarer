import { test } from "@playwright/test";
import { ECHO } from "./support/echo";

// Temporary: why no tooltip appears on keyboard focus in Linux Chromium.
test("debug tooltip timeline", async ({ page, browserName }) => {
  await page.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { __log: string[] }).__log = log;
    const t0 = performance.now();
    const say = (m: string) => log.push(`${(performance.now() - t0).toFixed(1)} ${m}`);
    const name = (n: EventTarget | null) => (n instanceof Element ? `${n.tagName}.${(n.getAttribute("aria-label") ?? n.className.toString().slice(0, 40))}` : String(n));
    for (const type of ["keydown", "keyup", "focus", "blur", "mousemove", "mouseenter", "mouseleave", "pointerdown", "wheel", "scroll"]) {
      window.addEventListener(type, (e) => say(`${type} target=${name(e.target)} related=${name((e as FocusEvent).relatedTarget ?? null)} key=${(e as KeyboardEvent).key ?? ""}`), true);
    }
    window.addEventListener("focus", () => say("WINDOW focus"));
    window.addEventListener("blur", () => say("WINDOW blur"));
    document.addEventListener("DOMContentLoaded", () => {
      new MutationObserver((records) => {
        for (const r of records) {
          for (const n of r.addedNodes) if (n instanceof Element && /tooltip|overlay/.test(n.outerHTML.slice(0, 300))) say(`ADDED ${n.outerHTML.slice(0, 160)}`);
          for (const n of r.removedNodes) if (n instanceof Element && /tooltip|overlay/.test(n.outerHTML.slice(0, 300))) say(`REMOVED ${n.outerHTML.slice(0, 160)}`);
          if (r.type === "attributes" && r.target instanceof Element && /curl-btn|tooltip/.test(r.target.className.toString())) say(`ATTR ${r.attributeName} -> ${r.target.getAttribute(r.attributeName ?? "")?.slice(0, 200)}`);
        }
      }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "disabled"] });
    });
  });
  await page.goto("/");
  await page.locator("input.address-url").fill(`${ECHO}/content/json?tooltip=1`);
  const curl = page.getByRole("button", { name: "Copy as cURL" });
  await page.locator("input.address-url").focus();
  const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
  for (let i = 0; i < 4 && !(await curl.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press(tab);
  await page.waitForTimeout(1500);
  const log = await page.evaluate(() => (window as unknown as { __log: string[] }).__log);
  console.log(`\n==== ${browserName} ====\n` + log.filter((l) => !/mousemove/.test(l)).join("\n"));
  console.log("tooltips:", await page.locator(".mat-mdc-tooltip").count(), "ua:", await page.evaluate(() => navigator.userAgent));
});
