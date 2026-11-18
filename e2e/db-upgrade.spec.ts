import { expect, test } from "@playwright/test";
import { ECHO } from "./support/echo";

// T2.0: a browser that holds the database at version 2 (every Wayfarer before 3.5.0) opens it at 3 and finds every
// record. The version 2 database is made from a real one: a saved request, then every store's records copied out,
// the database deleted and made again at version 2 (the stores and indexes version 2 had) with the records put back.
test("a database at version 2 opens at version 3 with every record, and has the three new stores", async ({ page }) => {
  await page.goto("/app/");
  await page.getByRole("button", { name: "New collection" }).first().click();
  await page.locator("#creation-name-input").fill("Before the upgrade");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator("#creation-name-input")).toHaveCount(0);
  await page.locator("input.address-url").fill(`${ECHO}/echo`);
  await page.getByRole("button", { name: "Save to collection" }).click();
  const dialog = page.getByRole("dialog", { name: "Save to collection" });
  await dialog.locator("#save-as-name").fill("Kept request");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const stores = await page.evaluate(async () => {
    const open = (version?: number) =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("wayfarer", version);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await open();
    const names = [...db.objectStoreNames].filter((n) => !["shares", "bases", "changes"].includes(n));
    const copy: Record<string, { key: IDBValidKey; value: unknown }[]> = {};
    const shape: Record<
      string,
      { keyPath: string | string[] | null; autoIncrement: boolean; indexes: [string, string][] }
    > = {};
    const tx = db.transaction(names, "readonly");
    for (const name of names) {
      const store = tx.objectStore(name);
      shape[name] = {
        keyPath: store.keyPath,
        autoIncrement: store.autoIncrement,
        indexes: [...store.indexNames].map((i) => [i, String(store.index(i).keyPath)]),
      };
      const records = await new Promise<{ key: IDBValidKey; value: unknown }[]>((resolve, reject) => {
        const out: { key: IDBValidKey; value: unknown }[] = [];
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c) return resolve(out);
          out.push({ key: c.key, value: c.value });
          c.continue();
        };
        cursor.onerror = () => reject(cursor.error);
      });
      copy[name] = records;
    }
    db.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("wayfarer");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => undefined;
    });
    const v2 = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("wayfarer", 2);
      request.onupgradeneeded = () => {
        for (const name of names) {
          const s = shape[name];
          const store = request.result.createObjectStore(name, {
            ...(s.keyPath === null ? {} : { keyPath: s.keyPath }),
            autoIncrement: s.autoIncrement,
          });
          for (const [index, keyPath] of s.indexes) store.createIndex(index, keyPath);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const write = v2.transaction(names, "readwrite");
    for (const name of names)
      for (const { key, value } of copy[name])
        write.objectStore(name).put(value, shape[name].keyPath === null ? key : undefined);
    await new Promise<void>((resolve, reject) => {
      write.oncomplete = () => resolve();
      write.onerror = () => reject(write.error);
    });
    const version = v2.version;
    v2.close();
    return { version, counts: Object.fromEntries(names.map((n) => [n, copy[n].length])) };
  });
  expect(stores.version).toBe(2);
  expect(stores.counts["requests"]).toBe(1);

  await page.goto("/app/");
  await expect(page.getByRole("tree").getByText("Kept request")).toBeVisible();

  const after = await page.evaluate(
    () =>
      new Promise<{ version: number; names: string[]; requests: number }>((resolve, reject) => {
        const request = indexedDB.open("wayfarer");
        request.onsuccess = () => {
          const db = request.result;
          const count = db.transaction("requests").objectStore("requests").count();
          count.onsuccess = () => {
            const out = { version: db.version, names: [...db.objectStoreNames].sort(), requests: count.result };
            db.close();
            resolve(out);
          };
        };
        request.onerror = () => reject(request.error);
      }),
  );
  expect(after.version).toBe(3);
  expect(after.names).toEqual(expect.arrayContaining(["shares", "bases", "changes"]));
  expect(after.requests).toBe(1);
});
