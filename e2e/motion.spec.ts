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
      if (Number(timing.duration) > 0.001 || Number(timing.delay) !== 0 || timing.iterations !== 1)
        found.push(`${name} on ${where}: ${timing.duration} ms × ${timing.iterations}, after ${timing.delay} ms`);
    }
    const ms = (value: string) =>
      value.split(",").map((part) => parseFloat(part) * (part.trim().endsWith("ms") ? 1 : 1000));
    for (const el of document.querySelectorAll("*")) {
      const style = getComputedStyle(el);
      if (ms(style.transitionDuration).some((d) => d > 0.001) || ms(style.transitionDelay).some((d) => d !== 0)) {
        found.push(
          `transition on ${el.nodeName.toLowerCase()}.${[...el.classList].join(".")}: ${style.transitionDuration} after ${style.transitionDelay}`,
        );
      }
    }
    return [...new Set(found)];
  });

test("with reduced motion nothing lasts, waits or loops: a response, Settings, a menu, a missing variable", async ({
  page,
}) => {
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
  const iterations = await chip.evaluate((el) =>
    el.getAnimations().map((a) => a.effect?.getComputedTiming().iterations),
  );
  expect(iterations).toEqual([2]);
});

// D3.7 (U-078, U-079, U-121, U-122): the most frequent action has the least motion. Without reduced motion, as a
// person who never asked for less sees it.
test.describe("Send's motion, without reduced motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("a reply under 100 ms shows no skeleton, and the response and its status line are never part-transparent", async ({
    page,
  }) => {
    await page.goto("/app/");
    await page.locator("input.address-url").fill(`${ECHO}/echo?d37=1`);
    // Every frame from the press to the answer, and a few after.
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { d37: string[] }).d37 = seen;
      const look = () => {
        if (document.querySelector(".response-pane .ui-skeleton, app-response-viewer .ui-skeleton"))
          seen.push("a skeleton");
        for (const selector of ["app-response-viewer", ".response-status"]) {
          for (let el = document.querySelector(selector); el; el = el.parentElement) {
            const opacity = Number(getComputedStyle(el).opacity);
            if (opacity < 1) seen.push(`${selector} at ${opacity} through ${el.nodeName.toLowerCase()}`);
          }
        }
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    const started = Date.now();
    await send(page);
    await expect(page.locator(".status-badge")).toHaveText("200");
    expect(Date.now() - started, "the echo server answers at once").toBeLessThan(1000);
    await page.waitForTimeout(400);
    expect([...new Set(await page.evaluate(() => (window as unknown as { d37: string[] }).d37))]).toEqual([]);
  });

  test("a reply that takes 2 s shows nothing for its first second, then Sending and the time so far", async ({
    page,
  }) => {
    await page.goto("/app/");
    await page.locator("input.address-url").fill(`${ECHO}/delay/2000`);
    await send(page);
    const sending = page.locator(".response-sending");
    await page.waitForTimeout(500);
    await expect(sending).toHaveText("");
    await expect(sending).toHaveText(/^Sending… 1\.\d s$/, { timeout: 1200 });
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 5000 });
  });

  test("Send does not shrink while it is pressed", async ({ page }) => {
    await page.goto("/app/");
    await page.locator("input.address-url").fill(`${ECHO}/echo`);
    const sendButton = page.getByRole("button", { name: "Send request" });
    const box = (await sendButton.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    expect(await sendButton.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
    await page.mouse.up();
  });

  test("a theme change starts no transition", async ({ page }) => {
    await page.goto("/app/");
    await expect(page.locator("input.address-url")).toBeVisible();
    // The caret starts in the address: leaving it fades the bar's border, which is focus, not the theme.
    await page.locator("input.address-url").blur();
    await page.waitForTimeout(300);
    const toggle = page.locator(".status-bar").getByRole("button", { name: /^Theme: (system|light|dark)$/ });
    // The pointer on the toggle itself is a hover, which may fade its colour: that is not the theme's.
    await toggle.evaluate((button) => {
      (window as unknown as { started: string[] }).started = [];
      document.addEventListener(
        "transitionstart",
        (event) => {
          const target = event.target as Element;
          if (target !== button && !button.contains(target))
            (window as unknown as { started: string[] }).started.push(
              `${target.nodeName}.${[...target.classList].join(".")} ${event.propertyName}`,
            );
        },
        true,
      );
    });
    await toggle.click();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await toggle.click();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { started: string[] }).started)).toEqual([]);
  });
});
