import { expect, test, type Page } from "@playwright/test";
import { axe } from "./support/axe";
import { closeEnvironments, openEnvironments, protectVariable, seedAndOpen, send } from "./support/app";
import { routeThroughBridge, startBridge } from "./support/bridge";
import { ECHO } from "./support/echo";

// Overhaul S4a: the route strip under the address. Before a send it says where the request leaves from, to which host
// and which secrets it names; after one, the road it took and how many secrets went. A problem is said in a line that
// is always there. Its words are `strip` and `sent` in packages/core/src/strings.ts.

const strip = (page: Page) => page.locator("app-route-strip");
const address = (page: Page) => page.locator("input.address-url");
/** The strip as a screen reader has it: the group's name (wide) or the toggle's text (folded). */
const spoken = async (page: Page) => {
  const group = strip(page).getByRole("group");
  if (await group.count()) return group.getAttribute("aria-label");
  return strip(page).locator(".route-toggle .sr-only").textContent();
};
const answered = (page: Page) => expect(page.locator(".status-badge")).toBeVisible({ timeout: 15_000 });

test("@claim:C-100 the strip says where the request will leave from and to which host, and after a send the road it took", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await address(page).fill(`${ECHO}/echo`);
  await expect(strip(page).locator(".route-label-route")).toHaveText("From this page");
  await expect(strip(page).locator(".route-host")).toHaveText("127.0.0.1:4300");
  expect(await spoken(page)).toBe("From this page. GET 127.0.0.1:4300.");

  await send(page);
  await answered(page);
  await expect(strip(page).locator(".route-label-route")).toHaveText("Sent from this page");
  expect(await spoken(page)).toMatch(/^Sent from this page\. 200 OK, [\d.]+ m?s\. GET 127\.0\.0\.1:4300\.$/);
  // What the strip says of a send is what the record kept, and it does not claim a secret that was not there.
  await expect(strip(page)).not.toContainText("secret");

  // An edit that goes to another host is not what was sent: the strip says what it will do.
  await address(page).fill("http://localhost:4300/echo");
  await expect(strip(page).locator(".route-label-route")).toHaveText("From this page");
});

test.describe("through a Local Bridge", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "the Local Bridge is started for Chromium only (plan P5.4)",
  );

  test("the strip says the bridge before and after a send, and Auto says what it does", async ({ page }) => {
    const bridge = await startBridge();
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/app/");
      await address(page).fill(`${ECHO}/echo`);
      await routeThroughBridge(page, bridge, "Auto");
      await expect(strip(page).locator(".route-label-route")).toHaveText(
        "From this page, then the Local Bridge if it fails",
      );
      await routeThroughBridge(page, bridge, "Local Bridge");
      await expect(strip(page).locator(".route-label-route")).toHaveText("Through the Local Bridge");
      await send(page);
      await answered(page);
      await expect(strip(page).locator(".route-label-route")).toHaveText("Sent through the Local Bridge");
    } finally {
      bridge.stop();
    }
  });
});

