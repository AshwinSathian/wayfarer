import { expect, test, type Locator, type Page } from "@playwright/test";
import { axe } from "./support/axe";
import { openRequestSettings, protectVariable, seedAndOpen, send } from "./support/app";
import { routeThroughBridge, startBridge } from "./support/bridge";
import { ECHO } from "./support/echo";
import { settled } from "./support/settled";

// P5.4: through the Local Bridge each hop of a redirect is a relay of its own, and the response lists them.
// The bridge is a Node process: what it does is the same from any browser. Phase 6 runs it in three.
test.skip(({ browserName }) => browserName !== "chromium", "the Local Bridge is started for Chromium only (plan P5.4)");

/** The echo server's second origin: another host to a request sent to the first. */
const OTHER = "http://127.0.0.1:4301";

const address = (page: Page): Locator => page.locator("input.address-url");
const viewer = (page: Page): Locator => page.locator("app-response-viewer");
const chain = (page: Page): Locator => viewer(page).getByRole("region", { name: "Redirects" });
const hops = (page: Page) =>
  chain(page)
    .locator(".redirect-hop")
    .evaluateAll((rows) => rows.map((row) => row.textContent?.replace(/\s+/g, " ").trim()));

test("/redirect/3 through the bridge lists three hops, and the response is where they ended", async ({ page }) => {
  const bridge = await startBridge();
  try {
    const direct: string[] = [];
    page.on("request", (request) => {
      if (request.url().startsWith(ECHO)) direct.push(request.url());
    });
    await page.goto("/app/");
    await routeThroughBridge(page, bridge);
    await openRequestSettings(page);
    await expect(page.locator(".follow-redirects")).toContainText("Through the Local Bridge each one is listed");
    await address(page).fill(`${ECHO}/redirect/3`);
    await send(page);

    await expect(page.locator(".status-badge").first()).toHaveText("200");
    expect(await hops(page)).toEqual([
      `302 ${ECHO}/redirect/3 to /redirect/2`,
      `302 ${ECHO}/redirect/2 to /redirect/1`,
      `302 ${ECHO}/redirect/1 to /echo`,
    ]);
    await expect(chain(page)).toContainText("Followed 3 redirects through the Local Bridge:");
    await expect(viewer(page).locator(".redirect-note")).toContainText(`Redirected to ${ECHO}/echo`);
    await expect(chain(page).locator(".redirect-stopped")).toHaveCount(0);
    expect(direct).toEqual([]);
  } finally {
    bridge.stop();
  }
});

test("with Follow redirects off the 302 is the response as it came, and the tab says why it went no further", async ({
  page,
}) => {
  const bridge = await startBridge();
  try {
    await page.goto("/app/");
    await routeThroughBridge(page, bridge);
    await address(page).fill(`${ECHO}/redirect/3`);
    await openRequestSettings(page);
    await page.getByRole("checkbox", { name: "Follow redirects" }).uncheck();
    await send(page);

    await expect(page.locator(".status-badge").first()).toHaveText("302");
    await expect(chain(page).locator(".redirect-stopped")).toHaveText(
      "Not followed: Follow redirects is off for this request.",
    );
    expect(await hops(page)).toEqual([]);
    await viewer(page).getByRole("tab", { name: "Headers" }).click();
    await expect(viewer(page)).toContainText("/redirect/2");
  } finally {
    bridge.stop();
  }
});

test("@claim:C-063 a request with a vault secret is not followed to another host: the redirect is the response", async ({
  page,
}) => {
  test.slow();
  const SECRET = "redirect-vault-secret-51f0c2";
  const away = `${ECHO}/redirect-to?status=307&url=${encodeURIComponent(`${OTHER}/echo?arrived=1`)}`;
  const bridge = await startBridge();
  try {
    await seedAndOpen(
      page,
      {},
      { method: "GET", url: `${ECHO}/redirect/1`, headers: { "X-Api-Key": "{{API_TOKEN}}" } },
    );
    await protectVariable(page, "API_TOKEN", SECRET);
    await routeThroughBridge(page, bridge);

    // On its own host the request is followed, secret and all: the redirect does not leave it.
    await send(page);
    await expect(page.locator(".status-badge").first()).toHaveText("200");
    expect(await hops(page)).toEqual([`302 ${ECHO}/redirect/1 to /echo`]);
    await expect
      .poll(async () => (await viewer(page).innerText()).replace(/\s+/g, ""))
      .toContain(`["x-api-key","${SECRET}"]`);

    // To another host it is not.
    await address(page).fill(away);
    await send(page);
    await expect(page.locator(".status-badge").first()).toHaveText("307");
    await expect(chain(page).locator(".redirect-stopped")).toContainText(
      "Not followed: this redirect leaves the host, and the request holds a vault secret",
    );
    expect(await hops(page)).toEqual([]);
    // What is shown is the first host's 307, not the other host's echo of a request (core's C-063 test counts the relays: one).
    await viewer(page).getByRole("tab", { name: "Headers" }).click();
    await expect(viewer(page)).toContainText(`${OTHER}/echo?arrived=1`);
    expect(await viewer(page).innerText()).not.toContain(SECRET);
  } finally {
    bridge.stop();
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`the list of redirects has no critical or serious violation in the ${theme} theme, followed and stopped, and is not wider than the window at four widths`, async ({
    page,
  }) => {
    test.slow();
    const bridge = await startBridge();
    try {
      await page.addInitScript((value) => localStorage.setItem("wayfarer:theme", value), theme);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/app/");
      await routeThroughBridge(page, bridge);
      const scan = async (state: string) => {
        await page.mouse.move(640, 880);
        // Once the page has stopped animating: a colour half way through a fade is not the colour.
        await settled(page);
        const results = await axe(page).analyze();
        expect(
          results.violations.flatMap((v) => v.nodes.map((node) => `${state}: ${v.id}: ${node.target.join(" ")}`)),
        ).toEqual([]);
      };
      await address(page).fill(`${ECHO}/redirect/3`);
      await openRequestSettings(page);
      await page.getByRole("checkbox", { name: "Follow redirects" }).uncheck();
      await send(page);
      await expect(chain(page).locator(".redirect-stopped")).toBeVisible();
      await scan("stopped");
      await page.getByRole("checkbox", { name: "Follow redirects" }).check();
      await send(page);
      await expect(chain(page).locator(".redirect-hop")).toHaveCount(3);
      await scan("followed");

      for (const width of [360, 390, 820, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(chain(page).locator(".redirect-hop")).toHaveCount(3);
        await expect
          .poll(
            () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
            { message: `at ${width} px` },
          )
          .toBeLessThanOrEqual(0);
        // Polled, like the width: the drawer's change of layout takes a moment. On a phone the request and the
        // response are two panes (U-028): each is looked at in its own.
        const inside = async (locator: Locator) => {
          const box = await locator.boundingBox();
          return !!box && box.x >= 0 && box.x + box.width <= width;
        };
        const phone = width < 768;
        await expect.poll(() => inside(chain(page)), { message: `the list at ${width} px` }).toBe(true);
        if (phone) await page.getByRole("tab", { name: "Request", exact: true }).click();
        const follow = page.getByRole("checkbox", { name: "Follow redirects" });
        await expect.poll(() => inside(follow), { message: `the checkbox at ${width} px` }).toBe(true);
        if (phone) await page.getByRole("tab", { name: "Response", exact: true }).click();
      }
    } finally {
      bridge.stop();
    }
  });
}
