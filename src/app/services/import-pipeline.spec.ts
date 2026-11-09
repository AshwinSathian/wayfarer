import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import {
  LINK_NOT_COLLECTION,
  encodeShareLink,
  shareFragment,
  type EnvironmentDoc,
  type ImportOptions,
  type Imported,
} from "@wayfarer/core";
import { ImportError, importText } from "@wayfarer/core/import";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { inCollection, inFolder, requestContent, rowsOf } from "../../testing/request-fixtures";
import { ImportRefused, ImportWorkerClient } from "../shared/import/import-worker-client";
import { CollectionsStore } from "./collections-store";
import { diagnosticEntries } from "./diagnostics";
import { EnvironmentsStore } from "./environments-store";
import { ImportPipeline } from "./import-pipeline";
import { UndoNotice } from "./undo-notice";

const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1 });
const collectionFile = JSON.stringify({
  $id: "wayfarer/collection",
  meta: meta("export-1"),
  collection: { id: "col-1", meta: meta("col-1"), name: "Billing", order: 1, variables: [], ...inCollection },
  folders: [{ id: "f-1", meta: meta("f-1"), collectionId: "col-1", name: "Auth", order: 1, ...inFolder }],
  requests: [
    {
      id: "r-1",
      meta: meta("r-1"),
      collectionId: "col-1",
      folderId: "f-1",
      name: "Login",
      order: 1,
      ...requestContent({ method: "POST", url: "https://api.test/login" }),
    },
  ],
});

