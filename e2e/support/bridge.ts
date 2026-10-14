import { spawn } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

/** A Local Bridge of this test's own, on its own port, that allows the app's origin. */
export interface TestBridge {
  url: string;
  token: string;
  /** The one-time code it printed (P6.2). */
  pairingCode: string;
  stop: () => void;
}

/** Starts `packages/bridge/bin/cli.js` and resolves when it listens. Call `stop` in a `finally`. */
export async function startBridge(extra: string[] = []): Promise<TestBridge> {
  const port = 7720 + test.info().parallelIndex;
  const token = "bridge-token-for-an-e2e-0123456789abcdef";
  const bridge = spawn(process.execPath, ["packages/bridge/bin/cli.js", "--port", String(port), "--token", token, "--allow-origin", "http://localhost:4200", ...extra], { stdio: ["ignore", "pipe", "inherit"] });
  let printed = "";
  const scheme = await new Promise<string>((resolve, reject) => {
    bridge.once("exit", (code) => reject(new Error(`the bridge exited with ${code}`)));
    bridge.stdout.on("data", (chunk: Buffer) => {
      printed += String(chunk);
      const listening = /listening on (https?):/.exec(printed);
      if (listening && /Pairing code: \S+/.test(printed)) resolve(listening[1]);
    });
  });
  const pairingCode = /Pairing code: (\S+)/.exec(printed)?.[1] ?? "";
  return { url: `${scheme}://127.0.0.1:${port}`, token, pairingCode, stop: () => bridge.kill() };
}

/** Sets the device's route (P6.4) and the bridge as a user does: the toolbar's button opens Settings at the bridge's pane. */
export async function routeThroughBridge(page: Page, bridge: TestBridge, route: "Local Bridge" | "Auto" = "Local Bridge"): Promise<void> {
  await page.getByRole("button", { name: "Local Bridge settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(settings.getByRole("heading", { name: "Local Bridge", exact: true })).toBeVisible();
  await settings.locator(".bridge-route").getByText(route, { exact: true }).click();
  await settings.locator("#bridge-url-input").fill(bridge.url);
  await settings.locator("#bridge-token-input").fill(bridge.token);
  await settings.getByRole("button", { name: "Save", exact: true }).click();
  await expect(settings.locator(".bridge-saved")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(settings).toHaveCount(0);
}
