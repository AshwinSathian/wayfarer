import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type Page } from "@playwright/test";
import { openSettings, send } from "./support/app";
import { routeThroughBridge, startBridge } from "./support/bridge";
import { ECHO } from "./support/echo";

// P6.1 and P6.3: the Local Bridge's protocol 2, with a bridge that is a real process.
// The bridge is a Node process: what it does is the same from any browser.
test.skip(({ browserName }) => browserName !== "chromium", "the Local Bridge is started for Chromium only (plan P5.4)");

interface Echo {
  headers: [string, string][];
  body: string | null;
  bodyBase64: string | null;
  bodySize: number;
}

/** Sends, and gives what the bridge answered the page with: the target's response as protocol 2 wraps it. */
async function sendAndRelay(page: Page): Promise<{ status: number; headers: [string, string][]; bodyB64: string; encodedSize: number; decodedSize: number }> {
  const relayed = page.waitForResponse((response) => response.url().endsWith("/v2/relay") && response.request().method() === "POST");
  await send(page);
  return (await (await relayed).json()) as { status: number; headers: [string, string][]; bodyB64: string; encodedSize: number; decodedSize: number };
}

test("a gzip response through the bridge is shown decoded, and the bridge says both sizes", async ({ page }) => {
  const bridge = await startBridge();
  try {
    await page.goto("/");
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
  // Bytes that are no UTF-8: protocol 1 carried a body as text and the app refused this request.
  const file = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe]), randomBytes(4096)]);
  const bridge = await startBridge();
  try {
    await page.goto("/");
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

/** A bridge as Local Bridge 1.1.0 answers: `/health` without a protocol, and no path of protocol 2. It counts what it was asked to relay. */
async function startOldBridge(): Promise<{ url: string; relayed: () => number; stop: () => void }> {
  let relayed = 0;
  const server: Server = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", request.headers.origin ?? "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Wayfarer-Bridge-Token");
    if (request.method === "OPTIONS") return void response.writeHead(204).end();
    if (request.url === "/health") return void response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, name: "wayfarer-local-bridge", version: "1.1.0" }));
    if (request.url === "/relay") relayed += 1;
    response.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "not found" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, relayed: () => relayed, stop: () => server.close() };
}

test("an older bridge is named in Settings with its version, and a request through it fails with what to do: nothing reaches the target (P6.3)", async ({ page }) => {
  const old = await startOldBridge();
  try {
    const direct: string[] = [];
    page.on("request", (request) => {
      if (request.url().startsWith(ECHO)) direct.push(request.url());
    });
    await page.goto("/");
    const settings = await openSettings(page, "Local Bridge");
    await settings.getByRole("checkbox", { name: "Route requests through the bridge" }).check();
    await settings.locator("#bridge-url-input").fill(old.url);
    await settings.locator("#bridge-token-input").fill("a-token-of-sixteen-characters-or-more");
    await settings.getByRole("button", { name: "Test connection" }).click();
    await expect(settings.locator(".bridge-test")).toHaveText("Local Bridge 1.1.0 is too old for this page: it speaks protocol 1, and the page speaks protocol 2. Update the Local Bridge and start it again.");
    await settings.getByRole("button", { name: "Save", exact: true }).click();
    await expect(settings.locator(".bridge-saved")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);

    await page.locator("input.address-url").fill(`${ECHO}/echo?through=an-old-bridge`);
    await send(page);

    await expect(page.locator("app-response-viewer")).toContainText("does not speak protocol 2");
    await expect(page.locator("app-response-viewer")).toContainText("Update the Local Bridge and start it again.");
    // Neither the page nor the old bridge sent the request: its path of protocol 1 was not asked.
    expect(old.relayed()).toBe(0);
    expect(direct).toEqual([]);
  } finally {
    old.stop();
  }
});
