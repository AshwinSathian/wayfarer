import { describe, expect, it } from "vitest";
import { WORKSPACE_FORMAT, validateWorkspaceFile } from "./workspace";

// The app's restore holds this to every store (src/app/services/workspace-backup.spec.ts); here, what the CLI reads.
describe("validateWorkspaceFile", () => {
  const meta = { id: "c", createdAt: 1, updatedAt: 1 };
  const collection = { id: "c", meta, name: "Shop", order: 0, variables: [], auth: { type: "none" }, scripts: { pre: "", post: "" }, scriptTrust: { trusted: true, approved: [] } };
  const file = (stores: Record<string, unknown>) => ({ $id: WORKSPACE_FORMAT, exportedAt: 1, stores: { collections: [collection], folders: [], requests: [], environments: [], secrets: [], meta: [], ...stores } });

  it("reads a file the app writes", () => {
    expect(validateWorkspaceFile(file({ meta: [{ key: "state", activeEnvironmentId: null }, { key: "globals", variables: [] }] }))).toEqual([]);
  });

  it("says what is wrong", () => {
    expect(validateWorkspaceFile({})).toEqual([`Not a Wayfarer workspace file: "$id" must be "${WORKSPACE_FORMAT}".`]);
    expect(validateWorkspaceFile({ $id: WORKSPACE_FORMAT, stores: [] })).toEqual(["stores: Value must be an object."]);
    expect(validateWorkspaceFile(file({ requests: [{ collectionId: "elsewhere" }] }))).toEqual(expect.arrayContaining(["stores.requests[0]: belongs to a collection that is not in the file."]));
    expect(validateWorkspaceFile(file({ collections: [{ ...collection, scriptTrust: undefined }] }))).toEqual(expect.arrayContaining(['collection "Shop": scriptTrust is missing.']));
    expect(validateWorkspaceFile(file({ meta: [{ key: "extra" }, { key: "state", activeEnvironmentId: 7 }] }))).toEqual(['stores.meta: "extra" is not a record the app keeps.', "stores.meta: the active environment must be an id or null."]);
    expect(validateWorkspaceFile(file({ secrets: [{ id: "s", meta: { id: "t" } }] }))).toEqual(expect.arrayContaining(["stores.secrets[0]: meta.id must be the secret's id."]));
    expect(validateWorkspaceFile(file({ history: [{ createdAt: "x", route: "pigeon", sent: {}, template: {} }] })).length).toBeGreaterThan(3);
  });
});
