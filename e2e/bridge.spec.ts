import { randomBytes } from "node:crypto";
import { axe } from "./support/axe";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createServer as createTlsServer } from "node:https";
import type { AddressInfo } from "node:net";
import { expect, test, type Page } from "@playwright/test";
import { openRequestSettings, openSettings, seedAndOpen, send } from "./support/app";
import { routeThroughBridge, startBridge } from "./support/bridge";
import { ECHO } from "./support/echo";

// P6.1 and P6.3: the Local Bridge, a real process.
// The bridge is a Node process: what it does is the same from any browser.
test.skip(({ browserName }) => browserName !== "chromium", "the Local Bridge is started for Chromium only (plan P5.4)");

interface Echo {
  headers: [string, string][];
  body: string | null;
  bodyBase64: string | null;
  bodySize: number;
}

/** Sends, and gives what the bridge answered the page with: the target's response as the bridge wraps it. */
async function sendAndRelay(page: Page): Promise<{ status: number; headers: [string, string][]; bodyB64: string; encodedSize: number; decodedSize: number }> {
  const relayed = page.waitForResponse((response) => response.url().endsWith("/relay") && response.request().method() === "POST");
  await send(page);
  return (await (await relayed).json()) as { status: number; headers: [string, string][]; bodyB64: string; encodedSize: number; decodedSize: number };
}

test("a gzip response through the bridge is shown decoded, and the bridge says both sizes", async ({ page }) => {
  const bridge = await startBridge();
  try {
    await page.goto("/app/");
    await routeThroughBridge(page, bridge);
    await page.locator("input.address-url").fill(`${ECHO}/gzip`);

    const relay = await sendAndRelay(page);

    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
    await expect(page.locator("app-response-viewer")).toContainText('"gzipped": true');
    expect(JSON.parse(Buffer.from(relay.bodyB64, "base64").toString("utf8"))).toEqual({ gzipped: true });
    expect(relay.headers.find(([name]) => name.toLowerCase() === "content-encoding")?.[1]).toBe("gzip");
    // 16 bytes of JSON are more as gzip: the two sizes are what was received and what it is.
    expect(relay.decodedSize).toBe(16);
    expect(relay.encodedSize).toBeGreaterThan(16);
  } finally {
    bridge.stop();
  }
});

test("a file is the body through the bridge too, byte for byte, with the file's type", async ({ page }) => {
  // Bytes that are no UTF-8: a body goes as bytes, not as text.
  const file = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe]), randomBytes(4096)]);
  const bridge = await startBridge();
  try {
    await page.goto("/app/");
    await routeThroughBridge(page, bridge);
    await page.getByRole("textbox", { name: "HTTP method" }).fill("POST");
    await page.locator("input.address-url").fill(`${ECHO}/echo`);
    await page.getByRole("tab", { name: "Body", exact: true }).first().click();
    await page.getByRole("combobox", { name: "Body", exact: true }).click();
    await page.getByRole("option", { name: "Binary file", exact: true }).click();
    await page.getByLabel("File to send as the body").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: file });
    await expect(page.getByText("pixel.png")).toBeVisible();

    const relay = await sendAndRelay(page);

    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
    const echo = JSON.parse(Buffer.from(relay.bodyB64, "base64").toString("utf8")) as Echo;
    expect(Buffer.from(echo.bodyBase64 ?? "", "base64").equals(file)).toBe(true);
    expect(echo.bodySize).toBe(file.length);
    expect(echo.headers.find(([name]) => name === "content-type")?.[1]).toBe("image/png");
  } finally {
    bridge.stop();
  }
});

/** A bridge of another version: its `/health` says ok, and it does not know the page's relay. */
async function startOtherBridge(): Promise<{ url: string; stop: () => void }> {
  const server: Server = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", request.headers.origin ?? "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Wayfarer-Bridge-Token");
    if (request.method === "OPTIONS") return void response.writeHead(204).end();
    if (request.url === "/health") return void response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, name: "wayfarer-bridge", version: "9.0.0" }));
    response.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "not found" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, stop: () => server.close() };
}

test("a request through a bridge that does not know the page's relay fails with what to do: nothing reaches the target (P6.3)", async ({ page }) => {
  const other = await startOtherBridge();
  try {
    const direct: string[] = [];
    page.on("request", (request) => {
      if (request.url().startsWith(ECHO)) direct.push(request.url());
    });
    await page.goto("/app/");
    const settings = await openSettings(page, "Local Bridge");
    await settings.locator(".bridge-route").getByText("Local Bridge", { exact: true }).click();
    await settings.locator("#bridge-url-input").fill(other.url);
    await settings.locator("#bridge-token-input").fill("a-token-of-sixteen-characters-or-more");
    await settings.getByRole("button", { name: "Save", exact: true }).click();
    await expect(settings.locator(".bridge-saved")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);

    await page.locator("input.address-url").fill(`${ECHO}/echo?through=another-bridge`);
    await send(page);

    await expect(page.locator("app-response-viewer")).toContainText("does not understand this page");
    await expect(page.locator("app-response-viewer")).toContainText("Update the Local Bridge and reload Wayfarer");
    expect(direct).toEqual([]);
  } finally {
    other.stop();
  }
});

