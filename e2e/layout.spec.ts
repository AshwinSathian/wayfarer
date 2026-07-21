import { test, expect } from "@playwright/test";

test.describe("Resizable composer/response layout (desktop)", () => {
  test("shows a resizable split between the composer and the response viewer", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    // Before any response exists, the response pane shows its own empty state.
    await expect(page.getByText("Send a request to see the response here")).toBeVisible();

    await page.locator("input.address-url").fill("https://jsonplaceholder.typicode.com/todos/1");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

    const splitter = page.locator(".composer-response-splitter.p-splitter");
    await expect(splitter).toBeVisible();
    await expect(splitter.locator(".p-splitter-gutter")).toBeVisible();
    await expect(page.locator("app-response-viewer")).toBeVisible();
  });

  test("persists the chosen split ratio across a reload", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.locator("input.address-url").fill("https://jsonplaceholder.typicode.com/todos/1");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

    const gutter = page.locator(".composer-response-splitter .p-splitter-gutter");
    const gutterBox = await gutter.boundingBox();
    expect(gutterBox).not.toBeNull();

    // Drag the gutter a meaningful distance to the right.
    await page.mouse.move(gutterBox!.x + gutterBox!.width / 2, gutterBox!.y + gutterBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(gutterBox!.x + 160, gutterBox!.y + gutterBox!.height / 2, { steps: 10 });
    await page.mouse.up();

    const stateKey = await page.evaluate(() => localStorage.getItem("wayfarer:composer-split"));
    expect(stateKey).not.toBeNull();

    await page.reload();
    const stateKeyAfterReload = await page.evaluate(() => localStorage.getItem("wayfarer:composer-split"));
    expect(stateKeyAfterReload).toBe(stateKey);
  });
});

test.describe("Mobile composer (390px)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows one composer section at a time via a single-open accordion, with real labels", async ({ page }) => {
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

  test("Monaco initializes in the Scripts panel instead of getting stuck on the loading placeholder", async ({ page }) => {
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
    await page.locator("input.address-url").fill("https://jsonplaceholder.typicode.com/todos/1");
    await expect(curlButton).toBeEnabled();
  });
});

test.describe("Render stability under rapid tab/viewport transitions", () => {
  test("rapid response-tab switching and viewport resizing never leaves a JSON editor stuck loading", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.goto("/");
    await page.locator("input.address-url").fill("https://jsonplaceholder.typicode.com/todos/1");
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
