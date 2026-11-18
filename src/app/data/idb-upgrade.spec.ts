import { openDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";
import { createStores } from "./idb-stores";

// The one upgrade there is (T2.0): version 2 to 3 makes the stores a version 2 database lacks and moves no data.
const NAME = "wayfarer-upgrade-spec";
const VERSION_2 = [
  "history",
  "collections",
  "folders",
  "requests",
  "environments",
  "secrets",
  "meta",
  "files",
  "tabs",
  "cookies",
];
const VERSION_3 = [...VERSION_2, "shares", "bases", "changes"];

afterEach(() => indexedDB.deleteDatabase(NAME));

describe("createStores", () => {
  it("makes every store in a browser's first open", async () => {
    const db = await openDB(NAME, 3, { upgrade: (db, old) => createStores(db as never, old) });
    expect([...db.objectStoreNames].sort()).toEqual([...VERSION_3].sort());
    expect([...db.transaction("changes").store.indexNames]).toEqual(["by-collection"]);
    db.close();
  });

  it("upgrades a version 2 database with records: it keeps every record and adds the three stores", async () => {
    const v2 = await openDB(NAME, 2, {
      upgrade: (db) => {
        for (const store of VERSION_2) db.createObjectStore(store, { keyPath: store === "meta" ? "key" : "id" });
      },
    });
    await v2.put("history", { id: 1, url: "https://a.test" });
    await v2.put("tabs", { id: "t" });
    await v2.put("meta", { key: "state", activeEnvironmentId: "e" });
    v2.close();

    let sawOldVersion = -1;
    const v3 = await openDB(NAME, 3, {
      upgrade: (db, old) => {
        sawOldVersion = old;
        createStores(db as never, old);
      },
    });
    expect(sawOldVersion).toBe(2);
    expect([...v3.objectStoreNames].sort()).toEqual([...VERSION_3].sort());
    expect(await v3.get("history", 1)).toEqual({ id: 1, url: "https://a.test" });
    expect(await v3.get("tabs", "t")).toEqual({ id: "t" });
    expect(await v3.get("meta", "state")).toEqual({ key: "state", activeEnvironmentId: "e" });
    expect(await v3.getAll("shares")).toEqual([]);
    v3.close();
  });
});
