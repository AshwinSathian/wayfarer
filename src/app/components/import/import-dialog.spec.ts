import { TestBed } from "@angular/core/testing";
import { scriptDigest, type ImportOptions } from "@wayfarer/core";
import { importText } from "@wayfarer/core/import";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { repositories, type Repositories } from "../../../testing/repositories";
import { CollectionsStore } from "../../services/collections-store";
import { ImportPipeline } from "../../services/import-pipeline";
import { ScriptTrust } from "../../services/script-trust";
import { ImportWorkerClient } from "../../shared/import/import-worker-client";
import { ImportDialog } from "./import-dialog";

const SCRIPT = 'pm.test("status is 200", () => pm.response.to.have.status(200));';
const postman = (withScript: boolean) =>
  JSON.stringify({
    info: { name: "Shop", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    item: [
      {
        name: "List orders",
        ...(withScript ? { event: [{ listen: "test", script: { exec: [SCRIPT], type: "text/javascript" } }] } : {}),
        request: { method: "GET", url: "https://api.test/orders" },
      },
    ],
  });

// D5-e: the review is offered where the scripts are met, at the import's end. The import still writes them
// unapproved (D6); only the review's "Trust these scripts" approves, through ScriptTrust.
describe("ImportDialog: Import and review scripts", () => {
  let idb: Repositories;
  let collections: CollectionsStore;
  let pipeline: ImportPipeline;
  let trust: ScriptTrust;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ImportDialog],
      providers: [
        {
          provide: ImportWorkerClient,
          useValue: { run: (text: string, options: ImportOptions) => Promise.resolve(importText(text, options)) },
        },
      ],
    });
    idb = repositories();
    collections = TestBed.inject(CollectionsStore);
    pipeline = TestBed.inject(ImportPipeline);
    trust = TestBed.inject(ScriptTrust);
    await collections.ensureLoaded();
  });

  afterEach(async () => {
    await idb.resetDatabase();
  });

  async function staged(withScript: boolean) {
    const fixture = TestBed.createComponent(ImportDialog);
    await pipeline.stage("shop.postman_collection.json", postman(withScript));
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      [...host.querySelectorAll("button")].find((element) => element.textContent?.trim() === label);
    return { fixture, host, button };
  }
  const stored = () => collections.tree().find((tree) => tree.collection.name === "Shop")?.collection;
  const reviewOpen = (host: HTMLElement) =>
    [...host.querySelectorAll("dialog")].some(
      (dialog) => dialog.open && dialog.textContent?.includes("Review scripts"),
    );

  it("is not offered for a file without scripts", async () => {
    const { button } = await staged(false);
    expect(button("Import")).toBeDefined();
    expect(button("Import and review scripts…")).toBeUndefined();
  });

  it("stores the collection unapproved and opens its review; Not now approves nothing", async () => {
    const { fixture, host, button } = await staged(true);
    const approve = vi.spyOn(collections, "approveScripts");

    button("Import and review scripts…")?.click();
    await vi.waitFor(() => expect(stored()).toBeDefined());
    await fixture.whenStable();
    expect(stored()?.scriptTrust).toEqual({ trusted: false });
    expect(reviewOpen(host)).toBe(true);
    expect(host.querySelector(".script-review-code code")?.textContent).toBe(SCRIPT);

    button("Not now")?.click();
    await fixture.whenStable();
    expect(reviewOpen(host)).toBe(false);
    expect(trust.reviewOf()).toBeNull();
    expect(approve).not.toHaveBeenCalled();
    expect(stored()?.scriptTrust).toEqual({ trusted: false });
  });

  it("approves the collection's scripts only on the review's Trust these scripts", async () => {
    const { fixture, host, button } = await staged(true);
    const approve = vi.spyOn(collections, "approveScripts");

    button("Import and review scripts…")?.click();
    await vi.waitFor(() => expect(reviewOpen(host)).toBe(true));
    expect(approve).not.toHaveBeenCalled();

    button("Trust these scripts")?.click();
    await vi.waitFor(() => expect(stored()?.scriptTrust).toEqual({ trusted: true, approved: [expect.any(String)] }));
    expect(stored()?.scriptTrust?.approved).toEqual([await scriptDigest(SCRIPT)]);
    expect(approve).toHaveBeenCalledTimes(1);
    await fixture.whenStable();
    expect(reviewOpen(host)).toBe(false);
  });
});

