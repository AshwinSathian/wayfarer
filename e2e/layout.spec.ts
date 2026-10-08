import { test, expect } from "@playwright/test";
import { ECHO } from "./support/echo";
import { still } from "./support/settled";

test.describe("Resizable composer/response layout (desktop)", () => {
  test("shows a resizable split between the composer and the response viewer", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    // Before any response exists, the response pane shows its own empty state.
    await expect(page.getByText("Send a request to see the response here")).toBeVisible();

    await page.locator("input.address-url").fill(`${ECHO}/content/json?todo=1`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

    const splitter = page.locator(".composer-response-splitter");
    await expect(splitter).toBeVisible();
    await expect(splitter.getByRole("separator")).toBeVisible();
    await expect(page.locator("app-response-viewer")).toBeVisible();
  });

  test("@claim:C-031 persists the chosen split ratio across a reload", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.locator("input.address-url").fill(`${ECHO}/content/json?todo=1`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

    const gutter = page.locator(".composer-response-splitter").getByRole("separator");
    const composer = page.locator(".composer-pane");
    // The gutter moves while the panes settle; measure it once it is still.
    await still(gutter);
    const gutterBox = await gutter.boundingBox();
    expect(gutterBox).not.toBeNull();
    const widthBefore = (await composer.boundingBox())!.width;

    // Drag the gutter a meaningful distance to the right.
    await page.mouse.move(gutterBox!.x + gutterBox!.width / 2, gutterBox!.y + gutterBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(gutterBox!.x + 160, gutterBox!.y + gutterBox!.height / 2, { steps: 10 });
    await page.mouse.up();

    const widthAfter = (await composer.boundingBox())!.width;
    expect(widthAfter).toBeGreaterThan(widthBefore + 100);
    const stateKey = await page.evaluate(() => localStorage.getItem("wayfarer:composer-split"));
    expect(stateKey).not.toBeNull();

    await page.reload();
    const stateKeyAfterReload = await page.evaluate(() => localStorage.getItem("wayfarer:composer-split"));
    expect(stateKeyAfterReload).toBe(stateKey);
    // The stored ratio is applied, not only kept.
    await expect.poll(async () => Math.abs((await composer.boundingBox())!.width - widthAfter)).toBeLessThan(2);
  });

  test("opening an editor tab does not make the page wider than the window", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.locator("input.address-url").fill(`${ECHO}/content/json?wide=1`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
    await page.getByRole("tab", { name: "Scripts", exact: true }).first().click();
    await expect(page.getByText("Loading editor…")).toHaveCount(0);
    // The editor sizes itself to its container: a container that sizes itself to the editor grows without end.
    await page.waitForTimeout(1000);
    const splitter = page.locator(".composer-response-splitter");
    expect((await splitter.boundingBox())!.width).toBeLessThanOrEqual(1440);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  });

  // The composer ran 49 px past the window (no box-sizing reset), and below
  // 1024 px the toolbar was wider than the space beside the pinned sidebar.
  for (const width of [1440, 1024, 900, 768, 767, 640, 420, 360]) {
    test(`nothing is wider than a ${width} px window`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page.locator("input.address-url")).toBeVisible();
      await still(page.locator("app-api-params"));

      // Not wider; WebKit reports it narrower by the 5 px vertical scrollbar.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const send = await page.getByRole("button", { name: "Send request" }).boundingBox();
      expect(send!.x + send!.width).toBeLessThanOrEqual(width);
    });
  }

  test("opening the environment JSON editor does not make the page wider than the window", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "New environment" }).click();
    await page.getByPlaceholder("Environment name").fill("Wide");
    await page.getByRole("button", { name: "Create environment" }).click();
    await page.getByRole("tab", { name: "JSON", exact: true }).click();
    await expect(page.getByText("Loading editor…")).toHaveCount(0);
    await page.waitForTimeout(1000);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  });

  test("the split cannot be dragged past its minimum pane sizes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const splitter = page.locator(".composer-response-splitter");
    const gutter = splitter.getByRole("separator");
    const composer = page.locator(".composer-pane");
    const response = page.locator(".response-pane");
    await still(gutter);
    const total = (await splitter.boundingBox())!.width;

    const dragTo = async (x: number) => {
      const box = (await gutter.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(x, box.y + box.height / 2, { steps: 40 });
      await page.mouse.up();
    };

    await dragTo(0);
    expect((await composer.boundingBox())!.width).toBeGreaterThanOrEqual(total * 0.28 - 1);
    await dragTo(1439);
    expect((await response.boundingBox())!.width).toBeGreaterThanOrEqual(total * 0.22 - 1);
  });
});

