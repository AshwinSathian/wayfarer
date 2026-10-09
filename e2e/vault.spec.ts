import { expect, test, type Page } from "@playwright/test";

// P2.6, vault v2 (F09): one data key wrapped by the passphrase. Each test
// also holds the page to its CSP and Trusted Types policy (plan risk R15):
// wrapKey and unwrapKey are new to the app.

const PASSPHRASE = "correct horse battery staple";

async function watchViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = ((window as unknown as { __violations: string[] }).__violations = []);
    document.addEventListener("securitypolicyviolation", (e) => seen.push(`${e.effectiveDirective} ${e.blockedURI}`));
  });
}

const violations = (page: Page) => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);

const unlockButton = (page: Page) => page.getByRole("button", { name: "Unlock secrets", exact: true });
const lockButton = (page: Page) => page.getByRole("button", { name: "Lock secrets", exact: true });

async function createVault(page: Page, passphrase = PASSPHRASE): Promise<void> {
  await unlockButton(page).click();
  const dialog = page.getByRole("dialog", { name: "Create vault passphrase", exact: true });
  await dialog.locator("input[type='password']").nth(0).fill(passphrase);
  await dialog.locator("input[type='password']").nth(1).fill(passphrase);
  await dialog.getByRole("button", { name: "Create vault" }).click();
  await expect(lockButton(page)).toBeVisible();
}

async function unlock(page: Page, passphrase: string): Promise<void> {
  await unlockButton(page).click();
  const dialog = page.getByRole("dialog", { name: "Unlock secrets", exact: true });
  await dialog.locator("input[type='password']").fill(passphrase);
  await dialog.getByRole("button", { name: "Unlock secrets" }).click();
}

/** An environment with one protected variable, saved. The vault must be unlocked. */
async function protect(page: Page, name: string, plaintext: string): Promise<void> {
  await page.getByRole("button", { name: "New environment" }).click();
  await page.locator("#new-env-name-input").fill("Vault env");
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByRole("button", { name: "Add variable" }).click();
  await page.getByPlaceholder("KEY", { exact: true }).fill(name);
  await page.getByPlaceholder("Value", { exact: true }).fill(plaintext);
  await page.getByRole("button", { name: "Mark variable as secret" }).click();
  await expect(page.getByText("Secret stored")).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
}

