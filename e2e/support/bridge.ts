import { spawn } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

/** A Local Bridge of this test's own, on its own port, that allows the app's origin. */
export interface TestBridge {
  url: string;
  token: string;
  stop: () => void;
}

/** Starts `packages/bridge/bin/cli.js` and resolves when it listens. Call `stop` in a `finally`. */
export async function startBridge(): Promise<TestBridge> {
  const port = 7720 + test.info().parallelIndex;
  const token = "bridge-token-for-an-e2e-0123456789abcdef";
  const bridge = spawn(process.execPath, ["packages/bridge/bin/cli.js", "--port", String(port), "--token", token, "--allow-origin", "http://localhost:4200"], { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise<void>((resolve, reject) => {
    bridge.once("exit", (code) => reject(new Error(`the bridge exited with ${code}`)));
    bridge.stdout.on("data", (chunk: Buffer) => {
      if (String(chunk).includes("listening on")) resolve();
    });
  });
  return { url: `http://127.0.0.1:${port}`, token, stop: () => bridge.kill() };
}

/** Switches the bridge on as a user does: the toolbar's button opens Settings at the bridge's pane. */
export async function routeThroughBridge(page: Page, bridge: TestBridge): Promise<void> {
  await page.getByRole("button", { name: "Local Bridge settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(settings.getByRole("heading", { name: "Local Bridge", exact: true })).toBeVisible();
  await settings.getByRole("checkbox", { name: "Route requests through the bridge" }).check();
  await settings.locator("#bridge-url-input").fill(bridge.url);
  await settings.locator("#bridge-token-input").fill(bridge.token);
  await settings.getByRole("button", { name: "Save", exact: true }).click();
  await expect(settings.locator(".bridge-saved")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(settings).toHaveCount(0);
}
