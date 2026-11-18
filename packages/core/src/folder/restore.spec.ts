import { describe, expect, it } from "vitest";
import { inCollection, inFolder, requestContent } from "../../test/request-fixtures";
import { COLLECTION_FORMAT, type CollectionExport } from "../model/collection";
import { keepCredentialsHere } from "./restore";

const meta = (id: string) => ({ id, createdAt: 0, updatedAt: 0 });
const file = (token: string, headerValue: string): CollectionExport => ({
  $id: COLLECTION_FORMAT,
  meta: meta("c"),
  collection: {
    id: "c",
    meta: meta("c"),
    name: "C",
    order: 1,
    variables: [],
    ...inCollection,
    auth: { type: "bearer", token },
  },
  folders: [{ id: "f", meta: meta("f"), collectionId: "c", name: "F", order: 1, ...inFolder }],
  requests: [
    {
      id: "r",
      meta: meta("r"),
      collectionId: "c",
      name: "R",
      order: 1,
      ...requestContent({ headers: [{ key: "Authorization", value: headerValue, enabled: true }] }),
    },
  ],
});

describe("keepCredentialsHere", () => {
  it("puts back a credential typed here where the folder has the mask, and takes everything else from the folder", () => {
    const taken = file("***", "***");
    taken.requests[0].name = "Renamed";
    const out = keepCredentialsHere(taken, file("real-token", "Bearer real"));
    expect(out.collection.auth).toEqual({ type: "bearer", token: "real-token" });
    expect(out.requests[0].headers[0].value).toBe("Bearer real");
    expect(out.requests[0].name).toBe("Renamed");
  });

  it("leaves a mask where nothing here is at the same place, and a value the folder changed", () => {
    const taken = file("***", "Bearer other");
    const here = file("real", "Bearer real");
    here.requests[0].headers[0].key = "X-Other";
    const out = keepCredentialsHere(taken, here);
    expect(out.requests[0].headers[0].value).toBe("Bearer other");
    expect(keepCredentialsHere(file("***", "***"), { ...here, requests: [] }).requests[0].headers[0].value).toBe("***");
  });
});
