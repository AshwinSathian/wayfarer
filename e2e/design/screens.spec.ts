import { expect, test, type Locator, type Page } from "@playwright/test";
import { openEnvironments, openSettings, PASSPHRASE, send } from "../support/app";
import { ECHO } from "../support/echo";
import { SCREENS_INDEX, WIDTHS, type ScreenId } from "./screens";

// D0.1 of PLAN-design.md: every screen of the index (screens.ts) at four widths, in both themes, as a
// `toHaveScreenshot` baseline (section 10). It runs in the design-* projects only, a CI job of its own
// that does not fail the build. The snapshots are Linux's: take them in Playwright's Docker image
// (docs/design/baseline/index.md says how).

// A service worker takes control of the page sooner or later, and Diagnostics says which: none here.
test.use({ serviceWorkers: "block" });

const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1 });
const rows = (record: Record<string, string>) =>
  Object.entries(record).map(([key, value]) => ({ key, value, enabled: true }));
const button = (scope: Page | Locator, name: string) => scope.getByRole("button", { name, exact: true });
const address = (page: Page) => page.locator("input.address-url");
const composer = (page: Page) => page.locator("app-composer");
const viewer = (page: Page) => page.locator("app-response-viewer");

/** A request as the store holds it. */
function request(
  id: string,
  name: string,
  method: string,
  url: string,
  extra: { folderId?: string; order?: number; body?: unknown; scripts?: { pre: string; post: string } } = {},
) {
  return {
    id,
    meta: meta(id),
    collectionId: "col-pets",
    ...(extra.folderId && { folderId: extra.folderId }),
    name,
    order: extra.order ?? 0,
    method,
    url,
    params: [],
    headers: rows({ Accept: "application/json" }),
    body: extra.body ?? { mode: "none" },
    auth: { type: "none" },
    scripts: extra.scripts ?? { pre: "", post: "" },
    tests: [{ id: `t-${id}`, target: "status", operator: "equals", expected: "200" }],
    settings: {},
  };
}

const POST_SCRIPT = 'pm.test("the body is JSON", () => pm.response.json());';

/** A workspace with something in it: two environments (one active, with rows) and a collection of folders and requests. */
async function seed(page: Page): Promise<void> {
  await page.goto("/app/");
  await expect(address(page)).toBeVisible();
  await page.waitForFunction(async () =>
    (await indexedDB.databases()).some((db) => db.name === "wayfarer" && db.version === 2),
  );
  const digest = await page.evaluate(async (text) => {
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }, POST_SCRIPT);
  const data = {
    environments: [
      {
        id: "env-staging",
        meta: meta("env-staging"),
        name: "Staging",
        order: 0,
        vars: rows({ baseUrl: ECHO, petId: "42", apiVersion: "v2", region: "eu-west-1" }),
      },
      { id: "env-local", meta: meta("env-local"), name: "Local", order: 1, vars: rows({ baseUrl: ECHO }) },
    ],
    collections: [
      {
        id: "col-pets",
        meta: meta("col-pets"),
        name: "Pet store",
        order: 0,
        variables: rows({ owner: "ada" }),
        auth: { type: "none" },
        scripts: { pre: "", post: "" },
        scriptTrust: { trusted: true, approved: [digest] },
      },
    ],
    folders: [
      {
        id: "fol-pets",
        meta: meta("fol-pets"),
        collectionId: "col-pets",
        name: "Pets",
        order: 0,
        variables: [],
        auth: { type: "inherit" },
        scripts: { pre: "", post: "" },
      },
    ],
    requests: [
      request("req-list", "List pets", "GET", "{{baseUrl}}/content/json?kind=pets", {
        folderId: "fol-pets",
        scripts: { pre: "", post: POST_SCRIPT },
      }),
      request("req-add", "Add a pet", "POST", "{{baseUrl}}/echo", {
        folderId: "fol-pets",
        order: 1,
        body: { mode: "raw", raw: { language: "json", text: '{\n  "name": "Rex",\n  "kind": "dog"\n}' } },
      }),
      request("req-delete", "Remove a pet", "DELETE", "{{baseUrl}}/echo/{{petId}}", { folderId: "fol-pets", order: 2 }),
      request("req-health", "Health", "GET", "{{baseUrl}}/status/200", { order: 1 }),
    ],
  };
  await page.evaluate(async (data) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("wayfarer");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const read = db.transaction("meta").objectStore("meta").get("state");
    const state = await new Promise((resolve) => (read.onsuccess = () => resolve(read.result)));
    const tx = db.transaction(["environments", "collections", "folders", "requests", "meta"], "readwrite");
    for (const [store, records] of Object.entries(data))
      for (const record of records) tx.objectStore(store).put(record);
    tx.objectStore("meta").put({ ...(state ?? {}), key: "state", activeEnvironmentId: "env-staging" });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, data);
  await page.reload();
  await expect(address(page)).toBeVisible();
}

