import { expect, test, type Locator, type Page } from "@playwright/test";
import { axe } from "./support/axe";
import { dumpIdb, openSettings, protectVariable, seedAndOpen, send } from "./support/app";
import { routeThroughBridge, startBridge } from "./support/bridge";
import { ECHO } from "./support/echo";
import { settled } from "./support/settled";

// P5.3: the app's cookie jar, for requests that leave through the Local Bridge.
// The bridge is a Node process: what it does is the same from any browser. Phase 6 runs it in three.
test.skip(({ browserName }) => browserName !== "chromium", "the Local Bridge is started for Chromium only (plan P5.3)");

const address = (page: Page): Locator => page.locator("input.address-url");
const viewer = (page: Page): Locator => page.locator("app-response-viewer");
/** The response body as one line: the echo server's answer says what it received. */
const body = async (page: Page) => (await viewer(page).innerText()).replace(/\s+/g, "");
const sendTo = async (page: Page, url: string) => {
  await address(page).fill(url);
  await send(page);
};
const closeSettings = async (page: Page, settings: Locator) => {
  await page.keyboard.press("Escape");
  await expect(settings).toHaveCount(0);
};

test("/cookies/set, then /echo: the Cookie header is sent; deleted in Settings, the next request carries none", async ({ page }) => {
  const bridge = await startBridge();
  try {
    await page.goto("/");
    await routeThroughBridge(page, bridge);

    await sendTo(page, `${ECHO}/cookies/set?session=abc123&theme=dark`);
    await expect(page.locator(".status-badge").first()).toHaveText("200");
    await sendTo(page, `${ECHO}/echo?n=1`);
    await expect.poll(() => body(page)).toContain('["cookie","session=abc123;theme=dark"]');

    // The jar, in Settings: both cookies, with where they belong.
    const settings = await openSettings(page, "Cookies");
    const jar = settings.getByRole("list", { name: "Cookies" });
    await expect(jar.getByRole("listitem")).toHaveCount(2);
    await expect(jar.getByRole("listitem").first()).toContainText("127.0.0.1/");
    await expect(jar.getByRole("listitem").first()).toContainText("this host only");
    await expect(jar.getByRole("textbox", { name: "session" })).toHaveValue("abc123");
    await expect(settings.locator(".cookies-route")).toContainText("The Local Bridge is the route");

    // An edited value is what goes out.
    await jar.getByRole("textbox", { name: "theme" }).fill("light");
    await jar.getByRole("textbox", { name: "theme" }).press("Tab");
    await closeSettings(page, settings);
    await sendTo(page, `${ECHO}/echo?n=2`);
    await expect.poll(() => body(page)).toContain('["cookie","session=abc123;theme=light"]');

    // Deleted, it is gone from the next request and from the store.
    const again = await openSettings(page, "Cookies");
    await again.getByRole("button", { name: "Delete cookie session of 127.0.0.1" }).click();
    await expect(again.getByRole("list", { name: "Cookies" }).getByRole("listitem")).toHaveCount(1);
    await closeSettings(page, again);
    await sendTo(page, `${ECHO}/echo?n=3`);
    await expect.poll(() => body(page)).toContain('["cookie","theme=light"]');
    expect(await body(page)).not.toContain("abc123");
    expect(((await dumpIdb(page))["cookies"] as { name: string }[]).map((cookie) => cookie.name)).toEqual(["theme"]);

    // History has the header and not its value, and the value is masked where the server sent it back.
    // (The first entry holds "abc123" as typed: it was in that request's address.)
    const echoes = JSON.stringify(((await dumpIdb(page))["history"] as { sent: { url: string } }[]).filter((entry) => entry.sent.url.includes("/echo")));
    expect(echoes).toContain('["Cookie","***"]');
    expect(echoes).toContain("session=***");
    expect(echoes).not.toContain("abc123");
  } finally {
    bridge.stop();
  }
});

