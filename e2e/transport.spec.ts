import { expect, test, type Page } from "@playwright/test";
import { ECHO } from "./support/echo";

// P2.3: requests go out through fetch, with cancel and timeout. Every test
// also holds the page to its CSP and Trusted Types policy (plan risk R15).

interface Reflected {
  headers: [string, string][];
}

async function open(page: Page): Promise<string[]> {
  await page.addInitScript(() => {
    const seen: string[] = ((window as unknown as { __violations: string[] }).__violations = []);
    document.addEventListener("securitypolicyviolation", (e) => seen.push(`${e.effectiveDirective} ${e.blockedURI}`));
  });
  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();
  return [];
}

const violations = (page: Page) => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);

async function sendTo(page: Page, url: string): Promise<void> {
  await page.locator("input.address-url").fill(url);
  await page.getByRole("button", { name: "Send request" }).click();
}

test.describe("Transport on fetch (P2.3)", () => {
  test("a request carries no Referer, and Accept is */* until the user sets one", async ({ page }) => {
    await open(page);

    const first = page.waitForResponse(`${ECHO}/echo`);
    await sendTo(page, `${ECHO}/echo`);
    const plain = new Map(((await (await first).json()) as Reflected).headers);
    expect(plain.get("accept")).toBe("*/*");
    expect(plain.has("referer")).toBe(false);
    expect(plain.has("cookie")).toBe(false);
    await expect(page.locator(".status-badge")).toHaveText("200");

    await page.getByRole("button", { name: "Add Header" }).click();
    await page.getByLabel("Headers name, row 2").fill("Accept");
    await page.getByLabel("Headers value, row 2").fill("text/plain");
    const second = page.waitForResponse(`${ECHO}/echo`);
    await page.getByRole("button", { name: "Send request" }).click();
    const chosen = ((await (await second).json()) as Reflected).headers.filter(([name]) => name === "accept");
    expect(chosen).toEqual([["accept", "text/plain"]]);
    expect(await violations(page)).toEqual([]);
  });

  test("Cancel replaces Send while a request is in flight, and stops it at once", async ({ page }) => {
    await open(page);
    await sendTo(page, `${ECHO}/delay/10000`);

    const cancel = page.getByRole("button", { name: "Cancel request" });
    await expect(cancel).toBeVisible();
    await expect(page.getByRole("button", { name: "Send request" })).toHaveCount(0);
    await cancel.click();

    await expect(page.getByText("The request was cancelled.")).toBeVisible({ timeout: 200 });
    await expect(page.getByRole("button", { name: "Send request" })).toBeEnabled();
    await expect(cancel).toHaveCount(0);
    expect(await violations(page)).toEqual([]);
  });

  test("a request that outlasts the timeout set in Settings says so", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const timeout = page.getByLabel("Request timeout");
    await expect(timeout).toHaveValue("0");
    await timeout.fill("1000");
    await timeout.blur();
    expect(await page.evaluate(() => localStorage.getItem("wayfarer:request-timeout-ms"))).toBe("1000");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toHaveCount(0);

    const started = Date.now();
    await sendTo(page, `${ECHO}/delay/5000`);

    await expect(page.getByText("Timed out after 1000 ms")).toBeVisible({ timeout: 3000 });
    expect(Date.now() - started).toBeLessThan(4000);
    await expect(page.getByRole("button", { name: "Send request" })).toBeEnabled();
    expect(await violations(page)).toEqual([]);
  });

  test("a redirected request shows where the response came from", async ({ page }) => {
    await open(page);
    await sendTo(page, `${ECHO}/redirect/2`);

    await expect(page.locator(".status-badge")).toHaveText("200");
    await expect(page.locator(".redirect-note")).toHaveText(`Redirected to ${ECHO}/echo`);

    await sendTo(page, `${ECHO}/echo`);
    await expect(page.locator(".status-badge")).toHaveText("200");
    await expect(page.locator(".redirect-note")).toHaveCount(0);
    expect(await violations(page)).toEqual([]);
  });

  test("a very large body is offered as a download and the page stays usable", async ({ page, browserName }) => {
    test.setTimeout(120_000);
    // Over the 50 MB display cap in Chromium (the Blob path); the other engines take the in-memory path.
    const megabytes = browserName === "chromium" ? 60 : 5;
    await open(page);
    await sendTo(page, `${ECHO}/big/${megabytes}`);

    await expect(page.getByText(`Binary response (${megabytes * 1024 * 1024} bytes, application/octet-stream)`)).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByRole("button", { name: "Download response body" })).toBeVisible();
    // Still answering: a click is handled within the usual time.
    await page.getByRole("button", { name: "New request" , exact: true }).click();
    await expect(page.locator("input.address-url")).toHaveValue("");
    expect(await violations(page)).toEqual([]);
  });
});
