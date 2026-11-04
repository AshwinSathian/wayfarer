import { test, expect, type Page } from "@playwright/test";
import { ECHO } from "./support/echo";
import {
  TARGET,
  captureTarget,
  closeHolderSettings,
  dumpIdb,
  openFolder,
  openHolderSettings,
  protectVariable,
  seedAndOpen,
  send,
} from "./support/app";

// P4.9: what a request takes from its collection and its folders. Needs the
// production build (CI=1): the scripts run in QuickJS under the production CSP.

interface Echo {
  headers: [string, string][];
}

async function sendAndEcho(page: Page): Promise<Echo> {
  const response = page.waitForResponse(
    (r) => r.url().startsWith(`${ECHO}/echo`) && r.request().method() !== "OPTIONS",
  );
  await send(page);
  return (await (await response).json()) as Echo;
}

const header = (echo: Echo, name: string) => echo.headers.find(([key]) => key === name)?.[1];
const authTab = (page: Page) => page.locator("app-composer").getByRole("tab", { name: "Auth", exact: true }).first();

test("@claim:C-019 a collection's bearer auth reaches the server for a request set to inherit, and a folder's replaces it", async ({
  page,
}) => {
  // The collection's auth is stored; the folder's is set in its settings tab below.
  await seedAndOpen(
    page,
    {},
    {
      method: "GET",
      url: `${ECHO}/echo`,
      auth: { type: "inherit" },
      collection: { auth: { type: "bearer", token: "c019-collection-token" } },
      folder: {},
    },
  );

  const inherited = await sendAndEcho(page);
  expect(header(inherited, "authorization")).toBe("Bearer c019-collection-token");
  // The Auth tab says what will be sent, and where it comes from.
  await authTab(page).click();
  await expect(page.locator(".auth-inherited")).toHaveText(
    'Bearer token is sent, from collection "Tripwire collection".',
  );

  const settings = await openHolderSettings(page, "Tripwire folder", "Folder");
  await settings.getByRole("tab", { name: "Auth", exact: true }).click();
  // A new folder inherits, and says what from.
  await expect(settings.locator(".auth-inherited")).toHaveText(
    'Bearer token is sent, from collection "Tripwire collection".',
  );
  await settings.getByRole("combobox", { name: "Type" }).click();
  await page.getByRole("option", { name: "API key" }).click();
  await settings.getByLabel("Key", { exact: true }).fill("X-C019-Folder");
  await settings.getByLabel("Value", { exact: true }).fill("c019-folder-key");
  // No Save: closing the tab writes what was typed.
  await closeHolderSettings(page, "Tripwire folder");

  await expect(page.locator(".auth-inherited")).toHaveText('API key is sent, from folder "Tripwire folder".');
  const replaced = await sendAndEcho(page);
  expect(header(replaced, "x-c019-folder")).toBe("c019-folder-key");
  expect(header(replaced, "authorization")).toBeUndefined();
});

