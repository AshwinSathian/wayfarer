import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { send } from "./support/app";
import { startBridge } from "./support/bridge";
import { ECHO } from "./support/echo";

// DQ10, U-131, U-138 (D4.12): a send that got no response while no Local Bridge is paired says the route it took,
// and sets the bridge up where it failed: the command with Copy, the pairing code, then Send again through it.
// The status bar says what the app will do: Auto with no bridge paired sends from the page.

test("a failed send with no bridge paired sets the bridge up in place, and Send again goes through it", async ({
  page,
}) => {
  const bridge = await startBridge();
  try {
    // The bridge's address is known (as after `npx wayfarer-bridge` on its default port); no token: not paired.
    await page.addInitScript((url) => {
      if (!localStorage.getItem("wayfarer:bridge"))
        localStorage.setItem("wayfarer:bridge", JSON.stringify({ route: "auto", url }));
      const written: string[] = [];
      (window as unknown as { __clipboard: string[] }).__clipboard = written;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (text: string) => void written.push(text) },
      });
    }, bridge.url);
    await page.goto("/app/");
    const routeItem = page.getByRole("button", { name: /^Route: / });
    await expect(routeItem).toHaveText("Route: direct");

    // A server that sends no CORS headers: the browser gives the page no response.
    await page.locator("input.address-url").fill(`${ECHO}/cors/none?id=${randomUUID()}`);
    await send(page);
    await expect(page.locator(".response-announcement")).toHaveText(
      "The request got no response. Direct to 127.0.0.1:4300, no bridge paired.",
    );
    const record = page.getByRole("region", { name: "Exchange record" });
    await expect(record.locator(".record-route")).toHaveText(
      "Sent from this page to 127.0.0.1:4300. No Local Bridge is paired.",
    );
    await expect(record.getByRole("button", { name: "Send through the Local Bridge" })).toHaveCount(0);

    await expect(record.locator(".bridge-command")).toHaveText("npx wayfarer-bridge");
    await record.getByRole("button", { name: "Copy the command" }).click();
    await expect(record.locator(".bridge-setup-said")).toHaveText("Copied npx wayfarer-bridge.");
    expect(await page.evaluate(() => (window as unknown as { __clipboard: string[] }).__clipboard)).toEqual([
      "npx wayfarer-bridge",
    ]);

    await record.getByLabel("Pairing code", { exact: true }).fill("WRONG-0000");
    await record.getByRole("button", { name: "Pair" }).click();
    await expect(record.locator(".bridge-setup-said")).toHaveText(
      "That is not the code the bridge shows. After three wrong codes the bridge waits a minute.",
    );
    await record.getByLabel("Pairing code", { exact: true }).fill(bridge.pairingCode);
    await record.getByRole("button", { name: "Pair" }).click();
    await expect(record.locator(".bridge-setup-said")).toHaveText("Paired: the token is saved.");
    await expect(routeItem).toHaveText("Route: auto");

    await record.getByRole("button", { name: "Send again" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
    await expect(page.locator(".record-toggle")).toHaveText("Local Bridge to 127.0.0.1:4300");
  } finally {
    bridge.stop();
  }
});

test("with a bridge paired, a failed send offers to send through it and says nothing of pairing", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("wayfarer:bridge", JSON.stringify({ route: "direct", url: "http://127.0.0.1:7717" })),
  );
  await page.goto("/app/");
  // The token is in this tab only: typed in Settings.
  await page.getByRole("button", { name: /^Route: / }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.locator("#bridge-token-input").fill("bridge-token-for-an-e2e-0123456789abcdef");
  await settings.getByRole("button", { name: "Save", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(settings).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Route: / })).toHaveText("Route: direct");

  await page.locator("input.address-url").fill("http://127.0.0.1:9/nothing-listens");
  await send(page);
  const record = page.getByRole("region", { name: "Exchange record" });
  await expect(record.locator(".record-route")).toHaveText("Sent from this page to 127.0.0.1:9.");
  await expect(record.getByRole("button", { name: "Send through the Local Bridge" })).toBeVisible();
  await expect(record.locator(".bridge-command")).toHaveCount(0);
});