/** The collections tree: in the drawer below 1,200 px, which this opens. */
async function tree(page: Page): Promise<Locator> {
  const found = page.getByRole("tree");
  if (!(await page.locator("app-collections-sidebar").isVisible())) {
    await button(page, "Toggle sidebar").click();
    await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  }
  return found;
}

async function openRequest(page: Page, name: string, parent = "Pets"): Promise<void> {
  const rows = await tree(page);
  await expect(rows.getByText(parent, { exact: true })).toBeVisible();
  if (!(await rows.getByText(name, { exact: true }).isVisible())) {
    await rows.getByText(parent, { exact: true }).click();
  }
  await rows.getByText(name, { exact: true }).click();
  // A click on a request closes the drawer; the request is in the composer.
  await expect(address(page)).not.toHaveValue("");
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  if (await drawer.isVisible()) await button(drawer, "Close navigation").click();
}

async function sendAndWait(page: Page): Promise<void> {
  await send(page);
  await expect(page.locator(".status-badge")).toBeVisible({ timeout: 15_000 });
}

/** A part of the request: a tab, or below 768 px a section of the stacked composer, opened and scrolled to the top. */
async function composerTab(page: Page, name: string): Promise<void> {
  const tab = composer(page).getByRole("tab", { name, exact: true });
  if (await tab.isVisible()) {
    await tab.click();
    return;
  }
  const section = composer(page).locator("button.section-header", { hasText: name });
  if ((await section.getAttribute("aria-expanded")) !== "true") await section.click();
  // A section with an editor loads it when first opened, and grows when it has.
  await page.waitForLoadState("networkidle");
  await quiet(page);
  await still(page);
  await section.evaluate((element) => element.scrollIntoView({ block: "start" }));
}

async function responseTab(page: Page, name: string): Promise<void> {
  await viewer(page)
    .getByRole("tab", { name: new RegExp(`^${name}`) })
    .click();
}

async function sidebarHeaderButton(page: Page, name: string): Promise<void> {
  await tree(page);
  await button(page.locator("app-collections-sidebar"), name).click();
}

async function contextMenu(page: Page, row: string): Promise<void> {
  await (await tree(page)).getByText(row, { exact: true }).click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
}

async function importFile(page: Page): Promise<void> {
  await page.locator('app-collections-sidebar input[type="file"]').setInputFiles({
    name: "shared.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        $id: "wayfarer/collection",
        meta: meta("file"),
        collection: {
          id: "col-shared",
          meta: meta("col-shared"),
          name: "Shared collection",
          order: 0,
          variables: [],
          auth: { type: "none" },
          scripts: { pre: "pm.vault.get('k')", post: "" },
        },
        folders: [],
        requests: [
          {
            ...request("req-shared", "Shared request", "GET", `${ECHO}/content/json`, {
              scripts: { pre: 'pm.environment.set("seen", "yes");', post: POST_SCRIPT },
            }),
            collectionId: "col-shared",
          },
        ],
      }),
    ),
  });
  await expect(page.getByRole("dialog", { name: "Import collection" })).toBeVisible();
}

async function settingsPane(page: Page, section: string): Promise<void> {
  await page.goto("/app/");
  await expect(address(page)).toBeVisible();
  await openSettings(page, section);
}

/** Marks an environment's variable secret, which asks for the vault's passphrase first. */
async function makeVault(page: Page): Promise<void> {
  await seed(page);
  await openEnvironments(page);
  await page.getByRole("button", { name: "Mark variable as secret" }).nth(1).click();
  await expect(page.getByRole("dialog", { name: "Create vault passphrase", exact: true })).toBeVisible();
}

