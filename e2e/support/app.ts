import { expect, type Locator, type Page, type Request, type Response } from "@playwright/test";

// Shared e2e helpers: a Playwright-routed fake target, IndexedDB seeding, and
// IndexedDB inspection. Moved from e2e/tripwire.spec.ts (P1.4) so claim tests
// can reuse them.

export const TARGET = "https://tripwire.test";

export async function expectProdParity(response: Response | null): Promise<void> {
  expect(
    response?.headers()["content-security-policy"],
    "tripwire needs the prod build on prod-server.mjs; run with CI=1",
  ).toContain("script-src 'self'");
}

/** Routes TARGET (or another host) to a CORS-permissive fake and records every non-preflight request that reaches it. */
export async function captureTarget(
  page: Page,
  reply: { contentType: string; body: string | Buffer } = {
    contentType: "application/json",
    body: '{"ok":true}',
  },
  target = TARGET,
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
  /** As stored; an empty list when absent. */
  params?: { key: string; value: string; enabled: boolean }[];
  /** What the request's collection holds for it (P4.9), as stored. Its scripts count as written here, like the request's. */
  collection?: { auth?: unknown; scripts?: { pre: string; post: string }; variables?: Record<string, string> };
  /** Puts the request in a folder that holds this. */
  folder?: { auth?: unknown; scripts?: { pre: string; post: string }; variables?: Record<string, string> };
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
  base = "",
): Promise<Response | null> {
  await page.goto(`${base}/app/`);
  await expect(page.locator("input.address-url")).toBeVisible();
  await page.waitForFunction(async () =>
    (await indexedDB.databases()).some((db) => db.name === "wayfarer" && db.version === 2),
  );
  await page.evaluate(
    async ({ vars, request }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open("wayfarer");
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const read = db.transaction("meta").objectStore("meta").get("state");
      const state = await new Promise((resolve) => (read.onsuccess = () => resolve(read.result)));
      const now = Date.now();
      const meta = (id: string) => ({ id, createdAt: now, updatedAt: now });
      // The scripts of a seeded request stand for scripts written here: the collection holds their digests (P3.8).
      const digest = async (text: string) =>
        Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
      const scripts = { pre: request.preRequestScript ?? "", post: request.postRequestScript ?? "" };
      const none = { pre: "", post: "" };
      const inherited = [request.collection?.scripts ?? none, request.folder?.scripts ?? none];
      const approved = await Promise.all(
        [scripts, ...inherited]
          .flatMap((held) => [held.pre, held.post])
          .filter((script) => script.trim())
          .map(digest),
      );
      const tx = db.transaction(["environments", "collections", "folders", "requests", "meta"], "readwrite");
      const rows = (record: Record<string, string>) =>
        Object.entries(record).map(([key, value]) => ({ key, value, enabled: true }));
      tx.objectStore("environments").put({
        id: "env-tw",
        meta: meta("env-tw"),
        name: "Tripwire env",
        vars: rows(vars),
        order: 0,
      });
      tx.objectStore("meta").put({ ...(state ?? {}), key: "state", activeEnvironmentId: "env-tw" });
      tx.objectStore("collections").put({
        id: "col-tw",
        meta: meta("col-tw"),
        name: "Tripwire collection",
        order: 0,
        variables: rows(request.collection?.variables ?? {}),
        auth: request.collection?.auth ?? { type: "none" },
        scripts: inherited[0],
        scriptTrust: approved.length ? { trusted: true, approved } : { trusted: true },
      });
      if (request.folder) {
        tx.objectStore("folders").put({
          id: "fol-tw",
          meta: meta("fol-tw"),
          collectionId: "col-tw",
          name: "Tripwire folder",
          order: 0,
          variables: rows(request.folder.variables ?? {}),
          auth: request.folder.auth ?? { type: "inherit" },
          scripts: inherited[1],
        });
      }
      tx.objectStore("requests").put({
        id: "req-tw",
        meta: meta("req-tw"),
        collectionId: "col-tw",
        ...(request.folder && { folderId: "fol-tw" }),
        name: "Tripwire request",
        order: 0,
        method: request.method,
        url: request.url,
        params: request.params ?? [],
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
    { vars, request },
  );
  const response = await page.reload();
  if (request.folder) await openFolder(page, "Tripwire folder");
  await page.getByRole("tree").getByText("Tripwire request", { exact: true }).click();
  await expect(page.locator("input.address-url")).toHaveValue(request.url);
  return response;
}

/** A folder starts closed: opens it from the keyboard, as a user would with the row selected. */
export async function openFolder(page: Page, name: string): Promise<void> {
  await page.getByText(name, { exact: true }).click();
  await page.keyboard.press("ArrowRight");
}

/**
 * Opens Settings from the toolbar and, when one is named, the section's pane
 * from the list, as a user does at any width. Gives back the dialog.
 */
export async function openSettings(page: Page, section?: string): Promise<Locator> {
  await page.getByRole("banner").getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog).toBeVisible();
  if (section) {
    await dialog
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: section, exact: true })
      .click();
    await expect(dialog.getByRole("heading", { name: section, exact: true })).toBeVisible();
  }
  return dialog;
}

export const PASSPHRASE = "correct horse battery staple";

/** Adds a protected variable to the open environment, making the vault on the way. */
const METHOD_TAG = "(?:GET|POST|PUT|PATCH|DEL|HEAD|OPT) ";

/** A row of the collections tree by its name. A request's row is named as it reads, its method first ("GET Clicked"). */
export function treeRow(scope: Page | Locator, name: string): Locator {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return scope.getByRole("treeitem", { name: new RegExp(`^(?:${METHOD_TAG})?${escaped}$`) });
}

