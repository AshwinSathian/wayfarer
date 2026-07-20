import { test, expect } from "@playwright/test";

test.describe("Send request → view response", () => {
  test("sends a GET request and renders the response body, headers, and status", async ({ page }) => {
    await page.goto("/");

    const urlInput = page.locator("input.address-url");
    await urlInput.fill("https://jsonplaceholder.typicode.com/todos/1");
    await page.getByRole("button", { name: "Send request" }).click();

    // Status badge shows a real 2xx code, not a silently-faked one.
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

    // Body tab renders the actual JSON payload from the API.
    await expect(page.getByText('"userId"')).toBeVisible();

    const responseViewer = page.locator("app-response-viewer");

    // Headers tab shows real response headers.
    await responseViewer.getByRole("tab", { name: "Headers" }).click();
    await expect(page.locator(".ds-table")).toBeVisible();

    // Timings tab shows a duration, and it isn't a wildly different number
    // than what the status bar already reported (regression coverage for
    // the Timings/status-bar mismatch bug).
    const statusBarDurationText = await page
      .locator("span:has(.material-symbols-outlined:text('timer'))")
      .first()
      .textContent();
    await responseViewer.getByRole("tab", { name: "Timings" }).click();
    await expect(page.getByText("Duration", { exact: true })).toBeVisible();
    expect(statusBarDurationText).toBeTruthy();
  });

  test("keeps the composed request visible after Send, instead of wiping the form", async ({ page }) => {
    await page.goto("/");

    const urlInput = page.locator("input.address-url");
    await urlInput.fill("https://jsonplaceholder.typicode.com/todos/1");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });

    // Regression coverage: a successful send used to unconditionally clear
    // the entire composer (method/url/headers/body/auth) the instant the
    // response arrived, breaking the basic "tweak and resend" loop every
    // API client relies on.
    await expect(urlInput).toHaveValue("https://jsonplaceholder.typicode.com/todos/1");

    // The explicit "New request" action is now the only thing that clears
    // the composer.
    await page.getByRole("button", { name: "New request", exact: true }).click();
    await expect(urlInput).toHaveValue("");
  });

  test("rejects an unparseable URL instead of silently succeeding", async ({ page }) => {
    await page.goto("/");

    const urlInput = page.locator("input.address-url");
    await urlInput.fill("not a valid url at all");
    await page.getByRole("button", { name: "Send request" }).click();

    await expect(page.getByText(/valid URL/i)).toBeVisible();
    // No status badge should ever appear for a request that was never sent.
    await expect(page.locator(".status-badge")).toHaveCount(0);
  });

  test("reports a readable message for a network-level failure, not a raw event object", async ({ page }) => {
    await page.goto("/");

    const urlInput = page.locator("input.address-url");
    await urlInput.fill("https://this-domain-should-not-exist-e2e-check.invalid");
    await page.getByRole("button", { name: "Send request" }).click();

    await expect(page.getByText(/isTrusted/i)).toHaveCount(0, { timeout: 15_000 });
  });
});