/** How each screen of the index is reached from a fresh page. */
const OPEN: Record<ScreenId, (page: Page) => Promise<void>> = {
  "first-run": async (page) => {
    await page.goto("/app/");
    await expect(address(page)).toBeVisible();
  },
  "request-saved": async (page) => {
    await seed(page);
    await openRequest(page, "Add a pet");
  },
  "response-json": async (page) => {
    await seed(page);
    await openRequest(page, "List pets");
    await sendAndWait(page);
  },
  "response-headers": async (page) => {
    await OPEN["response-json"](page);
    await responseTab(page, "Headers");
  },
  "response-tests": async (page) => {
    await OPEN["response-json"](page);
    await responseTab(page, "Tests");
  },
  "response-html": async (page) => {
    await page.goto("/app/");
    await address(page).fill(`${ECHO}/content/html`);
    await sendAndWait(page);
  },
  "response-loading": async (page) => {
    await page.goto("/app/");
    await address(page).fill(`${ECHO}/delay/60000`);
    await send(page);
    await expect(button(page, "Cancel request")).toBeVisible();
  },
  "response-error": async (page) => {
    await page.goto("/app/");
    await address(page).fill("http://127.0.0.1:9/nothing");
    await send(page);
    await expect(page.locator(".status-badge")).toBeVisible({ timeout: 15_000 });
  },
  "composer-params": async (page) => {
    await seed(page);
    await openRequest(page, "List pets");
    await composerTab(page, "Params");
  },
  "composer-headers": async (page) => {
    await seed(page);
    await openRequest(page, "List pets");
    await composerTab(page, "Headers");
  },
  "composer-body": async (page) => {
    await seed(page);
    await openRequest(page, "Add a pet");
    await composerTab(page, "Body");
  },
  "composer-auth": async (page) => {
    await seed(page);
    await openRequest(page, "List pets");
    await composerTab(page, "Auth");
  },
  "composer-oauth": async (page) => {
    await seed(page);
    await openRequest(page, "List pets");
    await composerTab(page, "Auth");
    await composer(page).getByRole("combobox", { name: "Type" }).click();
    await page.getByRole("option", { name: "OAuth 2.0", exact: true }).click();
    await composer(page).getByRole("combobox", { name: "Grant" }).click();
    await page.getByRole("option", { name: "Authorization code" }).first().click();
    await expect(page.locator(".oauth-token-status")).toBeVisible();
  },
  "composer-scripts": async (page) => {
    await seed(page);
    await openRequest(page, "List pets");
    await composerTab(page, "Scripts");
  },
  "composer-settings": async (page) => {
    await seed(page);
    await openRequest(page, "List pets");
    await composerTab(page, "Settings");
  },
  "method-menu": async (page) => {
    await page.goto("/app/");
    await button(page, "Common methods").click();
    await expect(page.getByRole("listbox").or(page.getByRole("menu"))).toBeVisible();
  },
  "graphql-explorer": async (page) => {
    await seed(page);
    await openRequest(page, "Add a pet");
    await address(page).fill(`${ECHO}/graphql`);
    await composerTab(page, "Body");
    await page.locator("app-body-panel").getByRole("combobox", { name: "Body", exact: true }).click();
    await page.getByRole("option", { name: "GraphQL" }).click();
    const pane = page.locator("app-body-panel .graphql");
    await button(pane, "Fetch schema").click();
    await expect(pane.getByRole("region", { name: "Schema" })).toContainText("Schema: 4 types");
  },
  websocket: async (page) => {
    await page.goto("/app/");
    await address(page).fill(`${ECHO.replace(/^http/, "ws")}/ws`);
    await button(page, "Connect").click();
    const view = page.locator("app-socket-view");
    await expect(view.getByRole("status")).toHaveText("Connected");
    await view.getByLabel("Message").fill('{"hello":"world"}');
    await button(view, "Send message").click();
    await expect(view.getByRole("region", { name: "WebSocket log" }).locator("tbody tr")).toHaveCount(4);
  },
  "export-menu": async (page) => {
    await OPEN["response-json"](page);
    await button(page, "Export response").click();
    await expect(page.getByRole("menu")).toBeVisible();
  },
  "export-har": async (page) => {
    await OPEN["export-menu"](page);
    await page.getByRole("menuitem", { name: "Export as HAR…", exact: true }).click();
    await expect(page.locator(".har-export-preview")).toContainText('"version": "1.2"');
  },
  "save-request": async (page) => {
    await seed(page);
    await address(page).fill(`${ECHO}/content/json`);
    await button(page, "Save to Collection").click();
    await expect(page.locator("#save-as-name")).toBeVisible();
  },
  tree: async (page) => {
    await seed(page);
    await openRequest(page, "List pets");
    await tree(page);
  },
  "tree-menu": async (page) => {
    await seed(page);
    await contextMenu(page, "Pet store");
  },
  "collection-settings": async (page) => {
    await seed(page);
    await contextMenu(page, "Pet store");
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await expect(page.getByRole("dialog", { name: /^Collection settings/ })).toBeVisible();
  },
  "new-collection": async (page) => {
    await page.goto("/app/");
    await sidebarHeaderButton(page, "New collection");
    await expect(page.locator("#creation-name-input")).toBeVisible();
  },
  palette: async (page) => {
    await seed(page);
    // The palette is the sidebar's: below 1,200 px it answers only with the drawer open.
    await tree(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("ControlOrMeta+K");
    await expect(page.getByPlaceholder("Type a command")).toBeVisible();
  },
  "import-review": async (page) => {
    await page.goto("/app/");
    await importFile(page);
  },
  "import-curl": async (page) => {
    await page.goto("/app/");
    await sidebarHeaderButton(page, "Import a cURL command");
    await expect(page.getByRole("dialog", { name: "Import" }).getByLabel("A cURL command")).toBeVisible();
  },
  "script-review": async (page) => {
    await page.goto("/app/");
    await importFile(page);
    await button(page.getByRole("dialog", { name: "Import collection" }), "Confirm import").click();
    await openRequest(page, "Shared request", "Shared collection");
    await composerTab(page, "Scripts");
    await button(page.locator(".scripts-held"), "Review scripts").click();
    await expect(page.getByRole("dialog", { name: "Review scripts" })).toContainText("Read them before you trust them");
  },
  run: async (page) => {
    await seed(page);
    await contextMenu(page, "Pet store");
    await page.getByRole("menuitem", { name: "Run…" }).click();
    const view = page.locator("app-run-view");
    await button(view, "Run").click();
    await expect(button(view, "Run again")).toBeVisible({ timeout: 30_000 });
  },
  "environments-empty": async (page) => {
    await page.goto("/app/");
    await openEnvironments(page);
  },
  "environments-rows": async (page) => {
    await seed(page);
    await openEnvironments(page);
  },
  history: async (page) => {
    await seed(page);
    for (const name of ["List pets", "Add a pet", "Health"]) {
      await openRequest(page, name);
      await sendAndWait(page);
    }
    await button(page, "Request history").click();
    await expect(page.getByRole("dialog", { name: /history/i })).toBeVisible();
  },
  "history-empty": async (page) => {
    await page.goto("/app/");
    await button(page, "Request history").click();
    await expect(page.getByRole("dialog", { name: /history/i })).toBeVisible();
  },
  "vault-create": makeVault,
  "vault-unlock": async (page) => {
    await makeVault(page);
    const create = page.getByRole("dialog", { name: "Create vault passphrase", exact: true });
    await create.locator("input[type='password']").nth(0).fill(PASSPHRASE);
    await create.locator("input[type='password']").nth(1).fill(PASSPHRASE);
    await button(create, "Create vault").click();
    await expect(create).toHaveCount(0);
    await page.getByRole("button", { name: "Mark variable as secret" }).nth(1).click();
    await expect(page.getByText("Secret stored")).toBeVisible();
    await button(page, "Save changes").click();
    await page.reload();
    await expect(address(page)).toBeVisible();
    await button(page, "Unlock secrets").click();
    await expect(page.getByRole("dialog", { name: "Unlock secrets", exact: true })).toBeVisible();
  },
  "secrets-manager": async (page) => {
    await settingsPane(page, "Vault");
    const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
    await dialog
      .getByRole("button", { name: /Manage secrets|Open secrets/ })
      .first()
      .click();
    await expect(page.getByRole("dialog", { name: /secrets/i }).last()).toBeVisible();
  },
  "confirm-dialog": async (page) => {
    await seed(page);
    await contextMenu(page, "Health");
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
  },
  "settings-general": (page) => settingsPane(page, "General"),
  "settings-requests": (page) => settingsPane(page, "Requests"),
  "settings-history": (page) => settingsPane(page, "History"),
  "settings-data": (page) => settingsPane(page, "Data and storage"),
  "settings-vault": (page) => settingsPane(page, "Vault"),
  "settings-bridge": (page) => settingsPane(page, "Local Bridge"),
  "settings-cookies": (page) => settingsPane(page, "Cookies"),
  "settings-shortcuts": (page) => settingsPane(page, "Shortcuts"),
  "settings-diagnostics": (page) => settingsPane(page, "Diagnostics"),
  "settings-about": (page) => settingsPane(page, "About"),
  "settings-danger": (page) => settingsPane(page, "Danger zone"),
};

// What changes from run to run. The page's clock is fixed, so its times and dates do not. A duration the
// browser measured still does, and its width moves the text after it: each is written as "12 ms" before
// the capture, and what the browser has stored "12 kB". An editor's caret is masked. What is left (a
// server's Date header) is under the threshold.
/**
 * `settled`, but not waiting on what is not drawn: Firefox does not run a transition inside a closed
 * `<details>` (the GraphQL schema's types), so after a change of theme it never ends.
 */
function quiet(page: Page): Promise<unknown> {
  return page.waitForFunction(() =>
    document.getAnimations().every((animation) => {
      const target = (animation.effect as KeyframeEffect | null)?.target;
      return (
        animation.playState !== "running" ||
        animation.effect?.getComputedTiming().iterations === Infinity ||
        (target instanceof Element && !target.checkVisibility())
      );
    }),
  );
}

/** Until the page has stopped moving: an editor lays out its lines, and a pane grows, after the last animation. */
async function still(page: Page): Promise<void> {
  const look = () =>
    page.evaluate(() =>
      JSON.stringify([
        [...document.querySelectorAll(".monaco-editor .view-lines")].map((lines) => lines.textContent),
        [...document.querySelectorAll("*")]
          .filter((element) => element.scrollTop > 0)
          .map((element) => [element.scrollTop, element.scrollHeight]),
      ]),
    );
  let before = await look();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(250);
    const now = await look();
    if (now === before) return;
    before = now;
  }
}

