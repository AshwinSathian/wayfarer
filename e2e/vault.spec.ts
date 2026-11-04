import { expect, test, type Page } from "@playwright/test";
import { closeEnvironments, openEnvironments, openSettings } from "./support/app";
import { ECHO } from "./support/echo";

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

// Before a vault is made it says so (U-164); after, it is locked until unlocked.
const unlockButton = (page: Page) => page.getByRole("button", { name: /^(Vault locked|No vault)$/ });
const lockButton = (page: Page) => page.getByRole("button", { name: "Vault unlocked", exact: true });

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
  const dialog = page.getByRole("dialog", { name: "Unlock vault", exact: true });
  await dialog.locator("input[type='password']").fill(passphrase);
  await dialog.getByRole("button", { name: "Unlock vault" }).click();
}

/** An environment with one protected variable, saved. The vault must be unlocked. */
async function protect(page: Page, name: string, plaintext: string): Promise<void> {
  await openEnvironments(page);
  await page.getByRole("button", { name: "New environment" }).first().click();
  await page.locator("#new-env-name-input").fill("Vault env");
  await page.locator("#new-env-name-input").press("Enter");
  await page.getByRole("button", { name: "Add variable" }).click();
  await page.getByPlaceholder("Name", { exact: true }).fill(name);
  await page
    .getByRole("region", { name: "Environments", exact: true })
    .getByPlaceholder("Value", { exact: true })
    .fill(plaintext);
  await page.getByRole("button", { name: /^Mark .* as secret$/ }).click();
  await expect(page.getByText("Secret stored")).toBeVisible();
  await closeEnvironments(page);
}

