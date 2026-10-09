import { expect, test, type Download, type Page } from "@playwright/test";
import { dumpIdb, seedAndOpen, send } from "./support/app";
import { ECHO } from "./support/echo";

// P2.11: the workspace lives in one browser. A backup and a restore, what
// an environments file holds of secrets, and what the page says about the
// browser keeping the data.

const PASSPHRASE = "correct horse battery staple";
const SECRET = "durability-plaintext-4e1";

async function text(download: Download): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** Adds a protected variable to the open environment, making the vault on the way. */
async function protectVariable(page: Page, name: string, plaintext: string): Promise<void> {
  const keys = page.getByPlaceholder("KEY", { exact: true });
  const before = await keys.count();
  await page.getByRole("button", { name: "Add variable" }).click();
  await expect(keys).toHaveCount(before + 1);
  await keys.last().fill(name);
  await page.getByPlaceholder("Value", { exact: true }).last().fill(plaintext);
  await page.getByRole("button", { name: "Mark variable as secret" }).last().click();
  const dialog = page.getByRole("dialog", { name: "Create vault passphrase", exact: true });
  await dialog.locator("input[type='password']").nth(0).fill(PASSPHRASE);
  await dialog.locator("input[type='password']").nth(1).fill(PASSPHRASE);
  await dialog.getByRole("button", { name: "Create vault" }).click();
  await expect(page.getByRole("button", { name: "Lock secrets", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark variable as secret" }).last().click();
  await expect(page.getByText("Secret stored")).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
}

const openSettings = (page: Page) => page.getByRole("button", { name: "Settings", exact: true }).click();

test("@claim:C-046 backup, Reset all data, restore: every store holds what it held, with collections untrusted", async ({ page }) => {
  await seedAndOpen(page, { host: ECHO }, { method: "GET", url: "{{host}}/echo?backup=1", auth: { type: "bearer", token: "typed-token" } });
  await protectVariable(page, "API_TOKEN", SECRET);
  await page.getByRole("button", { name: "Global variables" }).click();
  const globals = page.getByRole("dialog", { name: "Global variables" });
  await globals.getByRole("button", { name: "Add variable" }).click();
  await globals.getByPlaceholder("name").last().fill("region");
  await globals.getByPlaceholder("value").last().fill("eu");
  await globals.getByRole("button", { name: "Save variables" }).click();
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await expect.poll(async () => (await dumpIdb(page))["history"]?.length ?? 0).toBe(1);
  const before = await dumpIdb(page);

  await openSettings(page);
  await page.getByRole("checkbox", { name: "With history" }).check();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Back up workspace" }).click()]);
  const file = await text(download);
  expect(file).toContain('"$id": "wayfarer/workspace/2"');
  expect(file).not.toContain(SECRET);
  expect(file).not.toContain(PASSPHRASE);

  await page.getByRole("button", { name: "Reset all data" }).click();
  await page.getByRole("button", { name: "Proceed", exact: true }).click();
  await expect(page.getByText("Tripwire collection", { exact: true })).toHaveCount(0);
  await expect.poll(async () => Object.values(await dumpIdb(page)).flat().filter((record) => (record as { key?: string }).key !== "state").length).toBe(0);

  await openSettings(page);
  await page.getByLabel("Restore workspace from file").setInputFiles({ name: "wayfarer-workspace.json", mimeType: "application/json", buffer: Buffer.from(file) });
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText("Tripwire collection", { exact: true })).toBeVisible();

  const after = await dumpIdb(page);
  // A file's scripts are not trusted until approved (D6): that is the one difference.
  const untrusted = (stores: Record<string, unknown[]>) => ({
    ...stores,
    collections: (stores["collections"] as { scriptTrust: unknown }[]).map((collection) => ({ ...collection, scriptTrust: { trusted: false } })),
  });
  expect((before["collections"] as { scriptTrust: unknown }[])[0].scriptTrust).toEqual({ trusted: true });
  expect((after["collections"] as { scriptTrust: unknown }[])[0].scriptTrust).toEqual({ trusted: false });
  expect(after).toEqual(untrusted(before));

  // The vault opens with its passphrase and still holds the secret.
  await page.getByRole("button", { name: "Unlock secrets", exact: true }).click();
  const unlock = page.getByRole("dialog", { name: "Unlock secrets", exact: true });
  await unlock.locator("input[type='password']").fill(PASSPHRASE);
  await unlock.getByRole("button", { name: "Unlock secrets" }).click();
  await page.getByRole("button", { name: "Manage secrets" }).click();
  await page.getByRole("button", { name: "Reveal value for API_TOKEN" }).click();
  await expect(page.getByRole("dialog", { name: "Secrets", exact: true }).getByText(SECRET)).toBeVisible();
});

test("a file that is not a workspace backup is refused, with the reason, and nothing changes", async ({ page }) => {
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` });
  const before = await dumpIdb(page);
  await openSettings(page);
  await page.getByLabel("Restore workspace from file").setInputFiles({ name: "nope.json", mimeType: "application/json", buffer: Buffer.from('{"$id":"wayfarer/collection/2"}') });
  await page.getByRole("button", { name: "Restore", exact: true }).click();

  await expect(page.getByText("The file was not restored and nothing was changed:")).toBeVisible();
  await expect(page.getByText('Not a Wayfarer workspace file: "$id" must be "wayfarer/workspace/2".')).toBeVisible();
  expect(await dumpIdb(page)).toEqual(before);
});

test("@claim:C-047 an environments export leaves protected values out unless asked: no reference, no plaintext; plain text needs the words typed", async ({ page }) => {
  await seedAndOpen(page, { host: "localhost" }, { method: "GET", url: `${ECHO}/echo` });
  await protectVariable(page, "API_TOKEN", SECRET);
  const dialog = page.getByRole("dialog", { name: "Export environments" });
  const exportWith = async (choice?: string, typed?: string) => {
    await page.getByRole("button", { name: "Export environments" }).click();
    if (choice) await dialog.getByRole("radio", { name: choice }).click();
    if (typed) await dialog.getByLabel(/to confirm/).fill(typed);
    return dialog.getByRole("button", { name: "Export file" });
  };

  const [plainDefault] = await Promise.all([page.waitForEvent("download"), (await exportWith()).click()]);
  const stripped = await text(plainDefault);
  expect(stripped).toContain('"$id": "wayfarer/environments/2"');
  expect(stripped).toContain('"value": "localhost"');
  expect(stripped).not.toContain("$secret");
  expect(stripped).not.toContain(SECRET);

  const [withVault] = await Promise.all([page.waitForEvent("download"), (await exportWith("With the vault")).click()]);
  const bundled = await text(withVault);
  expect(bundled).toMatch(/"value": "\{\{\$secret\.[0-9a-f-]+\}\}"/);
  expect(bundled).toContain('"$id": "wayfarer/vault/2"');
  expect(bundled).not.toContain(SECRET);

  // Plain text: not without the words.
  await (await exportWith("Plain text", "export secrets")).click();
  await expect(dialog.getByText("Type EXPORT SECRETS to write secrets as plain text.")).toBeVisible();
  await dialog.getByLabel(/to confirm/).fill("EXPORT SECRETS");
  const [plain] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Export file" }).click()]);
  expect(await text(plain)).toContain(`"value": "${SECRET}"`);
});

test("a reminder to back up appears when the last one is more than 14 days old, and Not now puts it off", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();
  const reminder = page.getByText(/more than 14 days since this workspace was backed up/);
  await expect(reminder).toHaveCount(0);

  await page.clock.fastForward(15 * 24 * 60 * 60 * 1000);
  await page.reload();
  await expect(reminder).toBeVisible();

  await page.getByRole("button", { name: "Dismiss backup reminder" }).click();
  await expect(reminder).toHaveCount(0);
  await page.reload();
  await expect(page.locator("input.address-url")).toBeVisible();
  await expect(reminder).toHaveCount(0);

});

test("Settings says whether the browser keeps the data, and shows Safari's seven-day rule only in Safari", async ({ page, browserName }) => {
  await page.goto("/");
  await openSettings(page);
  await expect(page.getByTestId("storage-status")).toContainText(/promised to keep this data|does not say whether/);
  await expect(page.getByTestId("storage-status")).toContainText(/Using \d+\.\d MB of \d+\.\d MB allowed\./);
  await expect(page.getByTestId("safari-eviction-notice")).toHaveCount(browserName === "webkit" ? 1 : 0);
});
