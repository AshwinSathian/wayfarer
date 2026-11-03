import { test, expect, type Page } from "@playwright/test";
import { dumpIdb, openSettings, PASSPHRASE } from "./support/app";

// D4.10, docs/design/ai/setup.md: AI is off until a provider is added in Settings › AI (AI-1); the provider's key is
// kept only as a vault secret (AI-6); removing the provider deletes it (AI-7).

const KEY = "sk-test-key-ai-settings-4b1d";

async function createVault(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Vault locked", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create vault passphrase", exact: true });
  await dialog.locator("input[type='password']").nth(0).fill(PASSPHRASE);
  await dialog.locator("input[type='password']").nth(1).fill(PASSPHRASE);
  await dialog.getByRole("button", { name: "Create vault" }).click();
  await expect(page.getByRole("button", { name: "Vault unlocked", exact: true })).toBeVisible();
}

test("with no provider, Settings › AI says nothing is sent and offers to add one; nothing else mentions AI", async ({
  page,
}) => {
  const hosts = new Set<string>();
  page.on("request", (request) => hosts.add(new URL(request.url()).host));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await expect(page.locator("input.address-url")).toBeVisible();
  await page.getByRole("button", { name: "Search or run a command" }).click();
  const palette = page.getByRole("combobox", { name: /^Search requests/ });
  await expect(palette).toBeFocused();
  // The palette finds what is there: Settings, and no AI command.
  await palette.fill("Settings");
  await expect(page.getByRole("option", { name: /Settings/ }).first()).toBeVisible();
  await palette.fill("AI");
  await expect(page.getByRole("option", { name: /AI/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  const settings = await openSettings(page, "AI");
  await expect(settings).toContainText("Wayfarer sends nothing to a model until you add one here.");
  await expect(settings.getByRole("button", { name: "Add a provider" })).toBeVisible();
  // Only the app's own server was asked for anything.
  expect([...hosts].every((host) => host.startsWith("127.0.0.1") || host.startsWith("localhost"))).toBe(true);
});

test("a provider's key is kept only in the vault, and removing the provider deletes it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await createVault(page);
  const settings = await openSettings(page, "AI");
  await settings.getByRole("button", { name: "Add a provider" }).click();
  await settings.getByLabel("Address").fill("http://127.0.0.1:4300/v1");
  await settings.getByLabel("Model").fill("test-model");
  await settings.getByLabel("Key", { exact: true }).fill(KEY);
  await settings.getByRole("button", { name: "Save", exact: true }).click();
  await expect(settings.getByText("*** in the vault")).toBeVisible();

  // The setting holds no key, and no store but the vault's holds its text (AI-6).
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).toContain("test-model");
  expect(stored).not.toContain(KEY);
  const idb = await dumpIdb(page);
  for (const [store, rows] of Object.entries(idb))
    if (store !== "secrets") expect(JSON.stringify(rows), store).not.toContain(KEY);
  expect(JSON.stringify(idb["secrets"])).toContain("AI provider key");
  expect(JSON.stringify(idb["secrets"])).not.toContain(KEY);

  // Removed, the key is gone from the vault and the pane is empty again (AI-7).
  await settings.getByRole("button", { name: "Remove provider…" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove provider" }).click();
  await expect(settings.getByRole("button", { name: "Add a provider" })).toBeVisible();
  await expect.poll(async () => JSON.stringify((await dumpIdb(page))["secrets"])).not.toContain("AI provider key");
  expect(await page.evaluate(() => localStorage.getItem("wayfarer:ai"))).toBeNull();
});

// AI-3 on the provider's test: the preview's body is the body the model received, byte for byte; nothing goes before
// Send to model, and the answer and a refusal are said in the pane.
test("Test the provider previews the call, and the model receives exactly what was shown", async ({
  page,
  request,
}) => {
  await request.delete("http://127.0.0.1:4300/model/received");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const settings = await openSettings(page, "AI");
  await settings.getByRole("button", { name: "Add a provider" }).click();
  await settings.getByLabel("Address").fill("http://127.0.0.1:4300/model/v1");
  await settings.getByLabel("Model").fill("test-model");
  await settings.getByRole("button", { name: "Save", exact: true }).click();
  await settings.getByRole("button", { name: "Test the provider…" }).click();
  const preview = settings.getByRole("region", { name: "Test the provider" });
  await expect(preview).toContainText("Sends to http://127.0.0.1:4300/model/v1/chat/completions");
  await expect(preview).toContainText("No key is sent.");
  const shown = (await preview.getByLabel(/^What is sent/).textContent()) ?? "";
  // Shown, not sent.
  expect(await (await request.get("http://127.0.0.1:4300/model/received")).json()).toEqual([]);
  await preview.getByRole("button", { name: "Send to model" }).click();
  await expect(settings).toContainText("The provider answered:");
  await expect(settings.locator(".settings-note.font-mono")).toHaveText("OK");
  const received = (await (await request.get("http://127.0.0.1:4300/model/received")).json()) as string[];
  expect(received).toHaveLength(1);
  expect(shown.slice(shown.indexOf("\n\n") + 2)).toBe(received[0]);
  expect(JSON.parse(received[0])).toMatchObject({
    model: "test-model",
    messages: [{ role: "user", content: "Reply with the word OK." }],
  });
  // Kept in history as a model call with its record (AI-13).
  await expect
    .poll(async () => JSON.stringify((await dumpIdb(page))["history"]))
    .toContain('"model":{"action":"test","model":"test-model"}');
});

test("a provider that refuses the key is said in its own words, with the key masked everywhere it is kept", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await createVault(page);
  const settings = await openSettings(page, "AI");
  await settings.getByRole("button", { name: "Add a provider" }).click();
  await settings.getByLabel("Address").fill("http://127.0.0.1:4300/model-refuses/v1");
  await settings.getByLabel("Model").fill("test-model");
  await settings.getByLabel("Key", { exact: true }).fill(KEY);
  await settings.getByRole("button", { name: "Save", exact: true }).click();
  await settings.getByRole("button", { name: "Test the provider…" }).click();
  const preview = settings.getByRole("region", { name: "Test the provider" });
  await expect(preview.getByLabel(/^What is sent/)).toContainText("Authorization: Bearer ***");
  await expect(preview.getByLabel(/^What is sent/)).not.toContainText(KEY);
  await preview.getByRole("button", { name: "Send to model" }).click();
  await expect(settings).toContainText("127.0.0.1:4300 refused the key: 401 Unauthorized.");
  await expect(settings).toContainText("Incorrect API key provided.");
  await expect.poll(async () => JSON.stringify((await dumpIdb(page))["history"])).toContain('"action":"test"');
  expect(JSON.stringify((await dumpIdb(page))["history"])).not.toContain(KEY);
});
