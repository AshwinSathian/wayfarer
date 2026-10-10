import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { EnvironmentDoc, ImportOptions, Imported } from "@wayfarer/core";
import { ImportError, importText } from "@wayfarer/core/import";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { inCollection, inFolder, requestContent, rowsOf } from "../../testing/request-fixtures";
import { ImportRefused, ImportWorkerClient } from "../shared/import/import-worker-client";
import { CollectionsStore } from "./collections-store";
import { EnvironmentsStore } from "./environments-store";
import { ImportPipeline } from "./import-pipeline";

const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1, version: 1 as const });
const collectionFile = JSON.stringify({
  $id: "wayfarer/collection/3",
  meta: meta("export-1"),
  collection: { id: "col-1", meta: meta("col-1"), name: "Billing", order: 1, variables: [], ...inCollection },
  folders: [{ id: "f-1", meta: meta("f-1"), collectionId: "col-1", name: "Auth", order: 1, ...inFolder }],
  requests: [{ id: "r-1", meta: meta("r-1"), collectionId: "col-1", folderId: "f-1", name: "Login", order: 1, ...requestContent({ method: "POST", url: "https://api.test/login" }) }],
});

const env = (id: string, name: string, order: number, vars: Record<string, string> = {}): EnvironmentDoc => ({ id, meta: meta(id), name, order, vars: rowsOf(vars) });
const environmentsFile = JSON.stringify({ $id: "wayfarer/environments/2", environments: [env("x", "Dev", 1, { host: "new" }), env("y", "QA", 2, { host: "qa" })] });

/** The worker's work, done here: the importers themselves, and their error as the page gets it. */
const worker = {
  run: vi.fn(async (text: string, options: ImportOptions): Promise<Imported> => {
    try {
      return importText(text, options);
    } catch (error) {
      if (error instanceof ImportError) throw new ImportRefused(error.message, error.issues);
      throw error;
    }
  }),
};