test("a wrong passphrase is refused when the vault holds no secret", async ({ page }) => {
  await watchViolations(page);
  await page.goto("/");
  await createVault(page);
  await lockButton(page).click();

  await unlock(page, "not the passphrase");
  await expect(page.getByText("Incorrect passphrase. Please try again.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(unlockButton(page)).toBeVisible();

  // Also after a reload, when nothing of the first unlock is left in memory.
  await page.reload();
  await unlock(page, PASSPHRASE);
  await expect(lockButton(page)).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("locking the vault in one tab locks it in the other within a second", async ({ context }) => {
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await pageA.goto("/");
  await pageB.goto("/");
  await createVault(pageA);
  await unlock(pageB, PASSPHRASE);
  await expect(lockButton(pageB)).toBeVisible();

  await lockButton(pageA).click();

  await expect(unlockButton(pageB)).toBeVisible({ timeout: 1000 });
});

test("@claim:C-005 the vault locks itself after the idle time: set to 1 minute, it is locked 61 seconds later", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const idle = page.getByLabel("Lock the vault when idle");
  await expect(idle).toHaveValue("15");
  await idle.fill("1");
  await idle.blur();
  await page.keyboard.press("Escape");
  await createVault(page);

  // The idle time is counted from the last key press. Pressing one here starts
  // the minute at a known moment: the clock also runs in real time, and on a
  // slow runner more than a second passed between making the vault and the
  // first jump, which locked it "early".
  await page.keyboard.press("Shift");
  await page.clock.fastForward(55_000);
  await expect(lockButton(page)).toBeVisible();
  await page.clock.fastForward(6_000);

  await expect(unlockButton(page)).toBeVisible();
});

test("the passphrase can be changed: the old one stops working and the secret is still there", async ({ page }) => {
  await watchViolations(page);
  await page.goto("/");
  await createVault(page);
  await protect(page, "API_TOKEN", "rotation-keeps-me");

  await page.getByRole("button", { name: "Manage secrets" }).click();
  const secrets = page.getByRole("dialog", { name: "Secrets", exact: true });
  await secrets.getByRole("button", { name: "Change passphrase" }).click();
  await secrets.getByLabel("Current passphrase").fill("not the passphrase");
  await secrets.getByLabel("New passphrase", { exact: true }).fill("a new passphrase");
  await secrets.getByLabel("Confirm new passphrase").fill("a new passphrase");
  await secrets.getByRole("button", { name: "Change passphrase" }).last().click();
  await expect(secrets.getByText("Incorrect passphrase. Nothing was changed.")).toBeVisible();

  await secrets.getByLabel("Current passphrase").fill(PASSPHRASE);
  await secrets.getByRole("button", { name: "Change passphrase" }).last().click();
  await expect(secrets.getByText("Passphrase changed. The old one no longer opens the vault.")).toBeVisible();
  await page.keyboard.press("Escape");

  await lockButton(page).click();
  await unlock(page, PASSPHRASE);
  await expect(page.getByText("Incorrect passphrase. Please try again.")).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "Unlock secrets", exact: true });
  await dialog.locator("input[type='password']").fill("a new passphrase");
  await dialog.getByRole("button", { name: "Unlock secrets" }).click();
  await expect(lockButton(page)).toBeVisible();

  await page.getByRole("button", { name: "Manage secrets" }).click();
  await secrets.getByRole("button", { name: "Reveal value for API_TOKEN" }).click();
  await expect(secrets.getByText("rotation-keeps-me")).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("the vault is exported as a file without any plaintext, and a secret deleted since comes back from it", async ({ page }) => {
  await watchViolations(page);
  await page.goto("/");
  await createVault(page);
  await protect(page, "API_TOKEN", "exported-encrypted-7c1");

  await page.getByRole("button", { name: "Manage secrets" }).click();
  const secrets = page.getByRole("dialog", { name: "Secrets", exact: true });
  await secrets.getByRole("button", { name: "Export vault" }).click();
  await secrets.getByLabel("Current passphrase").fill(PASSPHRASE);
  const [download] = await Promise.all([page.waitForEvent("download"), secrets.getByRole("button", { name: "Export", exact: true }).click()]);
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  const file = Buffer.concat(chunks).toString("utf8");
  expect(file).toContain('"$id": "wayfarer/vault/2"');
  expect(file).not.toContain("exported-encrypted-7c1");
  expect(file).not.toContain(PASSPHRASE);

  await secrets.getByRole("button", { name: "Delete API_TOKEN" }).click();
  await page.getByRole("button", { name: "Proceed", exact: true }).click();
  await expect(secrets.getByText("No secrets yet")).toBeVisible();

  await secrets.getByRole("button", { name: "Import vault" }).click();
  await secrets.getByLabel("Vault file").setInputFiles({ name: "wayfarer-vault.json", mimeType: "application/json", buffer: Buffer.from(file) });
  await secrets.getByLabel("Passphrase of the file").fill(PASSPHRASE);
  await secrets.getByRole("button", { name: "Import", exact: true }).click();
  await expect(secrets.getByText("Imported 1 secret.")).toBeVisible();

  // Under the id it had: the environment's variable finds it again.
  await expect(secrets.getByRole("button", { name: /Locate API_TOKEN in environment Vault env/ })).toBeVisible();
  await secrets.getByRole("button", { name: "Reveal value for API_TOKEN" }).click();
  await expect(secrets.getByText("exported-encrypted-7c1")).toBeVisible();
  expect(await violations(page)).toEqual([]);
});