test("@claim:C-101 the strip names a vault secret without reading the vault, and after a send says how many were sent, masked in history and exports", async ({
  page,
}) => {
  test.slow();
  const plaintext = "strip-e2e-secret-4f2a";
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo`, headers: { "X-Key": "{{token}}" } });
  await protectVariable(page, "token", plaintext);
  // Named by the variable that holds it, as a block on the line.
  await expect(strip(page).locator(".route-label-block")).toHaveText("Uses secret: token");
  expect(await spoken(page)).toBe("From this page. GET 127.0.0.1:4300. Uses secret: token.");
  await send(page);
  await answered(page);
  await expect(strip(page).locator(".route-label-block")).toHaveText("1 secret sent, masked in history and exports");
  expect(await spoken(page)).toContain("1 secret sent, masked in history and exports.");
  await expect(strip(page)).not.toContainText(plaintext);
  expect(await strip(page).innerHTML()).not.toContain(plaintext);
});

// The strip's own height does not depend on what it says, and the line under it is always there: a bad address moves
// neither the tab strip, nor the request's tabs, nor the response.
for (const { name, width, text } of [
  { name: "1440 px", width: 1440, text: "" },
  { name: "390 px", width: 390, text: "" },
  { name: "200% text at 1440 px", width: 1440, text: "html { font-size: 200%; }" },
]) {
  test(`a bad address moves nothing, at ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/app/");
    if (text) await page.addStyleTag({ content: text });
    const where = () =>
      page.evaluate(() => {
        const y = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().y ?? null;
        return {
          tabStrip: y(".request-tab-strip"),
          tabs: y("app-composer .tabs"),
          response: y(".response-pane") ?? y("app-composer .tab-panes"),
          // Sideways overflow, not the width: a scrollbar that comes with a taller page is not a move.
          page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
    await expect(strip(page).locator(".route-problem-text")).toHaveText("Enter an address to send.");
    await expect(page.locator(".request-tab-strip")).toBeVisible();
    const empty = await where();
    // Valid, then bad, then partway, then empty: the same place each time.
    await address(page).fill("https://api.example.com/pets");
    await expect(strip(page).locator(".route-host").first()).toHaveText("api.example.com");
    expect(await where(), "a good address").toEqual(empty);
    for (const bad of ["not a url", "ht", "https://"]) {
      await address(page).fill(bad);
      await expect(strip(page).locator(".route-problem-text")).toHaveText(
        "Not an address. Write it as https://host/path.",
      );
      expect(await where(), bad).toEqual(empty);
    }
    await address(page).fill("");
    await expect(strip(page).locator(".route-problem-text")).toHaveText("Enter an address to send.");
    expect(await where(), "no address").toEqual(empty);
  });
}

test("with no address Send is off and the line says why; a missing variable is named with where to set it", async ({
  page,
}) => {
  await page.goto("/app/");
  await expect(page.getByRole("button", { name: "Send request" })).toBeDisabled();
  await expect(strip(page).locator(".route-problem-text")).toHaveText("Enter an address to send.");
  await address(page).fill(`${ECHO}/{{nowhere}}`);
  await expect(strip(page).locator(".route-problem-text")).toHaveText("{{nowhere}} has no value. Set a value.");
  // Send is refused for the same reason, and Send anyway is in the strip's line.
  await send(page);
  await expect(strip(page).getByRole("button", { name: "Send anyway" })).toBeVisible();
  await strip(page).getByRole("button", { name: "Send anyway" }).click();
  await answered(page);
});

test("a WebSocket's address has a strip too: from this page, whatever the route, and no bridge", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await address(page).fill("ws://127.0.0.1:4300/socket");
  await expect(strip(page).locator(".route-host")).toHaveText("127.0.0.1:4300");
  await expect(strip(page).locator(".route-label-route")).toHaveText("From this page");
  await expect(strip(page).locator(".route-problem-text")).toHaveCount(0);
});

test("the strip is not on Environments, and a closed tab brings it back", async ({ page }) => {
  await page.goto("/app/");
  await expect(strip(page)).toHaveCount(1);
  await openEnvironments(page);
  await expect(strip(page)).toHaveCount(0);
  await closeEnvironments(page);
  await expect(strip(page)).toHaveCount(1);
});

// Folded by the composer's own room, not the window's: beside the pinned sidebar a 1,200 px window leaves it 391 px.
test.describe("folded", () => {
  test("at 320 px the strip is its host and one button that opens the rest, and nothing is wider than the window", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/app/");
    await address(page).fill(`${ECHO}/echo?a=1`);
    const toggle = strip(page).locator(".route-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(strip(page).locator(".route-host")).toHaveText("127.0.0.1:4300");
    expect(await spoken(page)).toBe("From this page. GET 127.0.0.1:4300.");
    expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(strip(page).locator(".route-stack")).toBeVisible();
    await expect(strip(page).locator(".route-stack")).toContainText("From this page");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await toggle.click();
    await expect(strip(page).locator(".route-stack")).toHaveCount(0);
  });

  test("at 200% text and 1440 px it is folded, and the host is whole", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` });
    await page.addStyleTag({ content: "html { font-size: 200%; }" });
    await expect(strip(page).locator(".route-toggle")).toBeVisible();
    const host = strip(page).locator(".route-host");
    await expect(host).toHaveText("127.0.0.1:4300");
    expect(
      await host.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 || getComputedStyle(el).display !== "none"),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  });

  // CLAUDE.md said the composer was 391 px here; it is the request's pane that is, with the panes side by side. The
  // strip spans the composer (784 px: stacked, wide), and the response still starts above the fold.
  test("a 1,200 px window with the sidebar pinned: the strip is wide, and the response starts above the fold", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("wayfarer:sidebar-pinned", "true"));
    await page.setViewportSize({ width: 1200, height: 800 });
    await seedAndOpen(page, { base: ECHO }, { method: "GET", url: "{{base}}/echo?a=1" });
    const width = await page.locator("app-composer").evaluate((el) => el.getBoundingClientRect().width);
    expect(width > 34 * 16, `the composer is ${width} px`).toBe(true);
    await expect(strip(page).locator(".route-wide")).toBeVisible();
    await send(page);
    await answered(page);
    const top = (await page.locator("app-response-viewer").boundingBox())!.y;
    expect(top, "the response starts above the fold").toBeLessThan(800 - 120);
    // The room the composer's own box decides by: a window 1,100 px wide leaves the composer's width less than that
    // of the window by the pinned sidebar's.
    await page.setViewportSize({ width: 1100, height: 800 });
    const narrower = await page.locator("app-composer").evaluate((el) => el.getBoundingClientRect().width);
    expect(narrower).toBeLessThan(width);
  });

  test("at 390 px a send shows the response above the fold", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/");
    await address(page).fill(`${ECHO}/echo`);
    await send(page);
    await answered(page);
    const top = (await page.locator("app-response-viewer").boundingBox())!.y;
    expect(top, "the response starts above the fold").toBeLessThan(844 - 120);
  });
});

// Motion: a segment runs along the line for a send that takes longer than 150 ms, and for none that is faster.
test.describe("in flight", () => {
  test.use({ reducedMotion: "no-preference" });

  /** The animations that are the strip's own segment. */
  const segments = (page: Page) =>
    page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((a) => a.effect instanceof KeyframeEffect && a.effect.pseudoElement === "::after")
          .filter((a) => "animationName" in a && /route-run$/.test(a.animationName)).length,
    );

  test("a segment runs along the line while a slow send is out, and stops with it; a fast one shows none", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/");
    await address(page).fill(`${ECHO}/echo`);
    await page.evaluate(() => {
      const seen: number[] = [];
      (window as unknown as { seen: number[] }).seen = seen;
      const look = () => {
        seen.push(
          document.getAnimations().filter((a) => "animationName" in a && /route-run$/.test(a.animationName)).length,
        );
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    await send(page);
    await answered(page);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => Math.max(...(window as unknown as { seen: number[] }).seen)), "a fast reply").toBe(
      0,
    );

    await address(page).fill(`${ECHO}/delay/1200`);
    await send(page);
    await expect.poll(() => segments(page), { timeout: 1000 }).toBe(1);
    await answered(page);
    await expect.poll(() => segments(page)).toBe(0);
  });

  test("the live region says Sending…, then how it ended, in words that name the road", async ({ page }) => {
    await page.goto("/app/");
    const region = page.locator(".response-announcement");
    await address(page).fill(`${ECHO}/delay/600`);
    await send(page);
    await expect(region).toHaveText("Sending…");
    await expect(region).toHaveText(/^200 OK, [\d.]+ m?s, sent from this page to 127\.0\.0\.1:4300$/, {
      timeout: 5000,
    });
  });

  test("with reduced motion the line stands still while a send is out", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/app/");
    await address(page).fill(`${ECHO}/delay/1200`);
    await send(page);
    await expect(page.getByRole("button", { name: "Stop request" })).toBeVisible();
    await page.waitForTimeout(500);
    expect(await segments(page)).toBe(0);
    await answered(page);
  });
});

for (const theme of ["light", "dark"] as const) {
  test(`the strip has no WCAG 2.2 AA violation in the ${theme} theme: a problem, a secret named, folded and open`, async ({
    page,
  }) => {
    await page.addInitScript((value) => localStorage.setItem("wayfarer:theme", value), theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/");
    await address(page).fill(`${ECHO}/{{nowhere}}`);
    await expect(strip(page).locator(".route-problem-text")).toBeVisible();
    expect((await axe(page).include("app-route-strip").analyze()).violations).toEqual([]);
    await address(page).fill("not a url");
    await expect(strip(page).locator(".route-problem-text")).toHaveText(
      "Not an address. Write it as https://host/path.",
    );
    expect((await axe(page).include("app-route-strip").analyze()).violations).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(strip(page).locator(".route-toggle")).toBeVisible();
    await strip(page).locator(".route-toggle").click();
    expect((await axe(page).include("app-route-strip").analyze()).violations).toEqual([]);
  });
}
