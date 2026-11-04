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