test("a request made in a collection starts with inherit; a collection's settings hold auth, variables and scripts, and keep them over a reload", async ({
  page,
}) => {
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` });
  const settings = await openHolderSettings(page, "Tripwire collection");
  await settings.getByRole("tab", { name: "Auth", exact: true }).click();
  // A collection has nothing above it to inherit from.
  await settings.getByRole("combobox", { name: "Type" }).click();
  await expect(page.getByRole("option")).toHaveText([
    "None",
    "Bearer token",
    "Basic auth",
    "API key",
    "AWS Signature",
    "OAuth 2.0",
  ]);
  await page.getByRole("option", { name: "Bearer token" }).click();
  await settings.getByLabel("Token", { exact: true }).fill("{{shopToken}}");
  await settings.getByRole("tab", { name: "Variables" }).click();
  await settings.getByRole("button", { name: "Add variable" }).click();
  await settings.getByPlaceholder("Name", { exact: true }).fill("shopToken");
  await settings.getByPlaceholder("Value", { exact: true }).fill("from-the-collection");
  // Written as each field is left: no Save.
  await page.keyboard.press("Tab");
  const storedCollection = async () => ((await dumpIdb(page))["collections"] as Record<string, unknown>[])[0];
  await expect.poll(storedCollection).toMatchObject({
    auth: { type: "bearer", token: "{{shopToken}}" },
    variables: [{ key: "shopToken", value: "from-the-collection", enabled: true }],
  });

  await page.reload();
  expect(await storedCollection()).toMatchObject({
    auth: { type: "bearer", token: "{{shopToken}}" },
    variables: [{ key: "shopToken", value: "from-the-collection", enabled: true }],
  });

  // A request made in the collection inherits from the start.
  await page.getByText("Tripwire collection", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "New request" }).click();
  await page.locator("#creation-name-input").fill("Made here");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("tree").getByText("Made here", { exact: true }).click();
  await authTab(page).click();
  // Where the auth is set, and where its value comes from (U-130).
  await expect(page.locator(".auth-inherited")).toHaveText(
    'Bearer token is sent, from collection "Tripwire collection". {{shopToken}} comes from the collection\'s variables.',
  );
  await page.locator("input.address-url").fill(`${ECHO}/echo`);
  expect(header(await sendAndEcho(page), "authorization")).toBe("Bearer from-the-collection");
});

const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1 });
const none = { pre: "", post: "" };
/** Appends its letter to the `order` variable: the header that goes out says which scripts ran, and in which order. */
const step = (letter: string) => `pm.environment.set("order", (pm.environment.get("order") || "") + "${letter}");`;

/** A collection file as another person would send it: a script on the collection, on a folder and on the request in it. */
const FILE = {
  name: "inherited.json",
  mimeType: "application/json",
  buffer: Buffer.from(
    JSON.stringify({
      $id: "wayfarer/collection",
      meta: meta("file"),
      collection: {
        id: "col-in",
        meta: meta("col-in"),
        name: "Inherited collection",
        order: 0,
        variables: [],
        auth: { type: "none" },
        scripts: { pre: step("c"), post: 'pm.test("the collection\'s script ran after", () => {});' },
      },
      folders: [
        {
          id: "fol-in",
          meta: meta("fol-in"),
          collectionId: "col-in",
          name: "Inherited folder",
          order: 0,
          variables: [],
          auth: { type: "inherit" },
          scripts: { pre: step("f"), post: 'pm.test("the folder\'s script ran after", () => {});' },
        },
      ],
      requests: [
        {
          id: "req-in",
          meta: meta("req-in"),
          collectionId: "col-in",
          folderId: "fol-in",
          name: "Inherited request",
          order: 0,
          method: "GET",
          url: `${TARGET}/inherited`,
          params: [],
          headers: [{ key: "X-Order", value: "ran:{{order}}", enabled: true }],
          body: { mode: "none" },
          auth: { type: "inherit" },
          scripts: { pre: step("r"), post: none.post },
          tests: [],
          settings: {},
        },
      ],
    }),
  ),
};

test.describe("scripts of a collection and a folder", () => {
  // The target is a routed fake host, which the app's service worker would hide in WebKit.
  test.use({ serviceWorkers: "block" });

  test("@claim:C-051 a collection script and a folder script written by an import do not run until reviewed, and run in order after", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { __violations: string[] }).__violations = seen;
      document.addEventListener("securitypolicyviolation", (e) =>
        seen.push(`${e.effectiveDirective} ${e.blockedURI} ${e.sample}`),
      );
    });
    const hits = await captureTarget(page);
    // An active environment for the scripts to write to, and to give `order` a value while none of them runs.
    await seedAndOpen(page, { order: "" }, { method: "GET", url: `${TARGET}/seeded` });
    await page.locator('app-collections-sidebar input[type="file"]').setInputFiles(FILE);
    const dialog = page.getByRole("dialog", { name: "Import collection" });
    await dialog.getByRole("button", { name: "Import", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await openFolder(page, "Inherited folder");
    await page.getByRole("tree").getByText("Inherited request", { exact: true }).click();
    await expect(page.locator("input.address-url")).toHaveValue(`${TARGET}/inherited`);

    // Sent, and none of the five scripts ran.
    await send(page);
    await expect(page.locator(".status-badge")).toHaveText("200");
    expect(hits).toHaveLength(1);
    expect(hits[0].headers()["x-order"]).toBe("ran:");
    const tests = page.locator("app-response-viewer").getByRole("tab", { name: /Tests/ });
    await tests.click();
    await expect(page.locator(".scripts-skipped")).toBeVisible();
    await expect(page.locator(".test-result-pass")).toHaveCount(0);

    // The review lists the collection's and the folder's scripts with the request's.
    await page.getByRole("tab", { name: "Scripts", exact: true }).first().click();
    await page.locator(".scripts-held").getByRole("button", { name: "Review scripts" }).click();
    const review = page.getByRole("dialog", { name: "Review scripts" });
    await expect(review).toContainText("5 scripts in the collection, 1 folder and 1 request");
    await expect(review.locator(".script-review-list li").first()).toContainText(
      "Collection Inherited collection Pre-request script",
    );
    await review.getByRole("button", { name: "Trust these scripts" }).click();
    await expect(review).toHaveCount(0);

    // Reviewed: the collection's first, then the folder's, then the request's own, each with what the one before set.
    await send(page);
    // The engine is loaded for the first script of the session: the request leaves after three of them.
    await expect.poll(() => hits.length).toBe(2);
    await expect(page.locator(".status-badge")).toHaveText("200");
    expect(hits[1].headers()["x-order"]).toBe("ran:cfr");
    await tests.click();
    await expect(page.locator(".test-result-pass")).toHaveText([
      /the collection's script ran after/,
      /the folder's script ran after/,
    ]);
    await expect(page.locator(".scripts-skipped")).toHaveCount(0);

    expect(await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations)).toEqual([]);
  });
});

// U-130 (D4.11): the token was the environment's vault secret, shadowing the collection's value, and the Auth tab
// named only the collection. It now names where the auth is set and where its value comes from.
test("the Auth tab names where an inherited token is set and where its value comes from: the environment's vault secret", async ({
  page,
}) => {
  await seedAndOpen(
    page,
    {},
    {
      method: "GET",
      url: `${ECHO}/echo`,
      auth: { type: "inherit" },
      collection: { auth: { type: "bearer", token: "{{token}}" }, variables: { token: "col-token" } },
    },
  );
  await protectVariable(page, "token", "env-secret-value");
  await page.locator("app-composer").getByRole("tab", { name: "Auth", exact: true }).click();
  const line = page.locator(".auth-inherited");
  await expect(line).toContainText('Bearer token is sent, from collection "Tripwire collection".');
  await expect(line).toContainText("{{token}} comes from the environment Tripwire env, as a vault secret.");
  // Auth's variables have chips, the vault's among them.
  await expect(page.locator(".var-chip", { hasText: "From the vault" })).toContainText("token");

  const echo = await sendAndEcho(page);
  expect(header(echo, "authorization")).toBe("Bearer env-secret-value");
});

// D5-e: a collection's or a folder's settings are a tab, as the environments are: one tab a holder, written as each
// field is left, and a variable there can be kept in the vault (L-1, L-3, L-4).
test("a collection's settings open in one tab, and a variable typed there is stored without a Save and can be marked secret", async ({
  page,
}) => {
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` });
  const settings = await openHolderSettings(page, "Tripwire collection");
  // The request it is set up for is a tab away; the page under it is not inert.
  const strip = page.getByRole("tablist", { name: "Open requests" });
  await expect(strip.getByRole("tab")).toHaveCount(2);
  await expect(strip.getByRole("tab", { selected: true })).toHaveAccessibleName(
    /Collection settings Tripwire collection/,
  );
  // Asked again, the same tab.
  await openHolderSettings(page, "Tripwire collection");
  await expect(strip.getByRole("tab")).toHaveCount(2);

  await settings.getByRole("button", { name: "Add variable" }).click();
  await settings.getByPlaceholder("Name", { exact: true }).fill("apiToken");
  await settings.getByPlaceholder("Value", { exact: true }).fill("typed-collection-token");
  await page.keyboard.press("Tab");
  const variables = async () =>
    (((await dumpIdb(page))["collections"] as Record<string, unknown>[])[0].variables as Record<string, unknown>[]) ??
    [];
  await expect.poll(variables).toEqual([{ key: "apiToken", value: "typed-collection-token", enabled: true }]);

  // Switched off, written at once.
  await settings.getByRole("checkbox", { name: "Use apiToken" }).uncheck();
  await expect.poll(variables).toEqual([{ key: "apiToken", value: "typed-collection-token", enabled: false }]);
  await settings.getByRole("checkbox", { name: "Use apiToken" }).check();

  // Marked secret: the vault is made in the row, and the collection holds the reference only.
  await settings.getByRole("button", { name: "Mark apiToken as secret" }).click();
  await settings.getByLabel("Passphrase", { exact: true }).fill("a long passphrase");
  await settings.getByLabel("Confirm passphrase").fill("a long passphrase");
  await settings.getByRole("button", { name: "Create vault" }).click();
  await expect(settings.getByText("Secret stored")).toBeVisible();
  await expect.poll(async () => (await variables())[0]?.value).toMatch(/^\{\{\$secret\.[a-z0-9-]+\}\}$/);
  expect(JSON.stringify(await dumpIdb(page))).not.toContain("typed-collection-token");
});

