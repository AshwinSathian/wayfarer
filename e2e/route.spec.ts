import { randomUUID } from "node:crypto";
import { axe } from "./support/axe";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { openRequestSettings, openSettings, seedAndOpen, send } from "./support/app";
import { routeThroughBridge, startBridge } from "./support/bridge";
import { ECHO } from "./support/echo";
import { settled } from "./support/settled";

// P6.4, D7: the route `auto` sends from the page, and through the Local Bridge when the browser got no answer,
// never sending again on its own a request the server may have received. /cors/none answers without any CORS header.

/** How often each method reached `path` on the echo server. */
async function seen(page: Page, path: string): Promise<Record<string, number>> {
  return (await (await page.request.get(`${ECHO}/cors-seen?url=${encodeURIComponent(path)}`)).json()) as Record<
    string,
    number
  >;
}

test.describe("through a Local Bridge", () => {
  // The bridge is a Node process: what it does is the same from any browser.
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "the Local Bridge is started for Chromium only (plan P5.4)",
  );

  test("@claim:C-064 a JSON POST the browser stopped at its preflight is sent through the bridge at once, and reaches the server once", async ({
    page,
  }) => {
    const path = `/cors/none?id=${randomUUID()}`;
    const bridge = await startBridge();
    try {
      await seedAndOpen(
        page,
        {},
        {
          method: "POST",
          url: `${ECHO}${path}`,
          headers: { "Content-Type": "application/json" },
          body: { order: 1 },
        },
      );
      await routeThroughBridge(page, bridge, "Auto");

      await send(page);

      await expect(page.locator(".status-badge")).toHaveText("200", {
        timeout: 15_000,
      });
      await expect(page.locator(".record-toggle")).toHaveText("Local Bridge to 127.0.0.1:4300");
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      // The browser's preflight got no answer it could use, so it sent no POST: the one that arrived is the bridge's.
      expect(await seen(page, path)).toEqual({ OPTIONS: 1, POST: 1 });
    } finally {
      bridge.stop();
    }
  });

  test("@claim:C-064 a simple form POST the browser may have sent asks first: no sends nothing more, yes sends it through the bridge", async ({
    page,
  }) => {
    const path = `/cors/none?id=${randomUUID()}`;
    const bridge = await startBridge();
    try {
      await seedAndOpen(
        page,
        {},
        {
          method: "POST",
          url: `${ECHO}${path}`,
          storedBody: {
            mode: "urlencoded",
            urlencoded: [{ key: "order", value: "1", enabled: true }],
          },
        },
      );
      await routeThroughBridge(page, bridge, "Auto");

      await send(page);
      const question = page.getByRole("alertdialog", {
        name: "Send through the Local Bridge?",
      });
      await expect(question).toBeVisible({ timeout: 15_000 });
      await expect(question).toContainText("may have sent it");
      // No preflight for a form: the browser sent the POST, and the server received it.
      expect(await seen(page, path)).toEqual({ POST: 1 });
      await question.getByRole("button", { name: "Don't send" }).click();
      await expect(page.locator("app-response-viewer")).toContainText("The request got no response.");
      // The answer was no: the request went from the page alone.
      await expect(page.locator(".record-toggle")).toHaveText("Direct to 127.0.0.1:4300");
      expect(await seen(page, path)).toEqual({ POST: 1 });

      await send(page);
      await question.getByRole("button", { name: "Send through the bridge" }).click();
      await expect(page.locator(".status-badge")).toHaveText("200", {
        timeout: 15_000,
      });
      await expect(page.locator(".record-toggle")).toHaveText("Local Bridge to 127.0.0.1:4300");
      expect(await seen(page, path)).toEqual({ POST: 3 });
    } finally {
      bridge.stop();
    }
  });
});

test("a response from the page says Direct", async ({ page }) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/echo`);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await expect(page.locator(".record-toggle")).toHaveText("Direct to 127.0.0.1:4300");
});

for (const theme of ["light", "dark"] as const) {
  test(`the three places a route is chosen and the badge have no critical or serious violation in the ${theme} theme, and fit the window at four widths`, async ({
    page,
  }) => {
    test.slow();
    await page.addInitScript((value) => localStorage.setItem("wayfarer:theme", value), theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` });
    await send(page);
    await expect(page.locator(".record-toggle")).toHaveText("Direct to 127.0.0.1:4300");
    const scan = async (state: string) => {
      await page.mouse.move(640, 880);
      await settled(page);
      const results = await axe(page).analyze();
      expect(
        results.violations.flatMap((v) => v.nodes.map((node) => `${state}: ${v.id}: ${node.target.join(" ")}`)),
      ).toEqual([]);
    };
    // On a phone the request and the response are two panes (U-028): `pane` is the one a locator is in.
    const fits = async (where: string, ...shown: { locator: Locator; pane?: "Request" | "Response" }[]) => {
      for (const width of [360, 390, 820, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect
          .poll(
            () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
            { message: `${where} at ${width} px` },
          )
          .toBeLessThanOrEqual(0);
        for (const { locator, pane } of shown) {
          if (pane && width < 768) await page.getByRole("tab", { name: pane, exact: true }).click();
          // Crossing 768 px draws the composer's other layout: the element may be made again under the call.
          await expect(async () => locator.scrollIntoViewIfNeeded({ timeout: 2_000 })).toPass();
          await expect
            .poll(
              async () => {
                const box = await locator.boundingBox();
                return !!box && box.x >= 0 && box.x + box.width <= width;
              },
              { message: `${where} at ${width} px` },
            )
            .toBe(true);
        }
        await scan(`${where} at ${width} px`);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    };

    await openRequestSettings(page);
    await fits(
      "the composer",
      { locator: page.getByRole("combobox", { name: "Route" }), pane: "Request" },
      { locator: page.locator(".record-toggle"), pane: "Response" },
    );

    const settings = await openSettings(page, "Local Bridge");
    await fits("Settings, Local Bridge", { locator: settings.getByRole("radiogroup", { name: "Route" }) });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Opened again at each width: the dialog belongs to the sidebar, which becomes a drawer below 1200 px and closes it.
    for (const width of [360, 390, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (width < 1200) await page.getByRole("button", { name: "Toggle sidebar" }).click();
      await page.getByRole("tree").getByText("Tripwire collection", { exact: true }).click({ button: "right" });
      await page.getByRole("menuitem", { name: "Settings" }).click();
      const collection = page.getByRole("dialog", { name: /^Collection settings/ });
      await collection.getByRole("tab", { name: "Route" }).click();
      const choice = collection.getByRole("combobox", { name: /How the requests of this collection are sent/ });
      await expect(choice).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), {
          message: `the collection's settings at ${width} px`,
        })
        .toBeLessThanOrEqual(0);
      await expect
        .poll(
          async () => {
            const box = await choice.boundingBox();
            return !!box && box.x >= 0 && box.x + box.width <= width;
          },
          { message: `the collection's route at ${width} px` },
        )
        .toBe(true);
      await scan(`the collection's settings at ${width} px`);
      await page.keyboard.press("Escape");
      await expect(collection).toHaveCount(0);
      if (width < 1200) {
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(0);
      }
    }
  });
}
