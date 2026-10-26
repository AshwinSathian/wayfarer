import { expect, test, type Download, type Page } from "@playwright/test";
import {
  closeEnvironments,
  dumpIdb,
  openEnvironments,
  openSettings,
  protectVariable,
  seedAndOpen,
  send,
} from "./support/app";
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

const openData = (page: Page) => openSettings(page, "Data and storage");

test("@claim:C-046 backup, Reset all data, restore: every store of the backup holds what it held, with collections untrusted; the composer's tabs are not in it", async ({
  page,
}) => {
  // Three page loads, a vault made and opened again (two key derivations), a download and an upload:
  // the longest test of the suite. On a slow CI runner it met the 30 s limit.
  test.slow();
  await seedAndOpen(
    page,
    { host: ECHO },
    { method: "GET", url: "{{host}}/echo?backup=1", auth: { type: "bearer", token: "typed-token" } },
  );
  await protectVariable(page, "API_TOKEN", SECRET);
  await openEnvironments(page);
  await page.getByRole("button", { name: "Global variables" }).click();
  const globals = page.getByRole("dialog", { name: "Global variables" });
  await globals.getByRole("button", { name: "Add variable" }).click();
  await globals.getByPlaceholder("name").last().fill("region");
  await globals.getByPlaceholder("value").last().fill("eu");
  await globals.getByRole("button", { name: "Save variables" }).click();
  await closeEnvironments(page);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await expect.poll(async () => (await dumpIdb(page))["history"]?.length ?? 0).toBe(1);
  await expect.poll(async () => (await dumpIdb(page))["tabs"]?.length ?? 0).toBe(1);
  const { tabs: tabsBefore, ...before } = await dumpIdb(page);

  await openData(page);
  await page.getByRole("checkbox", { name: "With history" }).check();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Back up workspace" }).click(),
  ]);
  const file = await text(download);
  expect(file).toContain('"$id": "wayfarer/workspace"');
  expect(file).not.toContain(SECRET);
  expect(file).not.toContain(PASSPHRASE);

  await page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button", { name: "Danger zone", exact: true })
    .click();
  await page.getByRole("button", { name: "Reset all data" }).click();
  await page.getByRole("button", { name: "Proceed", exact: true }).click();
  await expect(page.getByText("Tripwire collection", { exact: true })).toHaveCount(0);
  await expect
    .poll(
      async () =>
        Object.values(await dumpIdb(page))
          .flat()
          .filter((record) => (record as { key?: string }).key !== "state").length,
    )
    .toBe(0);

  await openData(page);
  await page
    .getByLabel("Restore workspace from file")
    .setInputFiles({ name: "wayfarer-workspace.json", mimeType: "application/json", buffer: Buffer.from(file) });
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText("Tripwire collection", { exact: true })).toBeVisible();

  // The composer's tabs are working state, not what was saved: a backup does not hold them (docs/storage.md).
  // The reset removed the one there was, and the restore brought none.
  const { tabs: tabsAfter, ...after } = await dumpIdb(page);
  expect(tabsBefore).toHaveLength(1);
  expect(tabsAfter).toEqual([]);
  // A file's scripts are not trusted until approved (D6): that is the one difference.
  const untrusted = (stores: Record<string, unknown[]>) => ({
    ...stores,
    collections: (stores["collections"] as { scriptTrust: unknown }[]).map((collection) => ({
      ...collection,
      scriptTrust: { trusted: false },
    })),
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
  // The open tab is written a moment after it was opened: what is compared is the database at rest.
  await expect.poll(async () => (await dumpIdb(page))["tabs"]?.length ?? 0).toBe(1);
  const before = await dumpIdb(page);
  await openData(page);
  await page.getByLabel("Restore workspace from file").setInputFiles({
    name: "nope.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"$id":"wayfarer/collection"}'),
  });
  await page.getByRole("button", { name: "Restore", exact: true }).click();

  await expect(page.getByText("The file was not restored and nothing was changed:")).toBeVisible();
  await expect(page.getByText('Not a Wayfarer workspace file: "$id" must be "wayfarer/workspace".')).toBeVisible();
  expect(await dumpIdb(page)).toEqual(before);
});

test("@claim:C-047 an environments export leaves protected values out unless asked: no reference, no plaintext; plain text needs the words typed", async ({
  page,
}) => {
  await seedAndOpen(page, { host: "localhost" }, { method: "GET", url: `${ECHO}/echo` });
  await protectVariable(page, "API_TOKEN", SECRET);
  const dialog = page.getByRole("dialog", { name: "Export environments" });
  await openEnvironments(page);
  const exportWith = async (choice?: string, typed?: string) => {
    await page.getByRole("button", { name: "Export environments" }).click();
    if (choice) await dialog.getByRole("radio", { name: choice }).click();
    if (typed) await dialog.getByLabel(/to confirm/).fill(typed);
    return dialog.getByRole("button", { name: "Export file" });
  };

  const [plainDefault] = await Promise.all([page.waitForEvent("download"), (await exportWith()).click()]);
  const stripped = await text(plainDefault);
  expect(stripped).toContain('"$id": "wayfarer/environments"');
  expect(stripped).toContain('"value": "localhost"');
  expect(stripped).not.toContain("$secret");
  expect(stripped).not.toContain(SECRET);

  const [withVault] = await Promise.all([page.waitForEvent("download"), (await exportWith("With the vault")).click()]);
  const bundled = await text(withVault);
  expect(bundled).toMatch(/"value": "\{\{\$secret\.[0-9a-f-]+\}\}"/);
  expect(bundled).toContain('"$id": "wayfarer/vault"');
  expect(bundled).not.toContain(SECRET);

  // Plain text: not without the words.
  await (await exportWith("Plain text", "export secrets")).click();
  await expect(
    dialog.getByRole("alert").filter({ hasText: "Type EXPORT SECRETS to write secrets as plain text." }),
  ).toBeVisible();
  await dialog.getByLabel(/to confirm/).fill("EXPORT SECRETS");
  const [plain] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Export file" }).click(),
  ]);
  expect(await text(plain)).toContain(`"value": "${SECRET}"`);
});

test("a reminder to back up appears when the last one is more than 14 days old, and Not now puts it off", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/app/");
  await expect(page.locator("input.address-url")).toBeVisible();
  // The shell's live region says it while the banner is drawn (U-075).
  const reminder = page.getByRole("status").filter({ hasText: /more than 14 days since this workspace was backed up/ });
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

test("Settings says whether the browser keeps the data, and shows Safari's seven-day rule only in Safari", async ({
  page,
  browserName,
}) => {
  await page.goto("/app/");
  await openData(page);
  await expect(page.getByTestId("storage-status")).toContainText(/promised to keep this data|does not say whether/);
  // How much is used, of how much the browser allows, each in a unit a person reads.
  await expect(page.getByRole("img", { name: /^[\d.]+ (B|kB|MB|GB) used of [\d.]+ (MB|GB|TB)$/ })).toBeVisible();
  await expect(page.getByTestId("safari-eviction-notice")).toHaveCount(browserName === "webkit" ? 1 : 0);
});