test.describe("a held script edited in its settings tab", () => {
  // The target is a routed fake host, which the app's service worker would hide in WebKit.
  test.use({ serviceWorkers: "block" });

  test("@claim:C-051 a collection's script that is held stays held after an edit in its settings tab", async ({
    page,
  }) => {
    const hits = await captureTarget(page);
    await seedAndOpen(page, { order: "" }, { method: "GET", url: `${TARGET}/seeded` });
    await page.locator('app-collections-sidebar input[type="file"]').setInputFiles(FILE);
    const dialog = page.getByRole("dialog", { name: "Import collection" });
    await dialog.getByRole("button", { name: "Import", exact: true }).click();
    await expect(dialog).toHaveCount(0);

    const settings = await openHolderSettings(page, "Inherited collection");
    await settings.getByRole("tab", { name: "Scripts", exact: true }).click();
    await settings.locator("app-script-editor").first().locator(".monaco-editor").first().click();
    // The pre-request script is one line.
    await page.keyboard.press("End");
    await page.keyboard.type("\n// edited here");
    await closeHolderSettings(page, "Inherited collection");
    const stored = async () =>
      ((await dumpIdb(page))["collections"] as Record<string, unknown>[]).find(
        (c) => c.name === "Inherited collection",
      );
    await expect.poll(async () => ((await stored())?.scripts as { pre: string }).pre).toContain("// edited here");
    expect((await stored())?.scriptTrust).toEqual({ trusted: false });

    // Still held: sent, and none of the scripts ran.
    await openFolder(page, "Inherited folder");
    await page.getByRole("tree").getByText("Inherited request", { exact: true }).click();
    await send(page);
    await expect(page.locator(".status-badge")).toHaveText("200");
    expect(hits.at(-1)?.headers()["x-order"]).toBe("ran:");
  });
});
