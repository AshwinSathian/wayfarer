#!/usr/bin/env node
// Takes the site's pictures of the app (W2.1 of PLAN-design.md): the app as
// built, in Chromium, with one request sent and its response shown. The
// server's answer is made up here (`page.route`), since the e2e servers' own
// addresses are not what a reader should see; the app is the real one.
// Run again after a change the pictures should show (D5 retakes them).
//
// Usage: npm run build && node e2e/support/prod-server.mjs dist/deploy 4200 &
//        node scripts/site-screenshot.mjs [base]   (default http://localhost:4200)
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:4200";
const ADDRESS = "https://api.example.com/v1/users/42";
const BODY = {
  id: 42,
  name: "Ada Lovelace",
  email: "ada@example.com",
  roles: ["admin", "editor"],
  created: "2026-10-01T09:30:00Z",
};
const OUT = "packages/site/public/app";

const browser = await chromium.launch();
try {
  // The window at 1440 and at half that, and the app as a phone draws it, for the landing on a phone (D5-e): the
  // whole window squeezed to 358 px could not be read. Each in both themes: the landing shows the page's.
  const shots = [
    [{ width: 1440, height: 900 }, 1, ""],
    [{ width: 1440, height: 900 }, 0.5, "-720"],
    [{ width: 390, height: 760 }, 2, "-phone"],
  ].flatMap(([viewport, scale, suffix]) => [
    [viewport, scale, suffix, "dark"],
    [viewport, scale, `-light${suffix}`, "light"],
  ]);
  for (const [viewport, scale, suffix, theme] of shots) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
    await page.addInitScript((theme) => localStorage.setItem("wayfarer:theme", theme), theme);
    await page.route(ADDRESS, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(BODY),
      }),
    );
    await page.goto(`${base}/app/`);
    await page.locator("input.address-url").fill(ADDRESS);
    await page.getByRole("button", { name: "Send request" }).click();
    await page.locator(".status-badge").filter({ hasText: "200" }).waitFor();
    // The response fades in (C-050).
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}${suffix}.jpg`, type: "jpeg", quality: 80 });
    console.log(`site-screenshot: ${OUT}${suffix}.jpg (${viewport.width * scale}x${viewport.height * scale})`);
    await page.close();
  }
} finally {
  await browser.close();
}