test.describe("Mobile composer (390px)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("@claim:C-032 shows one composer section at a time via a single-open accordion, with real labels", async ({ page }) => {
    await page.goto("/");

    // Headers is open by default; the others are present as labeled,
    // collapsed headers — not stacked-and-unlabeled content (Part D bug).
    await expect(page.getByRole("button", { name: "Params", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Headers", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Auth", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Scripts", exact: true })).toBeVisible();

    // Opening Auth must collapse Headers — only one panel open at a time.
    await expect(page.getByLabel("Headers name, row 1")).toBeVisible();
    await page.getByRole("button", { name: "Auth", exact: true }).click();
    await expect(page.getByLabel("Headers name, row 1")).toBeHidden();
    await expect(page.locator("#auth-type-select")).toBeVisible();
  });

  test("@claim:C-040 Monaco initializes in the Scripts panel instead of getting stuck on the loading placeholder", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Scripts", exact: true }).click();

    // Neither script editor should be permanently stuck on the placeholder.
    await expect(page.getByText("Loading editor…")).toHaveCount(0, { timeout: 5_000 });
    await expect(page.locator(".monaco-editor").first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Disabled 'Copy as cURL' affordance", () => {
  test("is visibly disabled (not an empty box) and explains why via a tooltip", async ({ page }) => {
    await page.goto("/");

    const curlButton = page.getByRole("button", { name: "Copy as cURL" });
    const curlWrap = page.locator(".curl-btn-wrap");
    await expect(curlButton).toBeDisabled();
    await expect(curlWrap).toHaveCSS("cursor", "not-allowed");
    const opacity = await curlButton.evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeLessThan(1);

    await curlWrap.hover();
    await expect(page.getByRole("tooltip")).toHaveText(/enter a url first/i);

    // Once a URL is entered, it becomes enabled with the plain "Copy as cURL" tooltip.
    await page.locator("input.address-url").fill(`${ECHO}/content/json?todo=1`);
    await expect(curlButton).toBeEnabled();
  });
});

test.describe("Render stability under rapid tab/viewport transitions", () => {
  test("rapid response-tab switching and viewport resizing never leaves a JSON editor stuck loading", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      // The HTML spec reports this as an error event when a ResizeObserver
      // callback resizes an observed element; WebKit surfaces it to
      // Playwright, Chromium and Firefox don't. It is not an app error.
      if (!/^ResizeObserver loop/.test(err.message)) pageErrors.push(String(err));
    });

    await page.goto("/");
    await page.locator("input.address-url").fill(`${ECHO}/content/json?todo=1`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

    const responseViewer = page.locator("app-response-viewer");
    const tabs = ["Headers", "Timings", "Tests", "Body"];
    for (let i = 0; i < 4; i++) {
      for (const tab of tabs) {
        await responseViewer.getByRole("tab", { name: tab }).click({ force: true });
      }
    }

    const widths = [390, 1440, 500, 1200, 767, 769, 320, 1600];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
    }
    await page.setViewportSize({ width: 390, height: 900 });

    await expect(page.getByText("Loading editor…")).toHaveCount(0, { timeout: 5_000 });
    expect(pageErrors).toEqual([]);
  });
});

// F46: an overlay's backdrop must be gone once the overlay has closed. With
// the previous drawer library the backdrop stayed in the page and swallowed every later click.
test.describe("The app stays usable after an overlay closes", () => {
  test("after the history drawer closes, the toolbar can be clicked", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Request history" }).click();
    await page.getByRole("button", { name: "Close history" }).click();

    await page.getByRole("button", { name: "Settings", exact: true }).click({ timeout: 5_000 });
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  });

  test("after a dialog closes with Escape, the composer can be clicked", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeHidden();

    await page.getByRole("button", { name: "Request history" }).click({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "Close history" })).toBeVisible();
  });

  test("on a phone, after the navigation drawer closes, the composer can be clicked", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Toggle sidebar" }).first().click();
    await page.getByRole("button", { name: "Close navigation" }).click();

    await page.getByRole("button", { name: "Scripts", exact: true }).click({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "Add test" })).toBeVisible();
  });
});