// The pipeline over the real importers (plan P4.1). These are the tests of the
// two services it replaced, `CollectionImport` and `EnvironmentImport`, with
// their assertions; the worker is stood in for by a direct call.
describe("ImportPipeline", () => {
  let service: ImportPipeline;
  const collections = { importCollection: vi.fn() };
  const existing = signal<EnvironmentDoc[]>([]);
  const environments = { environments: existing, updateEnvironment: vi.fn(), createEnvironment: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    existing.set([env("dev-1", "Dev", 1), env("stage-1", "Staging", 2)]);
    TestBed.configureTestingModule({
      providers: [
        { provide: CollectionsStore, useValue: collections },
        { provide: EnvironmentsStore, useValue: environments },
        { provide: ImportWorkerClient, useValue: worker },
      ],
    });
    service = TestBed.inject(ImportPipeline);
  });

  describe("a collection file", () => {
    it("stages a valid file with an overwrite preview, and stores nothing", async () => {
      await service.stage("billing.json", collectionFile);

      expect(service.dialogVisible()).toBe(true);
      expect(service.fileName()).toBe("billing.json");
      expect(service.refused()).toBeNull();
      expect(service.imported()?.report.counts).toEqual({ collections: 1, folders: 1, requests: 1, environments: 0 });
      expect(service.imported()?.collections[0].plan.every((entry) => entry.action === "overwrite")).toBe(true);
      expect(collections.importCollection).not.toHaveBeenCalled();
    });

    it("switching to 'import as a copy' re-plans with new ids, and confirm passes that choice on", async () => {
      await service.stage("billing.json", collectionFile);
      await service.toggleDuplicateAsNew(true);

      const analysis = service.imported()!.collections[0];
      expect(analysis.plan.every((entry) => entry.action === "create")).toBe(true);
      expect(analysis.payload.collection.id).not.toBe("col-1");

      await service.confirm();

      expect(collections.importCollection).toHaveBeenCalledExactlyOnceWith(analysis.payload, { duplicateAsNew: true });
      expect(service.dialogVisible()).toBe(false);
      expect(service.imported()).toBeNull();
      expect(service.duplicateAsNew()).toBe(false);
      expect(service.fileName()).toBe("");
    });

    it("shows the errors of an invalid file, has no preview, and imports nothing on confirm", async () => {
      await service.stage("bad.json", '{"collection":{}}');

      expect(service.dialogVisible()).toBe(true);
      expect(service.refused()?.message).toContain("This is not a file Wayfarer can import.");
      expect(service.imported()).toBeNull();
      await service.toggleDuplicateAsNew(true);
      expect(service.imported()).toBeNull();

      await service.confirm();

      expect(collections.importCollection).not.toHaveBeenCalled();
      expect(service.dialogVisible()).toBe(false);
    });

    it("names each wrong field of a file that says it is a collection", async () => {
      await service.stage("bad.json", collectionFile.replace('"POST"', '"post it"'));

      expect(service.refused()).toEqual({
        message: "The file is not a valid Wayfarer collection.",
        issues: [{ path: "requests[0].method", message: "Value must be an HTTP method: one word of at most 32 characters, in upper case." }],
      });
    });

    it("cancelled, stores nothing and forgets the file", async () => {
      await service.stage("billing.json", collectionFile);
      service.close();

      expect(collections.importCollection).not.toHaveBeenCalled();
      expect(service.dialogVisible()).toBe(false);
      expect(service.imported()).toBeNull();
      // A confirm that arrives after the dialog closed has nothing to store.
      await service.confirm();
      expect(collections.importCollection).not.toHaveBeenCalled();
    });
  });

  describe("an environments file", () => {
    it("stages a file: an environment with an existing name replaces it, a new name is added", async () => {
      await service.stage("envs.json", environmentsFile);

      expect(service.dialogVisible()).toBe(true);
      expect(service.fileName()).toBe("envs.json");
      expect(service.refused()).toBeNull();
      expect(service.environmentEntries().map((e) => [e.doc.name, e.action, e.targetId])).toEqual([
        ["Dev", "replace", "dev-1"],
        ["QA", "merge", null],
      ]);
    });

    it("shows why a bad file is refused and imports nothing on confirm", async () => {
      await service.stage("bad.json", "{nope");
      expect(service.refused()).toEqual({ message: "The file is not valid JSON, so it is not a file Wayfarer can import.", issues: [] });
      expect(service.environmentEntries()).toEqual([]);

      await service.confirm();

      expect(environments.updateEnvironment).not.toHaveBeenCalled();
      expect(environments.createEnvironment).not.toHaveBeenCalled();
      expect(service.dialogVisible()).toBe(false);
      expect(service.refused()).toBeNull();
    });

    it("lets the user switch a match to 'add', but never to 'replace' when nothing matches", async () => {
      await service.stage("envs.json", environmentsFile);

      service.setEntryAction(0, "merge");
      service.setEntryAction(1, "replace"); // QA matches nothing: stays "merge"
      service.setEntryAction(7, "merge"); // out of range: ignored

      expect(service.environmentEntries().map((e) => e.action)).toEqual(["merge", "merge"]);
    });

    it("confirm replaces matches in place and adds the rest under a name that is not taken", async () => {
      existing.update((list) => [...list, env("qa-1", "QA", 3), env("qa-2", "QA (2)", 4)]);
      await service.stage("envs.json", environmentsFile);
      service.setEntryAction(1, "merge"); // add the file's QA beside the existing ones

      await service.confirm();

      expect(environments.updateEnvironment).toHaveBeenCalledExactlyOnceWith("dev-1", { name: "Dev", description: undefined, vars: rowsOf({ host: "new" }) });
      expect(environments.createEnvironment).toHaveBeenCalledExactlyOnceWith({ name: "QA (3)", description: undefined, vars: rowsOf({ host: "qa" }) });
      expect(service.dialogVisible()).toBe(false);
      expect(service.environmentEntries()).toEqual([]);
      expect(service.fileName()).toBe("");
    });
  });

  it("a worker that fails is said as such, and nothing is stored", async () => {
    worker.run.mockRejectedValueOnce(new Error("worker crashed"));
    await service.stage("billing.json", collectionFile);

    expect(service.refused()?.message).toBe("The file could not be read: the import stopped with an error.");
    expect(service.reading()).toBe(false);
  });

  it("pick reads the chosen file, clears the input so the same file can be chosen again, and stages it", async () => {
    const input = document.createElement("input");
    input.type = "file";
    const files = new DataTransfer();
    files.items.add(new File([environmentsFile], "picked.json", { type: "application/json" }));
    input.files = files.files;
    const event = new Event("change");
    Object.defineProperty(event, "target", { value: input });

    await service.pick(event);

    expect(input.value).toBe("");
    expect(service.fileName()).toBe("picked.json");
    expect(service.environmentEntries()).toHaveLength(2);
  });
});
