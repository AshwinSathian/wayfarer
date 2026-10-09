import { test, expect, type Page } from "@playwright/test";
import { ECHO } from "./support/echo";
import { dumpIdb, seedAndOpen, send } from "./support/app";

// Tests that back public claims in README.md and docs/trust-center.md
// (ledger: docs/claims.md, gate: scripts/check-claims.mjs). Each title
// carries its claim ID. They run in the retry-free claims-* projects.

const PASSPHRASE = "correct horse battery staple";

interface TrustedTypesFactory {
  createPolicy(name: string, options: { createScript(s: string): string }): { createScript(s: string): string };
}

/** Creates an environment with one protected variable holding `plaintext`, saved. */
async function protectVariable(page: Page, plaintext: string): Promise<void> {
  await page.getByRole("button", { name: "New environment" }).click();
  await page.locator("#new-env-name-input").fill("Claims env");
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByRole("button", { name: "Add variable" }).click();
  await page.getByPlaceholder("KEY", { exact: true }).fill("API_TOKEN");
  await page.getByPlaceholder("Value", { exact: true }).fill(plaintext);
  await page.getByRole("button", { name: "Mark variable as secret" }).click();
  const inputs = page.locator("input[type='password']");
  await inputs.nth(0).fill(PASSPHRASE);
  await inputs.nth(1).fill(PASSPHRASE);
  await page.getByRole("button", { name: "Create vault" }).click();
  await expect(page.getByRole("button", { name: "Lock secrets" })).toBeVisible();
  await page.getByRole("button", { name: "Mark variable as secret" }).click();
  await expect(page.getByText("Secret stored")).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
}

/** Everything the app persisted in this origin: IndexedDB, localStorage, sessionStorage. */
async function persistedText(page: Page): Promise<string> {
  const idb = await dumpIdb(page);
  const web = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
  return JSON.stringify(idb) + web;
}

test("@claim:C-002 collections, environments and history are stored in this browser's IndexedDB", async ({ page }) => {
  await seedAndOpen(page, { host: ECHO }, { method: "GET", url: `${ECHO}/content/json?c002=1` });
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");

  await expect.poll(async () => (await dumpIdb(page))["history"]?.length ?? 0).toBeGreaterThan(0);
  const db = await dumpIdb(page);
  expect(JSON.stringify(db["collections"])).toContain("Tripwire collection");
  expect(JSON.stringify(db["environments"])).toContain(ECHO);
  expect(JSON.stringify(db["history"])).toContain("c002=1");
});

test("@claim:C-003 a vault value is stored only as ciphertext; nothing persisted holds the plaintext", async ({ page }) => {
  const plaintext = "c003-plaintext-9f2b7e";
  await page.goto("/");
  await protectVariable(page, plaintext);
  await expect.poll(async () => (await dumpIdb(page))["secrets"]?.length ?? 0).toBe(1);

  const [secret] = (await dumpIdb(page))["secrets"] as { envelope: { v: number; iv: string; ct: string } }[];
  expect(Object.keys(secret.envelope).sort()).toEqual(["ct", "iv", "v"]);
  expect(secret.envelope.v).toBe(2);
  expect(await persistedText(page)).not.toContain(plaintext);
});

test("@claim:C-005 the vault key is held in memory only: a reload locks the vault", async ({ page }) => {
  await page.goto("/");
  await protectVariable(page, "c005-plaintext-41d0aa");
  await page.reload();
  await expect(page.getByRole("button", { name: "Unlock secrets" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lock secrets", exact: true })).toHaveCount(0);
});

test("@claim:C-008 history stores what was sent with its credentials masked, also where the server sent them back", async ({ page }) => {
  await seedAndOpen(page, {}, {
    method: "GET",
    url: `${ECHO}/echo?c008=1`,
    headers: { "X-Api-Key": "c008-header-key" },
    auth: { type: "bearer", token: "c008-token-value" },
  });
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  // The echo-server sent both back.

  await expect.poll(async () => (await dumpIdb(page))["history"]?.length ?? 0).toBe(1);
  const [entry] = (await dumpIdb(page))["history"] as { sent: { url: string; headers: [string, string][] }; response: { body: { text: string } } }[];
  expect(entry.sent.url).toBe(`${ECHO}/echo?c008=1`);
  expect(entry.sent.headers).toContainEqual(["Authorization", "***"]);
  expect(entry.sent.headers).toContainEqual(["X-Api-Key", "***"]);
  expect(entry.response.body.text).toContain("***");
  // The saved request holds what was typed, as collections do (C-003). History does not.
  expect(JSON.stringify((await dumpIdb(page))["history"])).not.toMatch(/c008-token-value|c008-header-key/);
});

test("@claim:C-014 a collection export masks credentials unless that export asks for them", async ({ page }) => {
  await seedAndOpen(page, {}, {
    method: "GET",
    url: `${ECHO}/echo`,
    auth: { type: "bearer", token: "c014-token-value" },
  });
  await page.getByText("Tripwire collection", { exact: true }).click({ button: "right" });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Export", exact: true }).click(),
  ]);
  const text = async (file: typeof download) => {
    const chunks: Buffer[] = [];
    for await (const chunk of await file.createReadStream()) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  };
  const masked = await text(download);
  expect(masked).not.toContain("c014-token-value");
  expect(masked).toContain('"token": "***"');

  await page.getByText("Tripwire collection", { exact: true }).click({ button: "right" });
  const [whole] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Export with credentials" }).click(),
  ]);
  expect(await text(whole)).toContain("c014-token-value");
});

test("@claim:C-011 the CSP forbids eval and inline script, and blocks an injected inline script", async ({ page, request }) => {
  const response = await page.goto("/");
  const scriptSrc = (policy: string | undefined) =>
    (policy ?? "").split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src ")) ?? "";

  const header = response?.headers()["content-security-policy"];
  const meta = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  const workerPath = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => new URL(e.name).pathname).find((p) => /\.js$/.test(p)));
  const asset = await request.get(workerPath ?? "/main.js");
  for (const policy of [header, meta ?? undefined, asset.headers()["content-security-policy"]]) {
    expect(scriptSrc(policy)).toMatch(/^script-src /);
    expect(scriptSrc(policy)).not.toMatch(/'unsafe-eval'|'unsafe-inline'|\*|data:|blob:/);
  }

  const outcome = await page.evaluate(async () => {
    const violation = new Promise<string>((resolve) =>
      document.addEventListener("securitypolicyviolation", (e) => resolve(e.effectiveDirective), { once: true })
    );
    // Trusted Types (C-016) would already refuse the string; approve it with a
    // throwaway policy so this checks that script-src blocks it on its own.
    const factory = (window as unknown as { trustedTypes?: TrustedTypesFactory }).trustedTypes;
    const code = "window.__c011 = true";
    const script = document.createElement("script");
    script.textContent = factory ? factory.createPolicy("c011-test", { createScript: (s) => s }).createScript(code) : code;
    document.head.append(script);
    return { directive: await violation, ran: (window as unknown as { __c011?: boolean }).__c011 === true };
  });
  expect(outcome.ran).toBe(false);
  expect(outcome.directive).toMatch(/^script-src/);
});
