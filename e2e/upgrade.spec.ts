import { test, expect, type Page } from "@playwright/test";
import { dumpIdb } from "./support/app";

// P2.2: the database is version 5. These tests reach the states a version
// change passes through, from a page of this origin that does not run the app.

const BLANK = "/3rdpartylicenses.txt";

declare global {
  interface Window {
    heldDb?: IDBDatabase;
  }
}

/** Opens `api-sandbox` at `version` with the raw API, as a tab running other code would, and keeps the connection in `window.heldDb`. */
async function openRaw(page: Page, version: number, v4Data = false): Promise<void> {
  await page.evaluate(
    ({ version, v4Data }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("api-sandbox", version);
        open.onupgradeneeded = () => {
          if (!v4Data) return;
          const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1, version: 1 });
          const db = open.result;
          db.createObjectStore("history", { keyPath: "id", autoIncrement: true }).add({ method: "GET", url: "https://old.test", headers: {}, createdAt: 1 });
          db.createObjectStore("collections", { keyPath: "meta.id" }).add({ id: "c-old", meta: meta("c-old"), name: "Old collection", order: 1 });
          db.createObjectStore("folders", { keyPath: "meta.id" });
          db.createObjectStore("requests", { keyPath: "meta.id" }).add({
            id: "r-old",
            meta: meta("r-old"),
            collectionId: "c-old",
            name: "Old request",
            method: "GET",
            url: "https://old.test",
            headers: { A: "1" },
            order: 1,
          });
          db.createObjectStore("environments", { keyPath: "meta.id" }).add({ id: "e-old", meta: meta("e-old"), name: "Old env", vars: { a: "1" }, order: 1 });
          db.createObjectStore("secrets", { keyPath: "meta.id" });
          db.createObjectStore("meta", { keyPath: "key" }).add({ key: "state", schemaVersion: 1, activeEnvironmentId: "e-old" });
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          window.heldDb = open.result;
          resolve();
        };
      }),
    { version, v4Data }
  );
}

async function createCollection(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "New collection" }).click();
  await page.locator("#creation-name-input").fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

test("data saved by an earlier version is removed, and the page says so once", async ({ page }) => {
  await page.goto(BLANK);
  await openRaw(page, 4, true);
  await page.evaluate(() => window.heldDb?.close());

  await page.goto("/");

  await expect(page.getByText(/saved by an earlier version were removed/)).toBeVisible();
  await expect(page.getByText("Old collection", { exact: true })).toHaveCount(0);
  const stores = await dumpIdb(page);
  for (const name of ["history", "collections", "folders", "requests", "environments", "secrets"]) {
    expect(stores[name], name).toEqual([]);
  }

  // The stores work, and the notice is about that one upgrade.
  await createCollection(page, "After the update");
  await page.reload();
  await expect(page.getByText("After the update", { exact: true })).toBeVisible();
  await expect(page.getByText(/saved by an earlier version were removed/)).toHaveCount(0);
});

test("a tab that will not close holds the update: the page asks for it to be closed, then finishes", async ({ context }) => {
  // A tab running a build from before version 5 keeps its connection on versionchange.
  const oldTab = await context.newPage();
  await oldTab.goto(BLANK);
  await openRaw(oldTab, 4, true);

  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByText("Close other Wayfarer tabs to finish the update", { exact: false })).toBeVisible();

  await oldTab.close();

  await expect(page.getByText("Close other Wayfarer tabs to finish the update", { exact: false })).toHaveCount(0);
  await createCollection(page, "Saved after waiting");
});

test("a tab running this version closes its connection when a newer one updates the database, and asks for a reload", async ({ context }) => {
  const page = await context.newPage();
  await page.goto("/");
  await createCollection(page, "Before the update");

  const newerTab = await context.newPage();
  await newerTab.goto(BLANK);
  // Resolves only once this tab's connection is closed: it was not in the way.
  await openRaw(newerTab, 99);

  await expect(page.getByText(/Wayfarer was updated in another tab/)).toBeVisible();
  await expect(page.getByText(/Data was reset in another tab/)).toHaveCount(0);
});

test("a database from a newer version: the page says this tab is older, not that storage is blocked", async ({ page }) => {
  await page.goto(BLANK);
  await openRaw(page, 99);
  await page.evaluate(() => window.heldDb?.close());

  await page.goto("/");

  await expect(page.getByText(/running an older Wayfarer/)).toBeVisible();
  await expect(page.getByText(/not letting Wayfarer store data/)).toHaveCount(0);
  expect((await page.evaluate(async () => (await indexedDB.databases()).find((db) => db.name === "api-sandbox")?.version))).toBe(99);
});