const env = (id: string, name: string, order: number, vars: Record<string, string> = {}): EnvironmentDoc => ({
  id,
  meta: meta(id),
  name,
  order,
  vars: rowsOf(vars),
});
const environmentsFile = JSON.stringify({
  $id: "wayfarer/environments",
  environments: [env("x", "Dev", 1, { host: "new" }), env("y", "QA", 2, { host: "qa" })],
});

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
  const collections = { importCollection: vi.fn(), undoImport: vi.fn() };
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

  // C-035's stall in Firefox (e2e/FLAKES.md): the report still said "Reading" 5 s after the file, with nothing in the
  // console to say whether the worker had started. A read still waiting for the worker after 5 s says so.
  describe("a read whose worker does not answer", () => {
    it("records after 5 s that the worker has not answered", async () => {
      worker.run.mockImplementationOnce(() => new Promise<Imported>(() => undefined));
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        void service.stage("billing.json", collectionFile);
        vi.advanceTimersByTime(4_999);
        expect(diagnosticEntries().filter((entry) => entry.context === "import")).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(
          diagnosticEntries()
            .filter((entry) => entry.context === "import")
            .map((entry) => entry.message),
        ).toEqual(["the import worker has not answered after 5 s"]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("records nothing for a read that finished", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        await service.stage("billing.json", collectionFile);
        const before = diagnosticEntries().length;
        vi.advanceTimersByTime(10_000);
        expect(diagnosticEntries().length).toBe(before);
      } finally {
        vi.useRealTimers();
      }
    });
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

      expect(collections.importCollection).toHaveBeenCalledExactlyOnceWith(analysis.payload, {
        duplicateAsNew: true,
        replaced: expect.any(Function) as unknown,
      });
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
        message: "This file is not a Wayfarer collection. What does not match is listed below.",
        issues: [
          {
            path: "requests[0].method",
            message: "Value must be an HTTP method: one word of at most 32 characters, in upper case.",
          },
        ],
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
      expect(service.refused()).toEqual({
        message: "The file is neither JSON nor YAML that can be read, so it is not a file Wayfarer can import.",
        issues: [],
      });
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

      expect(environments.updateEnvironment).toHaveBeenCalledExactlyOnceWith("dev-1", {
        name: "Dev",
        description: undefined,
        vars: rowsOf({ host: "new" }),
      });
      expect(environments.createEnvironment).toHaveBeenCalledExactlyOnceWith({
        name: "QA (3)",
        description: undefined,
        vars: rowsOf({ host: "qa" }),
      });
      expect(service.dialogVisible()).toBe(false);
      expect(service.environmentEntries()).toEqual([]);
      expect(service.fileName()).toBe("");
    });
  });

  it("a pasted link is read from its first #, whatever the origin, or as a bare fragment; other text is refused", async () => {
    const fragment = shareFragment(await encodeShareLink('{"$id":"wayfarer/collection"}'), false);
    for (const pasted of [`  https://elsewhere.example/app/?q=1${fragment}\n`, fragment]) {
      service.openPaste("link");
      await service.openPastedLink(pasted);
      expect([service.pasting(), service.refused(), service.dialogVisible()]).toEqual([null, null, true]);
      expect(service.link()?.code).toBe(null);
    }
    for (const pasted of ["https://elsewhere.example/app/", "share=abc", ""]) {
      await service.openPastedLink(pasted);
      expect([service.link(), service.refused()?.message]).toEqual([null, LINK_NOT_COLLECTION]);
    }
  });

  it("a pasted cURL command takes the same road: the box, then the report, and nothing stored before Confirm", async () => {
    service.openPaste();
    expect([service.dialogVisible(), service.pasting(), service.imported()]).toEqual([true, "curl", null]);

    await service.stage("the pasted command", "curl -k https://api.test/users -H 'Accept: */*'");
    expect(service.pasting()).toBe(null);
    expect(service.imported()?.report).toMatchObject({
      formatName: "cURL command",
      counts: { collections: 1, folders: 0, requests: 1, environments: 0 },
    });
    expect(service.imported()?.report.warnings).toHaveLength(1);
    expect(collections.importCollection).not.toHaveBeenCalled();

    await service.confirm();
    expect(collections.importCollection).toHaveBeenCalledTimes(1);
    expect(collections.importCollection.mock.calls[0][0]).toMatchObject({
      collection: { name: "Imported from cURL" },
      requests: [{ name: "GET api.test/users", url: "https://api.test/users" }],
    });
  });

  // receive.md, "Done": a link's Import is said by the collection's name, and the shell is told which row to focus.
  // A security review of T1 (session T-a close-out): what an Import stores and says is what its report showed, and an
  // import that was cancelled or overtaken does not come back.
  describe("an import that was cancelled or overtaken", () => {
    it("Cancel while a link opens: the report does not come back", async () => {
      const link = await encodeShareLink(collectionFile);
      const opening = service.openLink(shareFragment(link, true));
      service.close();
      await opening;

      expect(service.dialogVisible()).toBe(false);
      expect(service.imported()).toBeNull();
    });

    it("a report staged while the last one is being stored stays open, and the stored one is said by its own name", async () => {
      const undo = TestBed.inject(UndoNotice);
      let stored!: () => void;
      collections.importCollection.mockImplementation(
        () => new Promise((resolve) => (stored = () => resolve({ meta: meta("col-1"), name: "Billing" }))),
      );
      await service.stage("billing.json", collectionFile);
      const confirming = service.confirm();
      await vi.waitFor(() => expect(stored).toBeTypeOf("function"));
      // A link opened meanwhile, from the address bar: its report replaces the dialog's.
      service.close();
      await service.stage("other.json", environmentsFile);
      stored();
      await confirming;

      expect(undo.current()?.message).toBe("Imported billing.json.");
      expect(service.dialogVisible()).toBe(true);
      expect(service.fileName()).toBe("other.json");
      expect(service.imported()).not.toBeNull();
      expect(environments.createEnvironment).not.toHaveBeenCalled();
      expect(environments.updateEnvironment).not.toHaveBeenCalled();
    });
  });

  it("a link's Import says Added and the collection's name, and names the collection it added", async () => {
    const undo = TestBed.inject(UndoNotice);
    collections.importCollection.mockResolvedValue({ meta: meta("col-1"), name: "Billing" });
    const link = await encodeShareLink(collectionFile);
    await service.openLink(shareFragment(link, true));
    await vi.waitFor(() => expect(service.imported()).not.toBeNull());

    await service.confirm();

    expect(undo.current()?.message).toBe("Added Billing.");
    expect(service.addedFromLink()).toEqual({ id: "col-1" });
  });

  it("a file's Import is said by the file's name, and moves no focus", async () => {
    const undo = TestBed.inject(UndoNotice);
    collections.importCollection.mockResolvedValue({ meta: meta("col-1"), name: "Billing" });
    await service.stage("billing.json", collectionFile);

    await service.confirm();

    expect(undo.current()?.message).toBe("Imported billing.json.");
    expect(service.addedFromLink()).toBeNull();
  });

  it("a write that fails part way says how much was stored, and offers the Undo of that part", async () => {
    const undo = TestBed.inject(UndoNotice);
    const one = importText(collectionFile, { duplicateAsNew: false });
    worker.run.mockResolvedValueOnce({ ...one, collections: [one.collections[0], one.collections[0]] });
    collections.importCollection
      .mockResolvedValueOnce({ meta: meta("col-1"), name: "Billing" })
      .mockRejectedValueOnce(new DOMException("full", "QuotaExceededError"));
    await service.stage("billing.json", collectionFile);

    await expect(service.confirm()).resolves.toEqual(["col-1"]);

    expect(service.refused()?.message).toContain("1 of 2 collections were stored");
    expect(service.storing()).toBe(false);
    expect(undo.current()?.message).toBe("Imported part of billing.json.");
    await undo.undo();
    expect(collections.undoImport).toHaveBeenCalledWith(["col-1"], []);
  });

  it("an import's Undo deletes what it added and puts back what it replaced in one call, and stays when it fails", async () => {
    const undo = TestBed.inject(UndoNotice);
    const original = { collections: [], folders: [], requests: [], files: [] };
    collections.importCollection.mockImplementationOnce(
      async (_payload: unknown, options: { replaced: (removed: typeof original) => void }) => {
        options.replaced(original);
        return { meta: meta("col-1"), name: "Billing" };
      },
    );
    collections.undoImport.mockRejectedValueOnce(new Error("aborted"));
    await service.stage("billing.json", collectionFile);
    await service.confirm();

    await undo.undo();

    expect(collections.undoImport).toHaveBeenCalledExactlyOnceWith(["col-1"], [original]);
    expect(undo.current()?.message).toBe("Imported billing.json.");
  });

  it("a worker that fails is said as such, and nothing is stored", async () => {
    worker.run.mockRejectedValueOnce(new Error("worker crashed"));
    await service.stage("billing.json", collectionFile);

    expect(service.refused()?.message).toBe(
      "The file was not imported: reading it stopped with an error. Settings › Diagnostics has the details.",
    );
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
