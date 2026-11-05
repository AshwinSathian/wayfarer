import { expect, test, type Page } from "@playwright/test";
import { openSettings } from "./support/app";
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
  await page.goto("/app/");
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

    // A new request has one header row, empty.
    await page
      .locator(".composer-pane")
      .getByRole("tab", { name: /^Headers( |$)/ })
      .click();
    await page.getByLabel("Header name, 1 of 1").fill("Accept");
    await page.getByLabel("Value of Accept").fill("text/plain");
    const second = page.waitForResponse(`${ECHO}/echo`);
    await page.getByRole("button", { name: "Send request" }).click();
    const chosen = ((await (await second).json()) as Reflected).headers.filter(([name]) => name === "accept");
    expect(chosen).toEqual([["accept", "text/plain"]]);
    expect(await violations(page)).toEqual([]);
  });

  test("@claim:C-042 Stop replaces Send while a request is in flight, and stops it at once", async ({ page }) => {
    await open(page);
    await sendTo(page, `${ECHO}/delay/10000`);

    const stop = page.getByRole("button", { name: "Stop request" });
    await expect(stop).toHaveText("Stop");
    await expect(page.getByRole("button", { name: "Send request" })).toHaveCount(0);
    await stop.click();

    await expect(page.locator(".response-announcement").filter({ hasText: "You stopped the request." })).toBeVisible({
      timeout: 200,
    });
    await expect(page.getByRole("button", { name: "Send request" })).toBeEnabled();
    await expect(stop).toHaveCount(0);
    expect(await violations(page)).toEqual([]);
  });

  // D5-e (V1): sending moved nothing but what it changes. The button kept its width (Cancel was 11 px wider, and the
  // address moved), and the last response stayed in the pane, dimmed after a second under "Sending…".
  test("while a request is out, the address does not move and the last response stays", async ({ page }) => {
    await open(page);
    await sendTo(page, `${ECHO}/echo`);
    await expect(page.locator(".status-badge")).toHaveText("200");
    const address = page.locator("input.address-url");
    const before = (await address.boundingBox())!;
    const send = (await page.getByRole("button", { name: "Send request" }).boundingBox())!;

    await sendTo(page, `${ECHO}/delay/3000`);
    const stop = page.getByRole("button", { name: "Stop request" });
    await expect(stop).toBeVisible();
    expect((await stop.boundingBox())!.width).toBe(send.width);
    expect((await address.boundingBox())!.width).toBe(before.width);
    // The last response, as it was, for the first second; then the line says it is sending, over it dimmed.
    await expect(page.locator(".status-badge")).toHaveText("200");
    await expect(page.locator(".response-sending")).toHaveText(/^Sending… 1\.\d s$/, { timeout: 1500 });
    await expect(page.locator(".response-stale .response-tabs")).toBeVisible();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 5000 });
    await expect(page.locator(".response-stale")).toHaveCount(0);
    expect(await violations(page)).toEqual([]);
  });

  test("@claim:C-042 a request that outlasts the timeout set in Settings says so", async ({ page }) => {
    await open(page);
    await openSettings(page, "General");
    const timeout = page.getByLabel("Request timeout");
    await expect(timeout).toHaveValue("0");
    await timeout.fill("1000");
    await timeout.blur();
    expect(await page.evaluate(() => localStorage.getItem("wayfarer:request-timeout-ms"))).toBe("1000");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toHaveCount(0);

    const started = Date.now();
    await sendTo(page, `${ECHO}/delay/5000`);

    await expect(
      page.locator(".response-announcement").filter({ hasText: "No response within 1.0 s, the request timeout." }),
    ).toBeVisible({
      timeout: 3000,
    });
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

    await expect(
      page.getByText(`Binary response (${megabytes * 1024 * 1024} bytes, application/octet-stream)`),
    ).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByRole("button", { name: "Download response body" })).toBeVisible();
    // Still answering: a click is handled within the usual time.
    await page.getByRole("button", { name: "New tab", exact: true }).click();
    await expect(page.locator("input.address-url")).toHaveValue("");
    expect(await violations(page)).toEqual([]);
  });
});

// U-091 (D4-e): Send turns into Cancel where it was. A double click on Send sent and then stopped what it sent.
test("a double click on Send sends once and does not cancel it", async ({ page }) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/delay/300`);
  await page.getByRole("button", { name: "Send request" }).dblclick();
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 5000 });
  await expect(page.getByText("You stopped the request.")).toHaveCount(0);
});