test("a wrong passphrase is refused when the vault holds no secret", async ({ page }) => {
  await watchViolations(page);
  await page.goto("/app/");
  await createVault(page);
  await lockButton(page).click();

  await unlock(page, "not the passphrase");
  await expect(page.getByRole("alert").filter({ hasText: "That passphrase does not open the vault." })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
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
  await pageA.goto("/app/");
  await pageB.goto("/app/");
  await createVault(pageA);
  await unlock(pageB, PASSPHRASE);
  await expect(lockButton(pageB)).toBeVisible();

  await lockButton(pageA).click();

  await expect(unlockButton(pageB)).toBeVisible({ timeout: 1000 });
});

test("@claim:C-005 the vault locks itself after the idle time: set to 1 minute, it is locked 61 seconds later", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/app/");
  await openSettings(page, "Vault");
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
  await page.goto("/app/");
  await createVault(page);
  await protect(page, "API_TOKEN", "rotation-keeps-me");

  await page.getByRole("button", { name: "Secrets", exact: true }).click();
  const secrets = page.getByRole("dialog", { name: "Secrets", exact: true });
  await secrets.getByRole("button", { name: "Change passphrase" }).click();
  await secrets.getByLabel("Current passphrase").fill("not the passphrase");
  await secrets.getByLabel("New passphrase", { exact: true }).fill("a new passphrase");
  await secrets.getByLabel("Confirm new passphrase").fill("a new passphrase");
  await secrets.getByRole("button", { name: "Change passphrase" }).last().click();
  await expect(
    secrets.getByRole("alert").filter({ hasText: "That is not the vault's passphrase. Nothing was changed." }),
  ).toBeVisible();

  await secrets.getByLabel("Current passphrase").fill(PASSPHRASE);
  await secrets.getByRole("button", { name: "Change passphrase" }).last().click();
  await expect(secrets.getByText("Passphrase changed. The old one no longer opens the vault.")).toBeVisible();
  // The form's button is gone: focus is back on the one that opened it, so Escape reaches the dialog.
  await expect(secrets.getByRole("button", { name: "Change passphrase" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(secrets).toHaveCount(0);

  await lockButton(page).click();
  await unlock(page, PASSPHRASE);
  await expect(page.getByRole("alert").filter({ hasText: "That passphrase does not open the vault." })).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "Unlock vault", exact: true });
  await dialog.locator("input[type='password']").fill("a new passphrase");
  await dialog.getByRole("button", { name: "Unlock vault" }).click();
  await expect(lockButton(page)).toBeVisible();

  await page.getByRole("button", { name: "Secrets", exact: true }).click();
  await secrets.getByRole("button", { name: "Reveal value for API_TOKEN" }).click();
  await expect(secrets.getByText("rotation-keeps-me")).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("the vault is exported as a file without any plaintext, and a secret deleted since comes back from it", async ({
  page,
}) => {
  await watchViolations(page);
  await page.goto("/app/");
  await createVault(page);
  await protect(page, "API_TOKEN", "exported-encrypted-7c1");

  await page.getByRole("button", { name: "Secrets", exact: true }).click();
  const secrets = page.getByRole("dialog", { name: "Secrets", exact: true });
  await secrets.getByRole("button", { name: "Export vault" }).click();
  await secrets.getByLabel("Current passphrase").fill(PASSPHRASE);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    secrets.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  const file = Buffer.concat(chunks).toString("utf8");
  expect(file).toContain('"$id": "wayfarer/vault"');
  expect(file).not.toContain("exported-encrypted-7c1");
  expect(file).not.toContain(PASSPHRASE);

  await secrets.getByRole("button", { name: "Delete API_TOKEN" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(secrets.getByText("Secrets you mark in Environments are kept here.")).toBeVisible();
  // The deleted row's button is gone: focus stays in the dialog.
  await expect(secrets.getByRole("button", { name: "Change passphrase" })).toBeFocused();

  await secrets.getByRole("button", { name: "Import vault" }).click();
  await secrets
    .getByLabel("Vault file")
    .setInputFiles({ name: "wayfarer-vault.json", mimeType: "application/json", buffer: Buffer.from(file) });
  await secrets.getByLabel("Passphrase of the file").fill(PASSPHRASE);
  await secrets.getByRole("button", { name: "Import", exact: true }).click();
  await expect(secrets.getByText("Imported 1 secret.")).toBeVisible();

  // Under the id it had: the environment's variable finds it again.
  await expect(secrets.getByRole("button", { name: "Vault env.API_TOKEN", exact: true })).toBeVisible();
  await secrets.getByRole("button", { name: "Reveal value for API_TOKEN" }).click();
  await expect(secrets.getByText("exported-encrypted-7c1")).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

// U-143: the passphrase asked for by a send says which send and which secret want it.
test("a send with the vault locked asks for the passphrase naming the request's secret", async ({ page }) => {
  await page.goto("/app/");
  await createVault(page);
  await protect(page, "token", "locked-send-secret-77");
  await page.locator("input.address-url").fill(`${ECHO}/echo?t={{token}}`);
  await lockButton(page).click();
  await expect(unlockButton(page)).toBeVisible();
  await page.getByRole("button", { name: "Send request" }).click();
  const dialog = page.getByRole("dialog", { name: "Unlock vault", exact: true });
  await expect(dialog).toContainText("Sending this request needs token from the vault.");
  await dialog.getByLabel("Passphrase", { exact: true }).fill(PASSPHRASE);
  await dialog.getByRole("button", { name: "Unlock vault" }).click();
  await expect(page.locator(".status-badge")).toHaveText("200");
});

// U-164: before any vault was made the app said "Vault locked" (the status bar), "Vault is locked" (Secrets) and "The
// vault is locked" (Settings), offering Change passphrase and Export vault for a vault that was not there.
test("before a vault is made, the app says there is none, and offers to make one", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const status = page.getByRole("button", { name: "No vault", exact: true });
  await expect(status).toBeVisible();
  await expect(page.getByRole("button", { name: "Vault locked", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Secrets", exact: true }).click();
  const secrets = page.getByRole("dialog", { name: "Secrets" });
  await expect(secrets.getByText("No vault yet.", { exact: false })).toBeVisible();
  await expect(secrets.getByRole("button", { name: "Change passphrase" })).toHaveCount(0);
  await expect(secrets.getByRole("button", { name: "Export vault" })).toHaveCount(0);
  await secrets.getByRole("button", { name: "Create vault" }).click();
  await expect(page.getByRole("dialog", { name: "Create vault passphrase" })).toBeVisible();
});
