import { describe, expect, it } from "vitest";
import { WORKSPACE_FORMAT, validateWorkspaceFile } from "./workspace";

// The app's restore holds this to every store (src/app/services/workspace-backup.spec.ts); here, what the CLI reads.
describe("validateWorkspaceFile", () => {
  const meta = { id: "c", createdAt: 1, updatedAt: 1 };
  const collection = {
    id: "c",
    meta,
    name: "Shop",
    order: 0,
    variables: [],
    auth: { type: "none" },
    scripts: { pre: "", post: "" },
    scriptTrust: { trusted: true, approved: [] },
  };
  const file = (stores: Record<string, unknown>) => ({
    $id: WORKSPACE_FORMAT,
    exportedAt: 1,
    stores: {
      collections: [collection],
      folders: [],
      requests: [],
      environments: [],
      secrets: [],
      meta: [],
      ...stores,
    },
  });

  it("reads a file the app writes", () => {
    expect(
      validateWorkspaceFile(
        file({
          meta: [
            { key: "state", activeEnvironmentId: null },
            { key: "globals", variables: [] },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("says what is wrong", () => {
    expect(validateWorkspaceFile({})).toEqual([`Not a Wayfarer workspace file: "$id" must be "${WORKSPACE_FORMAT}".`]);
    expect(validateWorkspaceFile({ $id: WORKSPACE_FORMAT, stores: [] })).toEqual(["stores: Value must be an object."]);
    expect(validateWorkspaceFile(file({ requests: [{ collectionId: "elsewhere" }] }))).toEqual(
      expect.arrayContaining(["stores.requests[0]: belongs to a collection that is not in the file."]),
    );
    expect(validateWorkspaceFile(file({ collections: [{ ...collection, scriptTrust: undefined }] }))).toEqual(
      expect.arrayContaining(['collection "Shop": scriptTrust is missing.']),
    );
    expect(validateWorkspaceFile(file({ meta: [{ key: "extra" }, { key: "state", activeEnvironmentId: 7 }] }))).toEqual(
      [
        'stores.meta: "extra" is not a record the app keeps.',
        "stores.meta: the active environment must be an id or null.",
      ],
    );
    expect(validateWorkspaceFile(file({ secrets: [{ id: "s", meta: { id: "t" } }] }))).toEqual(
      expect.arrayContaining(["stores.secrets[0]: meta.id must be the secret's id."]),
    );
    expect(
      validateWorkspaceFile(file({ history: [{ createdAt: "x", route: "pigeon", sent: {}, template: {} }] })).length,
    ).toBeGreaterThan(3);
  });

  describe("a history entry's exchange record (D4.12)", () => {
    const record = {
      status: { code: 200, text: "OK" },
      durationMs: 12.5,
      route: "direct",
      unpaired: true,
      host: "api.example.com",
      secrets: [{ name: "token", scope: "environment", holder: 'environment "Local"' }, { name: "{{$secret.x}}" }],
      masked: { address: true, headers: ["Authorization"], body: true, responseHeaders: [], responseBody: true },
      kept: { response: true, body: true },
      failure: { kind: "network", reported: "Failed to fetch", summary: "The request got no response." },
    };
    const entry = (fields: Record<string, unknown>) => ({
      createdAt: 1,
      route: "direct",
      sent: { method: "GET", url: "https://api.example.com/", headers: [] },
      template: {
        method: "GET",
        url: "https://api.example.com/",
        params: [],
        headers: [],
        body: { mode: "none" },
        auth: { type: "none" },
        scripts: { pre: "", post: "" },
        tests: [],
        settings: {},
      },
      ...fields,
    });
    const problems = (value: unknown) => validateWorkspaceFile(file({ history: [entry({ record: value })] }));

    it("reads a record the app writes, and an entry with none", () => {
      expect(problems(record)).toEqual([]);
      expect(validateWorkspaceFile(file({ history: [entry({})] }))).toEqual([]);
    });

    it("refuses a crafted backup: a field the app does not write, at any depth, and a value it does not write", () => {
      expect(
        problems({
          ...record,
          html: "<img src=x onerror=alert(1)>",
          secrets: [{ name: "token", value: "the plaintext" }],
          masked: { ...record.masked, extra: 1 },
          failure: { ...record.failure, stack: "…" },
        }),
      ).toEqual([
        "stores.history[0].record.html: The app writes no such field.",
        "stores.history[0].record.secrets[0].value: The app writes no such field.",
        "stores.history[0].record.masked.extra: The app writes no such field.",
        "stores.history[0].record.failure.stack: The app writes no such field.",
      ]);
      expect(
        problems({
          ...record,
          status: { code: 1000, text: 1 },
          durationMs: -1,
          route: "pigeon",
          unpaired: false,
          host: 7,
          secrets: [{ name: "a", scope: "planet" }, "b"],
          masked: { headers: "Authorization", responseHeaders: [1] },
          kept: { response: "yes", body: true },
          failure: { kind: "flood", reported: "", summary: null },
        }),
      ).toEqual([
        "stores.history[0].record.status.code: Value is not one the app writes.",
        "stores.history[0].record.status.text: Value is not one the app writes.",
        "stores.history[0].record.durationMs: Value is not one the app writes.",
        "stores.history[0].record.route: Value is not one the app writes.",
        "stores.history[0].record.unpaired: Value is not one the app writes.",
        "stores.history[0].record.host: Value is not one the app writes.",
        "stores.history[0].record.secrets[0].scope: Value is not one the app writes.",
        "stores.history[0].record.secrets[1]: Value must be an object.",
        "stores.history[0].record.masked.headers: Value is not one the app writes.",
        "stores.history[0].record.masked.responseHeaders: Value is not one the app writes.",
        "stores.history[0].record.kept.response: Value is not one the app writes.",
        "stores.history[0].record.failure.kind: Value is not one the app writes.",
        "stores.history[0].record.failure.summary: Value is not one the app writes.",
      ]);
      expect(problems("a record")).toEqual(["stores.history[0].record: Value must be an object."]);
      expect(problems({ ...record, secrets: {} })).toEqual([
        "stores.history[0].record.secrets: Value is not one the app writes.",
      ]);
      expect(problems({ ...record, masked: [] })).toEqual([
        "stores.history[0].record.masked: Value must be an object.",
      ]);
    });
  });
});
