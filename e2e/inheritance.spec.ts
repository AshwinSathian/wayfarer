import { test, expect, type Page } from "@playwright/test";
import { ECHO } from "./support/echo";
import { TARGET, captureTarget, dumpIdb, openFolder, seedAndOpen, send } from "./support/app";

// P4.9: what a request takes from its collection and its folders. Needs the
// production build (CI=1): the scripts run in QuickJS under the production CSP.

interface Echo {
  headers: [string, string][];
}

async function sendAndEcho(page: Page): Promise<Echo> {
  const response = page.waitForResponse((r) => r.url().startsWith(`${ECHO}/echo`) && r.request().method() !== "OPTIONS");
  await send(page);
  return (await (await response).json()) as Echo;
}

const header = (echo: Echo, name: string) => echo.headers.find(([key]) => key === name)?.[1];
const authTab = (page: Page) => page.locator("app-composer").getByRole("tab", { name: "Auth", exact: true }).first();

test("@claim:C-019 a collection's bearer auth reaches the server for a request set to inherit, and a folder's replaces it", async ({ page }) => {
  // The collection's auth is stored; the folder's is set in its settings dialog below.
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo`, auth: { type: "inherit" }, collection: { auth: { type: "bearer", token: "c019-collection-token" } }, folder: {} });

  const inherited = await sendAndEcho(page);
  expect(header(inherited, "authorization")).toBe("Bearer c019-collection-token");
  // The Auth tab says what will be sent, and where it comes from.
  await authTab(page).click();
  await expect(page.locator(".auth-inherited")).toHaveText('Bearer Token is sent, from collection "Tripwire collection".');

  await page.getByText("Tripwire folder", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Folder settings: Tripwire folder" });
  // A new folder inherits, and says what from.
  await expect(settings.locator(".auth-inherited")).toHaveText('Bearer Token is sent, from collection "Tripwire collection".');
  await settings.getByRole("combobox", { name: "Type" }).click();
  await page.getByRole("option", { name: "API Key" }).click();
  await settings.getByLabel("Key", { exact: true }).fill("X-C019-Folder");
  await settings.getByLabel("Value", { exact: true }).fill("c019-folder-key");
  await settings.getByRole("button", { name: "Save settings" }).click();
  await expect(settings).toBeHidden();

  await expect(page.locator(".auth-inherited")).toHaveText('API Key is sent, from folder "Tripwire folder".');
  const replaced = await sendAndEcho(page);
  expect(header(replaced, "x-c019-folder")).toBe("c019-folder-key");
  expect(header(replaced, "authorization")).toBeUndefined();
});

test("a request made in a collection starts with inherit; a collection's settings hold auth, variables and scripts, and keep them over a reload", async ({ page }) => {
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` });
  await page.getByText("Tripwire collection", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Collection settings: Tripwire collection" });
  // A collection has nothing above it to inherit from.
  await settings.getByRole("combobox", { name: "Type" }).click();
  await expect(page.getByRole("option")).toHaveText(["None", "Bearer Token", "Basic Auth", "API Key"]);
  await page.getByRole("option", { name: "Bearer Token" }).click();
  await settings.getByLabel("Token", { exact: true }).fill("{{shopToken}}");
  await settings.getByRole("tab", { name: "Variables" }).click();
  await settings.getByRole("button", { name: "Add variable" }).click();
  await settings.getByPlaceholder("name").fill("shopToken");
  await settings.getByPlaceholder("value").fill("from-the-collection");
  await settings.getByRole("button", { name: "Save settings" }).click();
  await expect(settings).toBeHidden();

  await page.reload();
  const stored = ((await dumpIdb(page))["collections"] as Record<string, unknown>[])[0];
  expect(stored).toMatchObject({ auth: { type: "bearer", token: "{{shopToken}}" }, variables: [{ key: "shopToken", value: "from-the-collection", enabled: true }] });

  // A request made in the collection inherits from the start.
  await page.getByText("Tripwire collection", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "New Request" }).click();
  await page.locator("#creation-name-input").fill("Made here");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByTitle("Double-click to load into composer").getByText("Made here", { exact: true }).dblclick();
  await authTab(page).click();
  await expect(page.locator(".auth-inherited")).toHaveText('Bearer Token is sent, from collection "Tripwire collection".');
  await page.locator("input.address-url").fill(`${ECHO}/echo`);
  expect(header(await sendAndEcho(page), "authorization")).toBe("Bearer from-the-collection");
});

const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1, version: 1 });
const none = { pre: "", post: "" };
/** Appends its letter to the `order` variable: the header that goes out says which scripts ran, and in which order. */
const step = (letter: string) => `pm.environment.set("order", (pm.environment.get("order") || "") + "${letter}");`;

/** A collection file as another person would send it: a script on the collection, on a folder and on the request in it. */
const FILE = {
  name: "inherited.json",
  mimeType: "application/json",
  buffer: Buffer.from(
    JSON.stringify({
      $id: "wayfarer/collection/3",
      meta: meta("file"),
      collection: { id: "col-in", meta: meta("col-in"), name: "Inherited collection", order: 0, variables: [], auth: { type: "none" }, scripts: { pre: step("c"), post: 'pm.test("the collection\'s script ran after", () => {});' } },
      folders: [{ id: "fol-in", meta: meta("fol-in"), collectionId: "col-in", name: "Inherited folder", order: 0, variables: [], auth: { type: "inherit" }, scripts: { pre: step("f"), post: 'pm.test("the folder\'s script ran after", () => {});' } }],
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
    })
  ),
};

test.describe("scripts of a collection and a folder", () => {
  // The target is a routed fake host, which the app's service worker would hide in WebKit.
  test.use({ serviceWorkers: "block" });

  test("@claim:C-051 a collection script and a folder script written by an import do not run until reviewed, and run in order after", async ({ page }) => {
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { __violations: string[] }).__violations = seen;
      document.addEventListener("securitypolicyviolation", (e) => seen.push(`${e.effectiveDirective} ${e.blockedURI} ${e.sample}`));
    });
    const hits = await captureTarget(page);
    // An active environment for the scripts to write to, and to give `order` a value while none of them runs.
    await seedAndOpen(page, { order: "" }, { method: "GET", url: `${TARGET}/seeded` });
    await page.locator('app-collections-sidebar input[type="file"]').setInputFiles(FILE);
    const dialog = page.getByRole("dialog", { name: "Import collection" });
    await dialog.getByRole("button", { name: "Confirm import" }).click();
    await expect(dialog).toHaveCount(0);
    await openFolder(page, "Inherited folder");
    await page.getByTitle("Double-click to load into composer").getByText("Inherited request", { exact: true }).dblclick();
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
    await expect(review.locator(".view-lines")).toContainText("Collection Inherited collection: pre-request script");
    await review.getByRole("button", { name: "I trust these scripts" }).click();
    await expect(review).toHaveCount(0);

    // Reviewed: the collection's first, then the folder's, then the request's own, each with what the one before set.
    await send(page);
    // The engine is loaded for the first script of the session: the request leaves after three of them.
    await expect.poll(() => hits.length).toBe(2);
    await expect(page.locator(".status-badge")).toHaveText("200");
    expect(hits[1].headers()["x-order"]).toBe("ran:cfr");
    await tests.click();
    await expect(page.locator(".test-result-pass")).toHaveText([/the collection's script ran after/, /the folder's script ran after/]);
    await expect(page.locator(".scripts-skipped")).toHaveCount(0);

    expect(await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations)).toEqual([]);
  });
});
