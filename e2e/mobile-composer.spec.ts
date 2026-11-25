import { expect, test, type Page } from "@playwright/test";
import { send } from "./support/app";
import { ECHO } from "./support/echo";

// Overhaul S5b: the composer on a phone (390 px) and a tablet (820 px). The request and the response are two panes under
// the address; what a person needs first is in the pane they are looking at.

const address = (page: Page) => page.locator("input.address-url");
const LONG = "api-gateway-staging.internal.example-corp.com";

test.describe("on a phone", () => {
  test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });

  test("@claim:C-115 an empty tab offers the example in the request, and after a send every response tab is inside the window and the strip's button is one line", async ({
    page,
  }) => {
    await page.route(`https://${LONG}/**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: '{"a":1}',
      }),
    );
    await page.goto("/app/");
    // The pane it opens on holds the first step: not under the Response tab.
    const example = page.getByRole("button", { name: "Try an example" });
    await expect(example).toBeVisible();
    await expect(page.getByRole("button", { name: "Paste a cURL command" })).toBeVisible();
    expect((await example.boundingBox())!.y).toBeLessThan(500);
    // With an address the offer goes: the request is not empty.
    await address(page).fill(`https://${LONG}/v1/pets?limit=10`);
    await expect(example).toHaveCount(0);

    await send(page);
    await expect(page.locator(".status-badge")).toBeVisible({ timeout: 15_000 });
    // The summary is one line however long the host: the host takes its own width, the button goes beside or under it.
    const toggle = page.locator("app-route-strip .route-toggle");
    const lineHeight = await toggle.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    expect((await toggle.boundingBox())!.height).toBeLessThan(lineHeight * 2);
    // Each response tab is whole inside the window, and the bar did not need to scroll.
    for (const name of ["Body", "Headers", "Timings", "Sent", "Tests"]) {
      const box = (await page.locator("app-response-viewer").getByRole("tab", { name }).boundingBox())!;
      expect(box.x, name).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, name).toBeLessThanOrEqual(390);
      expect(box.height, `${name} is a target of 24 px or more`).toBeGreaterThanOrEqual(24);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test("a cURL command typed on a phone is offered in one row beside its button, and moves nothing", async ({
    page,
  }) => {
    await page.goto("/app/");
    await address(page).fill(`${ECHO}/echo`);
    const where = () =>
      page
        .locator("app-composer .tabs")
        .first()
        .evaluate((el) => el.getBoundingClientRect().y);
    const before = await where();
    await address(page).fill("curl https://api.example.com/x");
    const problem = page.locator("app-route-strip .route-problem");
    await expect(problem.getByRole("button", { name: "Import as request" })).toBeVisible();
    const row = (await problem.boundingBox())!.height;
    expect(row, "the offer is one row").toBeLessThan(36);
    expect(await where(), "the request's tabs did not move").toBe(before);
  });
});

test.describe("on a tablet", () => {
  test.use({ serviceWorkers: "block", viewport: { width: 820, height: 1180 } });

  test("@claim:C-116 the response under the request starts in the upper 60% of an 820 px tablet's window, and the request pane is not mostly empty", async ({
    page,
  }) => {
    await page.goto("/app/");
    await address(page).fill(`${ECHO}/content/json`);
    await send(page);
    await expect(page.locator(".status-badge")).toBeVisible({ timeout: 15_000 });
    const top = (await page.locator(".response-pane").boundingBox())!.y;
    expect(top, "the response starts above 60% of the window").toBeLessThan(1180 * 0.6);
    const body = page.locator("app-response-viewer .tab-panes").first();
    expect((await body.boundingBox())!.y, "the response's body is on screen").toBeLessThan(1180 - 200);
  });
});