test("a sign-in that answers with a redirect: the cookie it sets goes out with the next hop, and the jar is kept over a reload", async ({ page }) => {
  const bridge = await startBridge();
  try {
    await page.goto("/");
    await routeThroughBridge(page, bridge);
    await sendTo(page, `${ECHO}/cookies/login`);
    await expect(page.locator(".status-badge").first()).toHaveText("200");
    // Two Set-Cookie headers, one with a comma in its value: joined into one line they could not be told apart.
    await expect.poll(() => body(page)).toContain('["cookie","session=signed-in;seen=Wed,14Oct"]');
    await expect(viewer(page).getByRole("region", { name: "Redirects" })).toContainText("Followed 1 redirect through the Local Bridge:");

    await expect.poll(async () => ((await dumpIdb(page))["cookies"] ?? []).length).toBe(2);
    await page.reload();
    const settings = await openSettings(page, "Cookies");
    await expect(settings.getByRole("list", { name: "Cookies" }).getByRole("listitem")).toHaveCount(2);
    await expect(settings.getByRole("list", { name: "Cookies" })).toContainText("HttpOnly");

    await settings.getByRole("button", { name: "Delete all…" }).click();
    await page.getByRole("alertdialog", { name: "Delete all cookies?" }).getByRole("button", { name: "Delete all", exact: true }).click();
    await expect(settings.locator(".cookies-empty")).toHaveText("The jar is empty.");
    expect((await dumpIdb(page))["cookies"]).toEqual([]);
  } finally {
    bridge.stop();
  }
});

test("a cookie whose value is a vault secret of the request is sent on and is not stored", async ({ page }) => {
  test.slow();
  const SECRET = "cookie-vault-secret-7a40d9";
  const bridge = await startBridge();
  try {
    await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/cookies/set?token={{API_TOKEN}}&plain=1` });
    await protectVariable(page, "API_TOKEN", SECRET);
    await routeThroughBridge(page, bridge);
    await send(page);
    await expect(page.locator(".status-badge").first()).toHaveText("200");

    await sendTo(page, `${ECHO}/echo`);
    await expect.poll(() => body(page)).toContain(`["cookie","token=${SECRET};plain=1"]`);

    const stores = await dumpIdb(page);
    expect((stores["cookies"] as { name: string }[]).map((cookie) => cookie.name)).toEqual(["plain"]);
    // Nowhere in what the app stored, the jar included, is the secret's plaintext.
    expect(JSON.stringify(stores)).not.toContain(SECRET);

    const settings = await openSettings(page, "Cookies");
    await expect(settings.locator(".cookie-unstored")).toHaveText("Not stored: its value holds a vault secret, so it is in this tab's memory only.");
  } finally {
    bridge.stop();
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`the Cookies pane has no critical or serious violation in the ${theme} theme, empty and with cookies, and is not wider than the window at four widths`, async ({ page }) => {
    test.slow();
    const bridge = await startBridge();
    try {
      await page.addInitScript((value) => localStorage.setItem("wayfarer:theme", value), theme);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/");
      const scan = async (state: string) => {
        await page.mouse.move(640, 880);
        // Once the page has stopped animating: a colour half way through a fade is not the colour.
        await settled(page);
        const results = await axe(page).analyze();
        expect(results.violations.flatMap((v) => v.nodes.map((node) => `${state}: ${v.id}: ${node.target.join(" ")}`))).toEqual([]);
      };
      const empty = await openSettings(page, "Cookies");
      await expect(empty.locator(".cookies-empty")).toBeVisible();
      await expect(empty.locator(".cookies-route")).toContainText("with the route Auto, those the browser got no answer to");
      await scan("empty, bridge off");
      await closeSettings(page, empty);

      await routeThroughBridge(page, bridge);
      await sendTo(page, `${ECHO}/cookies/set?session=${"a-long-value-".repeat(12)}&theme=dark`);
      await expect(page.locator(".status-badge").first()).toHaveText("200");
      const settings = await openSettings(page, "Cookies");
      const rows = settings.getByRole("list", { name: "Cookies" }).getByRole("listitem");
      await expect(rows).toHaveCount(2);
      await scan("with cookies");

      for (const width of [360, 390, 820, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        // Below 768 px the list of sections is the dialog: the pane is opened again from it.
        if (!(await rows.first().isVisible())) await settings.getByRole("button", { name: "Cookies" }).click();
        await expect(rows).toHaveCount(2);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: `at ${width} px` }).toBeLessThanOrEqual(0);
        // Polled, like the width: a change of layout takes a moment.
        await expect
          .poll(
            async () => {
              const boxes = await Promise.all([rows.first().boundingBox(), settings.getByRole("button", { name: "Delete all…" }).boundingBox(), settings.getByRole("textbox", { name: "session" }).boundingBox()]);
              return boxes.every((box) => !!box && box.x >= 0 && box.x + box.width <= width);
            },
            { message: `a cookie's row, its value and Delete all at ${width} px` }
          )
          .toBe(true);
      }
    } finally {
      bridge.stop();
    }
  });
}
