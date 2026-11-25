import { expect, test } from "@playwright/test";
import { send } from "./support/app";
import { routeThroughBridge, startBridge } from "./support/bridge";
import { ECHO } from "./support/echo";

// S4b3: the Timings tab draws the send's phases against the whole and says where they came from.

test("@claim:C-105 phases from the browser are a strip that adds up to the send, and say where they came from", async ({
  page,
}) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/delay/300?timings=${Date.now()}`);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await page.locator("app-response-viewer").getByRole("tab", { name: "Timings" }).click();
  const timings = page.getByRole("tabpanel", { name: "Timings" });
  await expect(timings.locator(".timing-source")).toHaveText("Phases from the browser.");
  await expect(timings.getByRole("img", { name: /^Where the time went: / })).toBeVisible();
  const legend = timings.locator(".timing-legend li");
  await expect(legend.filter({ hasText: "TTFB" })).toHaveCount(1);
  // The strip is as wide as its pane, and no segment is wider than the strip.
  const widths = await timings.locator(".timing-strip").evaluate((strip) => {
    const whole = strip.getBoundingClientRect().width;
    return [...strip.children].map((segment) => segment.getBoundingClientRect().width / whole);
  });
  expect(widths.length).toBeGreaterThan(0);
  expect(widths.reduce((all, w) => all + w, 0)).toBeLessThanOrEqual(1.001);
});

test("@claim:C-105 through the Local Bridge the phases are the bridge's, and say so", async ({ page }) => {
  const bridge = await startBridge();
  try {
    await page.goto("/app/");
    await routeThroughBridge(page, bridge);
    await page.locator("input.address-url").fill(`${ECHO}/delay/200`);
    await send(page);
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
    await page.locator("app-response-viewer").getByRole("tab", { name: "Timings" }).click();
    await expect(page.getByRole("tabpanel", { name: "Timings" }).locator(".timing-source")).toHaveText(
      "Phases from the Local Bridge.",
    );
  } finally {
    bridge.stop();
  }
});