async function steady(page: Page): Promise<void> {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest(".monaco-editor")) continue;
      const text = node.textContent ?? "";
      const fixed = text
        .replace(/\d+(\.\d+)?\s?(µs|ms)\b/g, "12 ms")
        // Only what the browser stores ("73.7 kB of 10.7 GB", "73.7 kB used"), not a limit the copy names.
        .replace(/\d+(\.\d+)?\s?(B|kB|MB|GB)(?= used| of )|(?<=of )\d+(\.\d+)?\s?(B|kB|MB|GB)/g, "12 kB");
      if (fixed !== text) node.textContent = fixed;
    }
  });
}
const THRESHOLD = { maxDiffPixels: 200 };
/** Masked: an editor's caret, and what differs from build to build or with what the browser has stored. */
const masked = (page: Page): Locator[] => [
  page.locator(".monaco-editor .cursors-layer"),
  page.getByText(/^\s*[0-9a-f]{7,40}\s*$/),
  page.getByText(/^\s*\d+\.\d+\.\d+\s*$/),
  page.locator('[aria-label*=" used of "]'),
];

for (const { id } of SCREENS_INDEX) {
  for (const { width, height } of WIDTHS) {
    test(`${id} at ${width} px`, async ({ page }) => {
      test.slow();
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
      await page.clock.setFixedTime(new Date("2026-10-22T09:30:00Z"));
      await OPEN[id](page);
      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await page.mouse.move(width - 2, height - 2);
        await quiet(page);
        await still(page);
        await steady(page);
        await expect(page).toHaveScreenshot(`${id}-${width}-${theme}.png`, {
          animations: "disabled",
          mask: masked(page),
          ...THRESHOLD,
        });
      }
    });
  }
}
