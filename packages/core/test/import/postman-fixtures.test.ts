import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { postmanCollection } from "../../src/export/postman";
import { ImportError, importText, type Imported } from "../../src/import/import";
import type { CollectionExport } from "../../src/model/collection";
import { importTextOf } from "../../src/safe-json";

// P4.2: three sets of Postman files that other people wrote, vendored at
// pinned commits (packages/core/test/fixtures/postman/SOURCES.md):
// Newman's integration collections, six of Adyen's API collections, and
// Microsoft Graph's. Every collection and environment among them imports,
// and what the app cannot keep is a warning in the report.

const ROOT = join(__dirname, "../fixtures/postman");
const files: string[] = [];
const walk = (dir: string): void => {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith(".json")) files.push(path.slice(ROOT.length + 1));
  }
};
for (const set of ["adyen", "msgraph", "newman"]) walk(join(ROOT, set));

/** As the page reads a picked file: UTF-8, or UTF-16 by its byte order mark. */
const read = (file: string): string => importTextOf(readFileSync(join(ROOT, file)));

/** The JSON files of the three sets that are not collections or environments, each with what it is. */
const NOT_IMPORTED: Record<string, string> = {
  "newman/integration/data-file-var-replacement/data-file-var-replacement.postman_data.json": "a data file of a run",
  "newman/integration/globals-env-data-files/globals-env-data-files.postman_data.json": "a data file of a run",
  "newman/integration/steph/steph.postman_data.json": "a data file of a run",
  "newman/integration/redirect-test/redirect-test.postman_config.json": "Newman's options for a run",
  "newman/integration/timeout/timeout.postman_config.json": "Newman's options for a run",
  "newman/integration/v2-regression-tests/v2-regression-tests.postman_config.json": "Newman's options for a run",
  "newman/integration/tc4/upload-file.json": "a file a request uploads",
  "newman/integration/multi-level-folders-v1.postman_collection.json": "a Postman Collection v1",
};
const imported = files.filter((file) => !Object.hasOwn(NOT_IMPORTED, file));

/** A collection as what it holds, without the ids it was given: folders in folders, each with its requests, in order. */
function shape(payload: CollectionExport): unknown {
  const byOrder = <T extends { order: number }>(list: T[]) => [...list].sort((a, b) => a.order - b.order);
  const level = (parent: string | undefined): unknown => ({
    folders: byOrder(payload.folders.filter((folder) => folder.parentFolderId === parent)).map(({ id, meta: _meta, collectionId: _collection, parentFolderId: _parent, order: _order, ...folder }) => ({ ...folder, ...(level(id) as object) })),
    requests: byOrder(payload.requests.filter((request) => request.folderId === parent)).map(({ id: _id, meta: _meta, collectionId: _collection, folderId: _folder, order: _order, ...request }) => request),
  });
  const { id: _id, meta: _meta, order: _order, ...collection } = payload.collection;
  return { ...collection, ...(level(undefined) as object) };
}

describe("Postman files other people wrote (P4.2)", () => {
  it("the three sets are here: 42 entries of Newman's, six of Adyen's collections, and Microsoft Graph's", () => {
    expect(readdirSync(join(ROOT, "newman/integration"))).toHaveLength(42);
    expect(files.filter((file) => file.startsWith("adyen/"))).toHaveLength(6);
    expect(files.filter((file) => file.startsWith("msgraph/"))).toHaveLength(3);
    for (const set of ["newman/LICENSE.md", "adyen/LICENSE", "msgraph/LICENSE"]) expect(statSync(join(ROOT, set)).size).toBeGreaterThan(1000);
    expect(files).toHaveLength(71);
    expect(imported).toHaveLength(63);
    const formats = imported.map((file) => importText(read(file)).report.format);
    expect(formats.filter((format) => format === "postman-collection")).toHaveLength(51);
    expect(formats.filter((format) => format === "postman-environment")).toHaveLength(12);
  });

  it.each(imported)("@claim:C-058 imports with 0 errors: %s", (file) => {
    const result = importText(read(file));

    expect(["postman-collection", "postman-environment"]).toContain(result.report.format);
    expect(result.collections.length + result.environments.length).toBe(1);
    // An import approves nothing: the file holds no trust, and the store writes an imported collection untrusted.
    for (const { payload } of result.collections) expect(Object.hasOwn(payload.collection, "scriptTrust")).toBe(false);
  });

  it.each(Object.entries(NOT_IMPORTED))("is refused with a message, being %s: %s", (file) => {
    expect(() => importText(read(file))).toThrow(ImportError);
  });

  it("the one v1 collection is refused by name, with what to do", () => {
    expect(() => importText(read("newman/integration/multi-level-folders-v1.postman_collection.json"))).toThrow("This is a Postman Collection v1 file, which Wayfarer does not read. In Postman, export the collection as Collection v2.1 and import that.");
  });

  it.each(imported.filter((file) => importText(read(file)).collections.length))("@claim:C-057 exported as a Postman v2.1 file and imported again, it is the same collection: %s", (file) => {
    const first: Imported = importText(read(file));
    const exported = postmanCollection(first.collections[0].payload);
    const second = importText(JSON.stringify(exported.file));

    expect(shape(second.collections[0].payload)).toEqual(shape(first.collections[0].payload));
    expect(second.report.counts).toEqual(first.report.counts);
  });
});
