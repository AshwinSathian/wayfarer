import { TestBed } from "@angular/core/testing";
import { scriptDigest, type ImportOptions } from "@wayfarer/core";
import { importText } from "@wayfarer/core/import";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { repositories, type Repositories } from "../../../testing/repositories";
import { CollectionsStore } from "../../services/collections-store";
import { ImportPipeline } from "../../services/import-pipeline";
import { ScriptTrust } from "../../services/script-trust";
import { SecretsVault } from "../../services/secrets-vault";
import type { SecretDoc } from "../../models/secrets";
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

// receive.md, "What every way shows before it stores": the secrets, credentials and scripts a collection needs of the
// person receiving it, before its hosts. The vault is read for its secrets' names only.
describe("ImportDialog: what a collection needs of its receiver", () => {
  let idb: Repositories;
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
    pipeline = TestBed.inject(ImportPipeline);
    await TestBed.inject(CollectionsStore).ensureLoaded();
  });

  afterEach(async () => {
    await idb.resetDatabase();
  });

  const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1 });
  const file = JSON.stringify({
    $id: "wayfarer/collection",
    meta: meta("file"),
    collection: {
      id: "col-needs",
      meta: meta("col-needs"),
      name: "Shop",
      order: 0,
      variables: [
        { key: "token", value: "{{$secret.s-1}}", enabled: true },
        { key: "pass", value: "{{$secret.s-2}}", enabled: true },
        { key: "own", value: "{{$secret.s-3}}", enabled: true },
      ],
      auth: { type: "bearer", token: "***" },
      scripts: { pre: "", post: "" },
    },
    folders: [],
    requests: [
      {
        id: "r-1",
        meta: meta("r-1"),
        collectionId: "col-needs",
        name: "Orders",
        order: 0,
        method: "GET",
        url: "https://api.shop.test/orders",
        params: [],
        headers: [],
        body: { mode: "none" },
        auth: { type: "inherit" },
        scripts: { pre: "", post: SCRIPT },
        tests: [],
        settings: {},
      },
    ],
  });

  it("says each line, in order, before the hosts, with the secrets' names in a monospace list", async () => {
    const vault = TestBed.inject(SecretsVault);
    const list = vi
      .spyOn(vault, "listSecrets")
      .mockResolvedValue([{ id: "mine", name: "pass" } as SecretDoc, { id: "s-3", name: "renamed" } as SecretDoc]);
    const read = vi.spyOn(vault, "readSecret");
    const fixture = TestBed.createComponent(ImportDialog);
    await pipeline.stage("shop.wayfarer.json", file);
    await vi.waitFor(() => expect(list).toHaveBeenCalled());
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const lines = [...host.querySelectorAll<HTMLElement>(".import-need")];
    expect(lines.map((line) => line.dataset["need"])).toEqual([
      "secrets-missing",
      "secrets-same-name",
      "secrets-yours",
      "credentials",
      "scripts",
    ]);
    expect(lines.map((line) => line.innerText.replace(/\s+/g, " ").trim())).toEqual([
      "Needs 1 secret you do not have: token A request that uses it is not sent until you give the variable a value.",
      "Needs 1 of the sender's secrets: pass Your vault has a secret of that name, but this collection refers to the sender's. A request that uses it is not sent until you give the variable a value.",
      "Uses your secret: own",
      "1 credential was not shared and is ***. Type yours in Auth.",
      "1 script came with it. It does not run until you read it and trust it.",
    ]);
    expect(lines[0].querySelector("ul.type-mono-body li")?.textContent).toBe("token");
    // The lines come before the hosts.
    const hosts = host.querySelector(".import-hosts");
    expect(lines[4].compareDocumentPosition(hosts as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Needs 1 secret you do not have: token. A request that uses it is not sent until you give the variable a value.",
    );
    expect(read).not.toHaveBeenCalled();
  });
});
