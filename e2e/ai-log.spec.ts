import { test, expect, type Download, type Page } from "@playwright/test";
import { dumpIdb, openSettings, PASSPHRASE, send } from "./support/app";
import { ECHO } from "./support/echo";

// D4.10, docs/design/ai/log.md: each model call is a history entry with its record, masked as a send is (AI-13);
// with response bodies off, its kept prompt holds no response body (AI-14); a HAR of it holds no key (AI-15). It
// opens into its record in History and loads into no tab.

const MODEL = "http://127.0.0.1:4300/model";
const KEY = "sk-test-key-ai-log-7c2e";
/** The response body `/status/422` sends, as it reads inside the prompt's JSON. */
const QUOTED_BODY = '{\\"status\\":422}';

async function textOf(download: Download): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** A provider with a key in the vault, as a person adds one in Settings › AI. */
async function addProvider(page: Page, model: string): Promise<void> {
  await page.getByRole("button", { name: "No vault", exact: true }).click();
  const create = page.getByRole("dialog", { name: "Create vault passphrase", exact: true });
  await create.locator("input[type='password']").nth(0).fill(PASSPHRASE);
  await create.locator("input[type='password']").nth(1).fill(PASSPHRASE);
  await create.getByRole("button", { name: "Create vault" }).click();
  await expect(page.getByRole("button", { name: "Vault unlocked", exact: true })).toBeVisible();
  const settings = await openSettings(page, "AI");
  await settings.getByRole("button", { name: "Add a provider" }).click();
  await settings.getByLabel("Address").fill(`${MODEL}/v1`);
  await settings.getByLabel("Model").fill(model);
  await settings.getByLabel("Key", { exact: true }).fill(KEY);
  await settings.getByRole("button", { name: "Save", exact: true }).click();
  await expect(settings.getByText("*** in the vault")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
}

/** Sends to `/status/422` and asks the model for tests, the response body ticked. */
async function writeTests(page: Page): Promise<void> {
  await page.locator("input.address-url").fill(`${ECHO}/status/422`);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("422");
  await page.getByRole("tab", { name: /^Tests/ }).click();
  await page.getByRole("button", { name: "Write tests from this response…" }).click();
  const preview = page.getByRole("region", { name: "Ask the model to write tests" });
  await preview.getByRole("checkbox", { name: "The response body" }).check();
  await expect(preview.getByLabel(/^What is sent/)).toContainText(QUOTED_BODY);
  await preview.getByRole("button", { name: "Send to model" }).click();
  await expect(page.getByRole("region", { name: "Proposed tests" })).toBeVisible();
}

test("@claim:C-081 @claim:C-083 a model call is a history entry with its record, masked, that opens in place and exports with no key", async ({
  page,
}) => {
  test.slow();
  const model = `log-model-${Date.now()}`;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await addProvider(page, model);
  await writeTests(page);

  // Kept masked: *** where the key went, and no text of the key in any store but the vault's (AI-13).
  await expect.poll(async () => JSON.stringify((await dumpIdb(page))["history"])).toContain(model);
  const idb = await dumpIdb(page);
  expect(JSON.stringify(idb["history"])).toContain('["Authorization","***"]');
  for (const [store, rows] of Object.entries(idb))
    if (store !== "secrets") expect(JSON.stringify(rows), store).not.toContain(KEY);

  await page.getByRole("button", { name: "Request history", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Request history" });
  await drawer.getByRole("radio", { name: "Model calls" }).click();
  await expect(drawer.getByRole("status")).toHaveText("1 entry.");
  await expect(drawer.getByRole("button", { name: `Delete from history` })).toHaveCount(1);
  const row = drawer.getByRole("button", { name: /^Model call, Write tests 127\.0\.0\.1:4300 · .* 200 / });
  await expect(row).toContainText(`127.0.0.1:4300 · ${model}`);

  // It opens into its record, in place: the tab strip is as it was.
  const strip = page.getByRole("tablist", { name: "Open requests" }).getByRole("tab");
  const tabs = await strip.count();
  // By the keys, as log.md has it: Enter opens it, and Escape closes it with focus back on the row.
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(row).toHaveAttribute("aria-expanded", "true");
  const record = drawer.getByRole("region", { name: "Exchange record" });
  await expect(record.locator(".record-secrets")).toHaveText(
    "Filled from the vault: AI provider key. Each is *** in what is kept.",
  );
  await expect(record.locator(".record-kept")).toHaveText("History kept the request and the response.");
  await drawer.getByRole("button", { name: "Show what was sent" }).focus();
  await page.keyboard.press("Enter");
  const kept = drawer.getByLabel("What was sent, as kept");
  await expect(kept).toContainText("Authorization: ***");
  await expect(kept).toContainText(QUOTED_BODY);
  await expect(kept).not.toContainText(KEY);
  await expect(strip).toHaveCount(tabs);
  await page.keyboard.press("Escape");
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(row).toBeFocused();

  // The HAR of the filter in use: the model call alone, named as one, with no key (AI-15).
  await drawer.getByRole("button", { name: "Select…", exact: true }).click();
  await drawer.getByRole("button", { name: "Select all", exact: true }).click();
  await drawer.getByRole("button", { name: /Export 1 as HAR…/ }).click();
  const dialog = page.getByRole("dialog", { name: "Export as HAR" });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Save file" }).click(),
  ]);
  const har = await textOf(download);
  expect(har).toContain("Wayfarer model call: Write tests.");
  expect(har).not.toContain(KEY);
  expect((JSON.parse(har) as { log: { entries: unknown[] } }).log.entries).toHaveLength(1);
});

test("@claim:C-082 with response bodies off in history, a model call keeps no prompt that quoted one, and says so", async ({
  page,
}) => {
  test.slow();
  const model = `log-model-bodies-${Date.now()}`;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await addProvider(page, model);
  await page.locator("input.address-url").fill(`${ECHO}/status/422`);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("422");
  // Switched off after the send: the response's entry has its body, so the prompt can quote it.
  const settings = await openSettings(page, "History");
  await settings.getByRole("checkbox", { name: "Keep response bodies in history" }).uncheck();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
  await page.getByRole("tab", { name: /^Tests/ }).click();
  await page.getByRole("button", { name: "Write tests from this response…" }).click();
  const preview = page.getByRole("region", { name: "Ask the model to write tests" });
  await preview.getByRole("checkbox", { name: "The response body" }).check();
  await expect(preview.getByLabel(/^What is sent/)).toContainText(QUOTED_BODY);
  await preview.getByRole("button", { name: "Send to model" }).click();
  await expect(page.getByRole("region", { name: "Proposed tests" })).toBeVisible();

  // Neither the quoted body nor the answer is kept (AI-14), and the record says so.
  await expect.poll(async () => JSON.stringify((await dumpIdb(page))["history"])).toContain(model);
  const entries = ((await dumpIdb(page))["history"] as { model?: unknown }[]).filter((entry) => entry.model);
  expect(entries).toHaveLength(1);
  expect(JSON.stringify(entries[0])).not.toContain(QUOTED_BODY);
  expect(JSON.stringify(entries[0])).not.toContain("status is 200");
  await page.getByRole("button", { name: "Request history", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Request history" });
  await drawer.getByRole("button", { name: /^Model call, Write tests/ }).click();
  await expect(drawer.getByRole("region", { name: "Exchange record" }).locator(".record-kept")).toHaveText(
    "History kept the request without the response body it quoted, and the response's status and headers, not its body.",
  );
});
