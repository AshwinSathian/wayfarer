import { test, expect, type Locator, type Page } from "@playwright/test";
import { axe } from "./support/axe";
import { ECHO } from "./support/echo";
import { settled } from "./support/settled";

// P5.6: a response that is an event stream is listed event by event as it arrives.

const address = (page: Page): Locator => page.locator("input.address-url");
const viewer = (page: Page): Locator => page.locator("app-response-viewer");
const eventRows = (page: Page): Locator => viewer(page).getByRole("region", { name: "Events" }).locator("tbody tr");
const cells = (page: Page) =>
  eventRows(page).evaluateAll((rows) =>
    rows.map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() ?? "")),
  );

test("the five events of a stream are listed with their id, event, data and time", async ({ page }) => {
  await page.goto("/app/");
  // 200 ms apart, 800 ms from first to last: at 100 ms, CI's Firefox handed over the five within 282 ms (e2e/FLAKES.md).
  await address(page).fill(`${ECHO}/sse?count=5&interval=200`);
  await page.getByRole("button", { name: "Send request" }).click();

  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  await expect(viewer(page).getByRole("tab", { name: "Events" })).toHaveAttribute("aria-selected", "true");
  await expect(eventRows(page)).toHaveCount(5);
  const rows = await cells(page);
  expect(rows.map(([id, event, data]) => [id, event, data])).toEqual(
    [1, 2, 3, 4, 5].map((n) => [String(n), "tick", `{"n":${n}}`]),
  );
  // Each arrived after the one before it: the times are the stream's, not the end of the response's.
  const times = rows.map(([, , , time]) => Number(/^\+(\d+) ms$/.exec(time)?.[1]));
  expect(times.every((time) => Number.isFinite(time))).toBe(true);
  expect([...times].sort((a, b) => a - b)).toEqual(times);
  expect(times[4] - times[0]).toBeGreaterThanOrEqual(300);
  await expect(viewer(page).getByRole("status")).toContainText("5 events.");
  // The whole stream is the response's body too.
  await viewer(page).getByRole("tab", { name: "Body" }).click();
  await expect(viewer(page)).toContainText("event: tick");
});

test("an open stream shows its events as they come, is stopped with Stop, and Reconnect goes on from the last id", async ({
  page,
}) => {
  await page.goto("/app/");
  await address(page).fill(`${ECHO}/sse?count=1000&interval=200`);
  await page.getByRole("button", { name: "Send request" }).click();

  // While it is open: no status yet, and a list that grows.
  await expect(eventRows(page).first()).toBeVisible({ timeout: 15_000 });
  await expect(viewer(page).getByRole("status")).toContainText("The stream is open");
  await expect(page.locator(".status-badge")).toHaveCount(0);
  await expect.poll(() => eventRows(page).count()).toBeGreaterThanOrEqual(3);

  await viewer(page).getByRole("button", { name: "Stop" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200");
  await expect(viewer(page).getByRole("status")).toContainText("You stopped the stream.");
  const stopped = await cells(page);
  const last = Number(stopped[stopped.length - 1][0]);
  expect(last).toBeGreaterThanOrEqual(3);

  // Reconnect: the server is told the last id, and goes on after it.
  const reconnect = page.waitForRequest((request) => request.url().includes("/sse") && request.method() === "GET");
  await viewer(page).getByRole("button", { name: "Reconnect" }).click();
  expect((await reconnect).headers()["last-event-id"]).toBe(String(last));
  await expect(eventRows(page).first()).toBeVisible();
  await expect.poll(async () => (await cells(page))[0]?.[0]).toBe(String(last + 1));
  await page.getByRole("button", { name: "Cancel request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200");
});

test("a stream goes on in its tab while another tab is open", async ({ page }) => {
  await page.goto("/app/");
  await address(page).fill(`${ECHO}/sse?count=6&interval=300`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(eventRows(page).first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "New tab" }).click();
  await expect(viewer(page)).toHaveCount(0);
  await address(page).fill(`${ECHO}/status/204`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".status-badge")).toHaveText("204", { timeout: 15_000 });

  await page.getByRole("tablist", { name: "Open requests" }).getByRole("tab").nth(0).click();
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  await expect(eventRows(page)).toHaveCount(6);
});

for (const theme of ["dark", "light"] as const) {
  test(`the list of events has no critical or serious violation in the ${theme} theme, open and ended, and is not wider than the window at four widths`, async ({
    page,
  }) => {
    test.slow();
    await page.addInitScript((value) => localStorage.setItem("wayfarer:theme", value), theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/");
    const scan = async (state: string) => {
      await page.mouse.move(640, 880);
      // Once the page has stopped animating: a colour half way through a fade is not the colour.
      await settled(page);
      const results = await axe(page).analyze();
      expect(
        results.violations.flatMap((v) => v.nodes.map((node) => `${state}: ${v.id}: ${node.target.join(" ")}`)),
      ).toEqual([]);
    };
    await address(page).fill(`${ECHO}/sse?count=1000&interval=200`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(eventRows(page).first()).toBeVisible({ timeout: 15_000 });
    await scan("open");
    await viewer(page).getByRole("button", { name: "Stop" }).click();
    await expect(viewer(page).getByRole("button", { name: "Reconnect" })).toBeVisible();
    await scan("ended");

    for (const width of [360, 390, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(viewer(page).getByRole("button", { name: "Reconnect" })).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), {
          message: `at ${width} px`,
        })
        .toBeLessThanOrEqual(0);
      // Polled, like the width: the drawer's change of layout takes a moment.
      await expect
        .poll(
          async () => {
            const box = await viewer(page).getByRole("button", { name: "Reconnect" }).boundingBox();
            return !!box && box.x >= 0 && box.x + box.width <= width;
          },
          { message: `Reconnect at ${width} px` },
        )
        .toBe(true);
    }
  });
}
