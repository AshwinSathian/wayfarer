// D3.4, docs/design/motion.md: with reduced motion nothing moves for longer
// than --dur-none (0.001 ms, a length so the end events Material waits for are
// still sent), nothing waits to start and nothing loops; without it, nothing
// loops but what loads.
import { expect, test, type Page } from "@playwright/test";
import { openSettings, seedAndOpen, send } from "./support/app";
import { ECHO } from "./support/echo";

/** Every running animation and every element's transitions that last, wait or loop. */
const motion = (page: Page) =>
  page.evaluate(() => {
    const found: string[] = [];
    for (const animation of document.getAnimations()) {
      const timing = animation.effect?.getComputedTiming();
      const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
      const where = target ? `${target.nodeName.toLowerCase()}.${[...target.classList].join(".")}` : "?";
      const name = "animationName" in animation ? String(animation.animationName) : "transition";
      if (!timing) continue;
      if (Number(timing.duration) > 0.001 || Number(timing.delay) !== 0 || timing.iterations !== 1) found.push(`${name} on ${where}: ${timing.duration} ms × ${timing.iterations}, after ${timing.delay} ms`);
    }
    const ms = (value: string) => value.split(",").map((part) => parseFloat(part) * (part.trim().endsWith("ms") ? 1 : 1000));
    for (const el of document.querySelectorAll("*")) {
      const style = getComputedStyle(el);
      if (ms(style.transitionDuration).some((d) => d > 0.001) || ms(style.transitionDelay).some((d) => d !== 0)) {
        found.push(`transition on ${el.nodeName.toLowerCase()}.${[...el.classList].join(".")}: ${style.transitionDuration} after ${style.transitionDelay}`);
      }
    }
    return [...new Set(found)];
  });

test("with reduced motion nothing lasts, waits or loops: a response, Settings, a menu, a missing variable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` });
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  expect(await motion(page), "a response").toEqual([]);

  await page.locator("input.address-url").fill(`${ECHO}/{{nowhere}}`);
  await expect(page.locator(".var-chip.var-missing")).toBeVisible();
  expect(await motion(page), "a missing variable").toEqual([]);

  await page.getByRole("button", { name: "Export response" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  expect(await motion(page), "a menu").toEqual([]);
  await page.keyboard.press("Escape");

  await openSettings(page);
  expect(await motion(page), "Settings").toEqual([]);
});

test("without reduced motion the missing variable's pulse stops: twice, then still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/{{nowhere}}`);
  const chip = page.locator(".var-chip.var-missing");
  await expect(chip).toBeVisible();
  const iterations = await chip.evaluate((el) => el.getAnimations().map((a) => a.effect?.getComputedTiming().iterations));
  expect(iterations).toEqual([2]);
});
