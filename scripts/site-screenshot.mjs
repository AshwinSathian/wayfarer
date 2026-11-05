#!/usr/bin/env node
// Takes the site's still of the app (W2.1 of PLAN-design.md): the app as
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
  // The site's one still of the app: the screenshot its structured data names (structured-data.ts). The landing shows
  // recordings (scripts/site-record.mjs, W5.2).
  const shots = [[{ width: 1440, height: 900 }, 1, "", "dark"]];
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
    // The response is drawn as it arrives (D3.7 took its fade away): wait for its body, the faces, and any transition
    // that is still under way (the status badge's colour), not for a time.
    await page.locator("app-response-viewer").getByText("Ada Lovelace").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
    );
    await page.screenshot({ path: `${OUT}${suffix}.jpg`, type: "jpeg", quality: 80 });
    console.log(`site-screenshot: ${OUT}${suffix}.jpg (${viewport.width * scale}x${viewport.height * scale})`);
    await page.close();
  }
} finally {
  await browser.close();
}