// U-201: a pasted command took "Read the command", then Import. Import reads it and opens the report a file opens;
// nothing is stored until the report's Import.
describe("ImportDialog: a pasted cURL command", () => {
  let idb: Repositories;
  let collections: CollectionsStore;
  let pipeline: ImportPipeline;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ImportDialog],
      providers: [
        {
          provide: ImportWorkerClient,
          useValue: { run: (text: string, options: ImportOptions) => Promise.resolve(importText(text, options)) },
        },
      ],
    });
    idb = repositories();
    collections = TestBed.inject(CollectionsStore);
    pipeline = TestBed.inject(ImportPipeline);
    await collections.ensureLoaded();
  });

  afterEach(async () => {
    await idb.resetDatabase();
  });

  it("is read by Import, the one button, and goes to the report; the report's Import stores it", async () => {
    const fixture = TestBed.createComponent(ImportDialog);
    pipeline.openPaste();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const buttons = () => [...host.querySelectorAll("button")].map((element) => element.textContent?.trim());
    const importButton = () =>
      [...host.querySelectorAll("button")].find((element) => element.textContent?.trim() === "Import");
    expect(buttons()).not.toContain("Read the command");
    expect(importButton()?.disabled).toBe(true);

    const field = host.querySelector("textarea") as HTMLTextAreaElement;
    field.value = "curl 'https://api.test/orders' -H 'Accept: application/json'";
    field.dispatchEvent(new Event("input"));
    await fixture.whenStable();
    expect(importButton()?.disabled).toBe(false);

    importButton()?.click();
    await vi.waitFor(() => expect(pipeline.imported()?.report.formatName).toContain("cURL"));
    expect(collections.tree()).toEqual([]);

    await fixture.whenStable();
    importButton()?.click();
    await vi.waitFor(() =>
      expect(collections.tree().map((tree) => tree.collection.name)).toEqual(["Imported from cURL"]),
    );
  });
});

// receive.md, File step 2: a file of a collection this browser has says so first, counts what it changes, and lists
// the changes before the rest. Import still replaces by id.
describe("ImportDialog: a collection this browser has", () => {
  let idb: Repositories;
  let collections: CollectionsStore;
  let pipeline: ImportPipeline;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ImportDialog],
      providers: [
        {
          provide: ImportWorkerClient,
          useValue: { run: (text: string, options: ImportOptions) => Promise.resolve(importText(text, options)) },
        },
      ],
    });
    idb = repositories();
    collections = TestBed.inject(CollectionsStore);
    pipeline = TestBed.inject(ImportPipeline);
    await collections.ensureLoaded();
  });

  afterEach(async () => {
    await idb.resetDatabase();
  });

  const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1 });
  const none = { pre: "", post: "" };
  const request = (id: string, url = `https://api.test/${id}`) => ({
    id,
    meta: meta(id),
    collectionId: "col-shop",
    name: id,
    order: 0,
    method: "GET",
    url,
    params: [],
    headers: [],
    body: { mode: "none" },
    auth: { type: "inherit" },
    scripts: none,
    tests: [],
    settings: {},
  });
  const file = (requests: unknown[]) =>
    JSON.stringify({
      $id: "wayfarer/collection",
      meta: meta("file"),
      collection: {
        id: "col-shop",
        meta: meta("col-shop"),
        name: "Shop API",
        order: 0,
        variables: [],
        auth: { type: "none" },
        scripts: none,
      },
      folders: [],
      requests,
    });

  async function reported(text: string) {
    const fixture = TestBed.createComponent(ImportDialog);
    await pipeline.stage("shop.json", text);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    return {
      host,
      known: host.querySelector(".import-known")
        ? [...host.querySelectorAll(".import-known p")].map((line) => line.textContent?.trim()).join(" ")
        : undefined,
      rows: [...host.querySelectorAll(".import-plan-row")].map((row) => row.textContent?.replace(/\s+/g, " ").trim()),
      status: host.querySelector('[role="status"]')?.textContent?.trim(),
    };
  }

  it("is not said of a collection this browser has not got", async () => {
    const { known, status } = await reported(file([request("a")]));
    expect(known).toBeUndefined();
    expect(status).toMatch(/^"shop.json" will add/);
  });

  it("names the stored collection first, counts the effects, and lists what changes first", async () => {
    await pipeline.stage("shop.json", file([request("a"), request("b"), request("c")]));
    await pipeline.confirm();
    await vi.waitFor(() => expect(collections.tree()).toHaveLength(1));

    const { known, rows, status } = await reported(
      file([request("a"), request("b"), request("c", "https://api.test/changed"), request("d")]),
    );
    expect(known).toBe(
      "You have this collection: Shop API. Review what this file changes. 1 item changes, 1 is new and 3 are the same.",
    );
    expect(rows[0]).toBe("RequestcChanges");
    expect(rows.slice(1)).toEqual(["RequestdNew", "CollectionShop APISame", "RequestaSame", "RequestbSame"]);
    expect(status).toMatch(
      /^You have this collection: Shop API\. Review what this file changes\. "shop.json" will add/,
    );
  });

  it("says when nothing in the file differs from what is stored", async () => {
    const text = file([request("a")]);
    await pipeline.stage("shop.json", text);
    await pipeline.confirm();
    await vi.waitFor(() => expect(collections.tree()).toHaveLength(1));

    const { known } = await reported(text);
    expect(known).toContain("Nothing in this file differs from yours.");
  });

  it("is not said for Import as duplicate", async () => {
    const text = file([request("a")]);
    await pipeline.stage("shop.json", text);
    await pipeline.confirm();
    await vi.waitFor(() => expect(collections.tree()).toHaveLength(1));

    const fixture = TestBed.createComponent(ImportDialog);
    await pipeline.stage("shop.json", text);
    await pipeline.toggleDuplicateAsNew(true);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector(".import-known")).toBeNull();
  });
});