/** A row's accessible name without a request's method: what the row is called. */
export function withoutMethod(name: string): string {
  return name.replace(new RegExp(`^${METHOD_TAG}`), "");
}

/** Opens the environments editor, a dialog of its own, and gives it. */
/** Opens the Environments tab (D4.5) and gives back its region. */
export async function openEnvironments(page: Page): Promise<Locator> {
  const region = page.getByRole("region", { name: "Environments", exact: true });
  if (!(await region.isVisible())) await toolbarOrDrawer(page, "Environments");
  await expect(region).toBeVisible();
  return region;
}

/** Closes the Environments tab; the request tab beside it is open again. */
export async function closeEnvironments(page: Page): Promise<void> {
  const tab = page.getByRole("tablist", { name: "Open requests" }).getByRole("tab", { name: /Environments/ });
  await tab.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Close tab", exact: true }).click();
  await expect(page.getByRole("region", { name: "Environments", exact: true })).toHaveCount(0);
}

/** Opens a collection's or a folder's settings tab (D5-e) from its row's menu in the tree. */
export async function openHolderSettings(
  page: Page,
  name: string,
  kind: "Collection" | "Folder" = "Collection",
): Promise<Locator> {
  await page.getByRole("tree").getByText(name, { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: `${kind} settings…` }).click();
  const region = page.getByRole("region", { name: `${kind} settings: ${name}` });
  await expect(region).toBeVisible();
  return region;
}

/** Closes a collection's or a folder's settings tab; what was typed in it is written as it closes. */
export async function closeHolderSettings(page: Page, name: string): Promise<void> {
  const tab = page
    .getByRole("tablist", { name: "Open requests" })
    .getByRole("tab", { name: new RegExp(`settings ${name}`) });
  await tab.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Close tab", exact: true }).click();
  await expect(page.getByRole("region", { name: new RegExp(`settings: ${name}$`) })).toHaveCount(0);
}

/** In the open environment, a protected variable holding `plaintext`, saved; the vault is made for it. The editor is closed after. */
export async function protectVariable(page: Page, name: string, plaintext: string): Promise<void> {
  await openEnvironments(page);
  const keys = page.getByPlaceholder("Name", { exact: true });
  const before = await keys.count();
  await page.getByRole("button", { name: "Add variable" }).click();
  await expect(keys).toHaveCount(before + 1);
  await keys.last().fill(name);
  await page.getByPlaceholder("Value", { exact: true }).last().fill(plaintext);
  await page
    .getByRole("button", { name: /^Mark .* as secret$/ })
    .last()
    .click();
  // With no vault, the row asks for its passphrase in place and marks the variable once it is made.
  const dialog = page.getByRole("region", { name: "Environments", exact: true });
  await dialog.getByLabel("Passphrase", { exact: true }).fill(PASSPHRASE);
  await dialog.getByLabel("Confirm passphrase", { exact: true }).fill(PASSPHRASE);
  await dialog.getByRole("button", { name: "Create vault" }).click();
  await expect(page.getByText("Secret stored")).toBeVisible();
  await closeEnvironments(page);
  await expect(page.getByRole("button", { name: "Vault unlocked", exact: true })).toBeVisible();
}

/** Opens the request's Network tab: its route, redirects, certificate check and what the browser does to it. */
export async function openRequestSettings(page: Page): Promise<void> {
  await page.locator("app-composer").getByRole("tab", { name: "Network", exact: true }).click();
}

export async function send(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Send request" }).click();
}

/** Every record in every object store of the app's IndexedDB, keyed by store name. */
export async function dumpIdb(page: Page): Promise<Record<string, unknown[]>> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("wayfarer");
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

/** Chooses an item of the sidebar's Import menu (U-010): "File…" or "cURL command…". */
export async function importMenu(page: Page, item: "File…" | "cURL command…"): Promise<void> {
  await page.locator("app-collections-sidebar").getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

/** Opens the palette from the toolbar's search (U-011) and gives back its field. */
export async function openPalette(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Search or run a command", exact: true }).click();
  const field = page.getByRole("combobox", { name: /^Search requests/ });
  await expect(field).toBeFocused();
  return field;
}

/** Chooses an item of the open tab's menu (right-click on the tab): Close tab, Duplicate tab, Rename (U-027). */
export async function tabMenu(page: Page, item: string): Promise<void> {
  await page
    .getByRole("tablist", { name: "Open requests" })
    .getByRole("tab", { selected: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

/** Exports a collection through its one Export… dialog (U-016) and gives back the file's text. */
export async function exportCollectionFile(
  page: Page,
  collection: string,
  options: { format?: "Wayfarer" | "Postman v2.1"; credentials?: boolean } = {},
): Promise<string> {
  await page.getByRole("tree").getByText(collection, { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Export…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `Export ${collection}` });
  await expect(dialog).toBeVisible();
  if (options.format) await dialog.getByRole("radio", { name: options.format }).check();
  if (options.credentials) await dialog.getByRole("checkbox", { name: "Include credentials" }).check();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Export file" }).click(),
  ]);
  await expect(dialog).toBeHidden();
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Clicks a control the toolbar holds from 768 px and the navigation drawer holds on a phone (U-097): Environments,
 * History.
 */
export async function toolbarOrDrawer(page: Page, name: "Environments" | "History"): Promise<void> {
  const inToolbar = page.getByRole("banner").getByRole("button", { name, exact: true });
  if (await inToolbar.count()) return inToolbar.click();
  await page.getByRole("button", { name: /^(Show|Hide) sidebar$/ }).click();
  await page.getByRole("dialog", { name: "Navigation" }).getByRole("button", { name, exact: true }).click();
}
