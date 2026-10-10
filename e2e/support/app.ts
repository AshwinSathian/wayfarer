import { expect, type Page, type Request, type Response } from "@playwright/test";

// Shared e2e helpers: a Playwright-routed fake target, IndexedDB seeding, and
// IndexedDB inspection. Moved from e2e/tripwire.spec.ts (P1.4) so claim tests
// can reuse them.

export const TARGET = "https://tripwire.test";

export async function expectProdParity(response: Response | null): Promise<void> {
  expect(
    response?.headers()["content-security-policy"],
    "tripwire needs the prod build on prod-server.mjs; run with CI=1"
  ).toContain("script-src 'self'");
}

/** Routes TARGET (or another host) to a CORS-permissive fake and records every non-preflight request that reaches it. */
export async function captureTarget(
  page: Page,
  reply: { contentType: string; body: string | Buffer } = {
    contentType: "application/json",
    body: '{"ok":true}',
  },
  target = TARGET
): Promise<Request[]> {
  const hits: Request[] = [];
  await page.route(`${target}/**`, async (route) => {
    const request = route.request();
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "*",
      "access-control-allow-headers": request.headers()["access-control-request-headers"] ?? "*",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    hits.push(request);
    await route.fulfill({
      status: 200,
      headers: { ...cors, "content-type": reply.contentType },
      body: reply.body,
    });
  });
  return hits;
}

/** A request as a test states it: headers by name, the body as a JSON value. */
export interface SeededRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** The body as stored, for the modes that are not JSON text. Wins over `body`. */
  storedBody?: unknown;
  /** As stored: `{type: "bearer", token}` and so on. */
  auth?: unknown;
  preRequestScript?: string;
  postRequestScript?: string;
  tests?: unknown[];
}

/**
 * Writes an active environment and a one-request collection straight into
 * IndexedDB (after the app has created and migrated the database), reloads,
 * and opens the request in the composer. Seeding avoids driving Monaco for
 * scripts and nested JSON bodies.
 */
export async function seedAndOpen(
  page: Page,
  vars: Record<string, string>,
  request: SeededRequest,
  /** The app's address when it is not the configured one (a spec that runs its own server). */
  base = ""
): Promise<Response | null> {
  await page.goto(`${base}/`);
  await expect(page.locator("input.address-url")).toBeVisible();
  await page.waitForFunction(async () =>
    (await indexedDB.databases()).some((db) => db.name === "api-sandbox" && (db.version ?? 0) >= 5)
  );
  await page.evaluate(
    async ({ vars, request }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open("api-sandbox");
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const read = db.transaction("meta").objectStore("meta").get("state");
      const state = await new Promise((resolve) => (read.onsuccess = () => resolve(read.result)));
      const now = Date.now();
      const meta = (id: string) => ({ id, createdAt: now, updatedAt: now, version: 1 });
      // The scripts of a seeded request stand for scripts written here: the collection holds their digests (P3.8).
      const digest = async (text: string) =>
        Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const scripts = { pre: request.preRequestScript ?? "", post: request.postRequestScript ?? "" };
      const approved = await Promise.all([scripts.pre, scripts.post].filter((script) => script.trim()).map(digest));
      const tx = db.transaction(["environments", "collections", "requests", "meta"], "readwrite");
      const rows = (record: Record<string, string>) =>
        Object.entries(record).map(([key, value]) => ({ key, value, enabled: true }));
      tx.objectStore("environments").put({ id: "env-tw", meta: meta("env-tw"), name: "Tripwire env", vars: rows(vars), order: 0 });
      tx.objectStore("meta").put({ schemaVersion: 1, ...(state ?? {}), key: "state", activeEnvironmentId: "env-tw" });
      tx.objectStore("collections").put({
        id: "col-tw",
        meta: meta("col-tw"),
        name: "Tripwire collection",
        order: 0,
        variables: [],
        scriptTrust: approved.length ? { trusted: true, approved } : { trusted: true },
      });
      tx.objectStore("requests").put({
        id: "req-tw",
        meta: meta("req-tw"),
        collectionId: "col-tw",
        name: "Tripwire request",
        order: 0,
        method: request.method,
        url: request.url,
        params: [],
        headers: rows(request.headers ?? {}),
        body:
          request.storedBody ??
          (request.body === undefined
            ? { mode: "none" }
            : { mode: "raw", raw: { language: "json", text: JSON.stringify(request.body, null, 2) } }),
        auth: request.auth ?? { type: "none" },
        scripts,
        tests: request.tests ?? [],
        settings: {},
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { vars, request }
  );
  const response = await page.reload();
  await page.getByText("Tripwire request", { exact: true }).dblclick();
  await expect(page.locator("input.address-url")).toHaveValue(request.url);
  return response;
}

export const PASSPHRASE = "correct horse battery staple";

/** Adds a protected variable to the open environment, making the vault on the way. */
export async function protectVariable(page: Page, name: string, plaintext: string): Promise<void> {
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

export async function send(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Send request" }).click();
}

/** Every record in every object store of the app's IndexedDB, keyed by store name. */
export async function dumpIdb(page: Page): Promise<Record<string, unknown[]>> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("api-sandbox");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const out: Record<string, unknown[]> = {};
    for (const name of Array.from(db.objectStoreNames)) {
      const all = db.transaction(name).objectStore(name).getAll();
      out[name] = await new Promise((resolve, reject) => {
        all.onsuccess = () => resolve(all.result);
        all.onerror = () => reject(all.error);
      });
    }
    db.close();
    return out;
  });
}
