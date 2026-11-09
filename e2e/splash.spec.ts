// The splash (src/index.html, src/design-system/splash.css): the shell in skeleton from the first frame, in the
// theme drawn, until the app replaces it; and the first frame of the app is the tabs a reload left.
import { expect, test, type Page } from "@playwright/test";
import { dumpIdb } from "./support/app";

// A worker that controls the page would hand it the app's script past the route that holds it back.
test.use({ serviceWorkers: "block" });

const splash = (page: Page) => page.getByRole("status", { name: "Loading Wayfarer" });
/** The app's own script, held back: the page stays as the server sent it. */
const withoutTheApp = (page: Page) => page.route(/\/main(-\w+)?\.js$/, (route) => route.abort());

test("the page the server sends is the splash, named, its drawing hidden from assistive tech", async ({ request }) => {
  const html = await (await request.get("/app/")).text();
  const root = html.slice(html.indexOf("<app-root>"), html.indexOf("</app-root>"));
  expect(root).toContain('role="status"');
  expect(root).toContain('aria-busy="true"');
  expect(root).toContain('aria-label="Loading Wayfarer"');
  expect(root).not.toContain("<script");
  expect(root.match(/aria-hidden="true"/g)).toHaveLength(2);
});

for (const theme of ["light", "dark"] as const) {
  test(`before the app starts the splash is drawn on the ${theme} canvas, the app's, and the app replaces it`, async ({
    page,
  }) => {
    await page.addInitScript((choice) => localStorage.setItem("wayfarer:theme", choice), theme);
    await withoutTheApp(page);
    await page.goto("/app/");
    await expect(splash(page)).toBeVisible();
    await expect(page.locator(".splash-toolbar .ui-skeleton").first()).toBeVisible();
    const colours = await page.evaluate(() => ({
      splash: getComputedStyle(document.querySelector(".splash")!).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
    }));
    expect(colours.splash).toBe(colours.body);
    expect(await page.locator("html").getAttribute("data-theme")).toBe(theme);

    await page.unrouteAll();
    await page.reload();
    await expect(page.locator("input.address-url")).toBeVisible();
    await expect(splash(page)).toHaveCount(0);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(colours.body);
  });
}

test("the splash's toolbar and sidebar are where the app's are, at a phone's width and a desktop's", async ({
  page,
}) => {
  for (const width of [390, 1460]) {
    await page.setViewportSize({ width, height: 800 });
    await withoutTheApp(page);
    await page.goto("/app/");
    const drawn = await page.evaluate(() => ({
      toolbar: document.querySelector(".splash-toolbar")!.getBoundingClientRect().height,
      sidebar: document.querySelector(".splash-sidebar")!.getBoundingClientRect().width,
    }));
    await page.unrouteAll();
    await page.reload();
    await expect(page.locator("input.address-url")).toBeVisible();
    const app = await page.evaluate(() => ({
      toolbar: document.querySelector(".ds-toolbar")!.getBoundingClientRect().height,
      sidebar: document.querySelector(".app-sidebar-pinned")?.getBoundingClientRect().width ?? 0,
    }));
    expect(drawn, `${width} px`).toEqual(app);
  }
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing of the splash moves", async ({ page }) => {
    await withoutTheApp(page);
    await page.goto("/app/");
    await expect(splash(page)).toBeVisible();
    const moving = await page.evaluate(() =>
      document.getAnimations().flatMap((animation) => {
        const timing = animation.effect?.getComputedTiming();
        return timing && (Number(timing.duration) > 0.001 || timing.iterations !== 1) ? [String(timing.duration)] : [];
      }),
    );
    expect(moving).toEqual([]);
  });
});

test("a reload draws the tabs it left from the first frame: never a new, empty tab first", async ({ page }) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill("https://api.example.test/kept");
  // A tab is written 250 ms after it last changed.
  await expect.poll(async () => JSON.stringify((await dumpIdb(page))["tabs"] ?? [])).toContain("api.example.test/kept");
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { seen: string[] }).seen = seen;
    const look = () => {
      const address = document.querySelector<HTMLInputElement>("input.address-url");
      if (address) seen.push(address.value);
      if (seen.length < 30) requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  await page.reload();
  await expect(page.locator("input.address-url")).toHaveValue("https://api.example.test/kept");
  await expect.poll(() => page.evaluate(() => (window as unknown as { seen: string[] }).seen.length)).toBe(30);
  expect(new Set(await page.evaluate(() => (window as unknown as { seen: string[] }).seen))).toEqual(
    new Set(["https://api.example.test/kept"]),
  );
});
