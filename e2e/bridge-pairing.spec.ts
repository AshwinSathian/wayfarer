import { expect, test, type Page } from "@playwright/test";
import { send } from "./support/app";
import { startBridge, type TestBridge } from "./support/bridge";
import { ECHO } from "./support/echo";

// P6.2: the pairing code, and the bridge over HTTPS with a certificate the user gives.
test.skip(({ browserName }) => browserName !== "chromium", "the Local Bridge is started for Chromium only (plan P5.4)");

/** Settings → Local Bridge, switched on at the bridge's address, not yet saved. */
async function openPane(page: Page, bridge: TestBridge) {
  await page.getByRole("button", { name: "Local Bridge settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.getByRole("checkbox", { name: "Route requests through the bridge" }).check();
  await settings.locator("#bridge-url-input").fill(bridge.url);
  return settings;
}

test("the code the bridge printed pairs the page: the token is saved without being typed, and a request goes through", async ({ page }) => {
  const bridge = await startBridge();
  try {
    await page.goto("/");
    const settings = await openPane(page, bridge);
    await expect(settings.locator(".bridge-lna")).toContainText("may ask whether this site may look for and connect to devices on your local network");
    expect(bridge.pairingCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    // Typed in lower case, as a user might.
    await settings.locator("#bridge-pairing-input").fill(bridge.pairingCode.toLowerCase());
    const paired = page.waitForResponse((response) => response.url().endsWith("/pair"));
    await settings.getByRole("button", { name: "Pair", exact: true }).click();
    expect((await paired).status()).toBe(200);
    await expect(settings.locator(".bridge-paired")).toContainText("Paired");
    await expect(settings.locator("#bridge-token-input")).toHaveValue(bridge.token);
    await expect(settings.locator(".bridge-saved")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.locator("input.address-url").fill(`${ECHO}/echo`);
    const relayed = page.waitForResponse((response) => response.url().endsWith("/v2/relay"));
    await send(page);
    expect((await relayed).status()).toBe(200);
    await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  } finally {
    bridge.stop();
  }
});

test("three wrong codes lock pairing: the page says so, with the seconds, and the right code waits too", async ({ page }) => {
  const bridge = await startBridge();
  try {
    await page.goto("/");
    const settings = await openPane(page, bridge);
    const field = settings.locator("#bridge-pairing-input");
    const pair = settings.getByRole("button", { name: "Pair", exact: true });
    for (let i = 0; i < 3; i += 1) {
      await field.fill(`WRNG-CDE${i + 2}`);
      await pair.click();
      await expect(settings.locator(".bridge-pair-problem")).toContainText("That is not the code the bridge shows.");
    }
    await field.fill(bridge.pairingCode);
    await pair.click();
    await expect(settings.locator(".bridge-pair-problem")).toContainText(/Three wrong codes: the bridge takes no code for (59|60) s\./);
    await expect(settings.locator("#bridge-token-input")).toHaveValue("");
  } finally {
    bridge.stop();
  }
});

test.describe("over HTTPS", () => {
  // The certificate of the bridge's own tests, from an authority this browser does not hold: as a certificate the
  // user made would be once trusted.
  test.use({ ignoreHTTPSErrors: true });

  test("with --cert and --key the bridge answers over HTTPS: the page tests it, pairs and sends through it", async ({ page }) => {
    const bridge = await startBridge(["--cert", "packages/bridge/test/fixtures/cert.pem", "--key", "packages/bridge/test/fixtures/key.pem"]);
    try {
      expect(bridge.url).toMatch(/^https:\/\/127\.0\.0\.1:/);
      await page.goto("/");
      const settings = await openPane(page, bridge);
      await settings.getByRole("button", { name: "Test connection" }).click();
      await expect(settings.locator(".bridge-test")).toContainText("Reachable");
      await settings.locator("#bridge-pairing-input").fill(bridge.pairingCode);
      await settings.getByRole("button", { name: "Pair", exact: true }).click();
      await expect(settings.locator(".bridge-paired")).toContainText("Paired");
      await page.keyboard.press("Escape");

      await page.locator("input.address-url").fill(`${ECHO}/echo`);
      await send(page);
      await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
    } finally {
      bridge.stop();
    }
  });
});