test("a server whose certificate nobody vouches for: refused as it is, and with verification off for the request it answers, with a red pill, a Host of the user's and the bridge's timings", async ({ page }) => {
  // The certificate of the bridge's own tests: for localhost, signed by an authority no machine trusts.
  const fixture = (name: string) => readFileSync(`packages/bridge/test/fixtures/${name}`);
  const target = createTlsServer({ key: fixture("key.pem"), cert: fixture("cert.pem") }, (request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ host: request.headers.host }));
  });
  await new Promise<void>((resolve) => target.listen(0, "127.0.0.1", resolve));
  const bridge = await startBridge();
  const violations: string[] = [];
  await page.exposeFunction("cspViolation", (directive: string) => violations.push(directive));
  await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (event) => void (window as unknown as { cspViolation(d: string): void }).cspViolation(event.violatedDirective)));
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedAndOpen(page, {}, { method: "GET", url: `https://localhost:${(target.address() as AddressInfo).port}/who`, headers: { Host: "api.internal" } });
    await routeThroughBridge(page, bridge);

    // As it is, the bridge verifies, and says what it found.
    await send(page);
    const viewer = page.locator("app-response-viewer");
    await expect(viewer).toContainText("unable to verify the first certificate", { timeout: 15_000 });
    await expect(viewer.locator(".tls-off-pill")).toHaveCount(0);

    await openRequestSettings(page);
    const box = page.getByRole("checkbox", { name: "Do not verify the server's certificate" });
    await box.check();
    const notes = page.locator("app-browser-notes .tls-insecure");
    await expect(page.locator("app-request-warnings .tls-off-pill")).toHaveText("TLS verification off");
    await expect(notes).toContainText("the Local Bridge accepts any certificate");

    const relayed = page.waitForResponse((response) => response.url().endsWith("/relay") && response.request().method() === "POST");
    await send(page);
    const relay = await relayed;
    expect((relay.request().postDataJSON() as { tls?: unknown }).tls).toEqual({ insecure: true });
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
    // The Host the user wrote is the one the server heard.
    await expect(viewer).toContainText('"host": "api.internal"');
    await expect(viewer.locator(".tls-off-pill")).toHaveText("TLS verification off");

    // The pill in both themes, where it is and as it is drawn.
    for (const scheme of ["dark", "light"] as const) {
      await page.evaluate((theme) => document.documentElement.setAttribute("data-theme", theme), scheme);
      const scan = await axe(page).include(".tls-off-pill").analyze();
      expect(scan.violations.map((violation) => violation.id), scheme).toEqual([]);
    }

    // The connection was the bridge's, and so are the timings: a TLS handshake is among them.
    await viewer.getByRole("tab", { name: "Timings" }).click();
    await expect(viewer.getByText("CORS-limited timings")).toHaveCount(0);
    const bridgeTimings = ((await relay.json()) as { timings: Record<string, number> }).timings;
    expect(Object.keys(bridgeTimings).sort()).toEqual(expect.arrayContaining(["content", "tcp", "tls", "ttfb"]));

    // The setting is the request's: unchecked, the next send is verified again.
    await box.uncheck();
    await expect(page.locator("app-request-warnings .tls-off-pill")).toHaveCount(0);
    await send(page);
    await expect(viewer).toContainText("unable to verify the first certificate", { timeout: 15_000 });
    await expect(viewer.locator(".tls-off-pill")).toHaveCount(0);
    expect(violations).toEqual([]);
  } finally {
    bridge.stop();
    await new Promise((resolve) => target.close(resolve));
  }
});

test("nothing is wider than the window with verification off said in the composer and on the response", async ({ page }) => {
  const bridge = await startBridge();
  try {
    await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` });
    await routeThroughBridge(page, bridge);
    await openRequestSettings(page);
    await page.getByRole("checkbox", { name: "Do not verify the server's certificate" }).check();
    await send(page);
    await expect(page.locator("app-response-viewer .tls-off-pill")).toBeVisible({ timeout: 15_000 });
    for (const width of [360, 390, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator("app-response-viewer .tls-off-pill")).toBeVisible();
      // Polled: the toolbar gives way a frame after the window does.
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: `${width} px` }).toBeLessThanOrEqual(0);
    }
  } finally {
    bridge.stop();
  }
});
