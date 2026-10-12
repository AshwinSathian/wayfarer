import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import answer from "../../../e2e/support/graphql-schema.json";
import { WorkspaceStore } from "../state/workspace-store";
import { GraphqlSchemas } from "./graphql-schemas";

// P5.5: a schema is asked for with the open tab's request, and kept for its address while the page lives.
describe("GraphqlSchemas", () => {
  const introspect = vi.fn<(query: string) => Promise<string>>();
  let schemas: GraphqlSchemas;

  beforeEach(() => {
    introspect.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStore, useValue: { introspect } }] });
    schemas = TestBed.inject(GraphqlSchemas);
  });

  it("asks through the store with the introspection query, and keeps the schema's outline for that address", async () => {
    introspect.mockResolvedValue(JSON.stringify(answer));
    expect(schemas.stateOf("https://a.test/graphql")).toBeUndefined();
    const fetched = schemas.fetch("https://a.test/graphql");
    expect(schemas.stateOf("https://a.test/graphql")).toEqual({ status: "loading" });
    await fetched;
    expect(introspect.mock.calls[0][0]).toContain("__schema");
    expect(schemas.stateOf("https://a.test/graphql")?.status).toBe("ready");
    expect(schemas.stateOf("https://a.test/graphql")?.outline?.types.map((type) => type.name)).toEqual(["Query", "Mutation", "Kind", "Pet"]);
    // Another address has none, and a name an object has of itself is no address.
    expect(schemas.stateOf("https://b.test/graphql")).toBeUndefined();
    expect(schemas.stateOf("constructor")).toBeUndefined();
  });

  it("says why there is no schema: what the store said, or what the answer was", async () => {
    introspect.mockRejectedValue(new Error("Please enter a valid URL"));
    await schemas.fetch("nowhere");
    expect(schemas.stateOf("nowhere")).toEqual({ status: "error", error: "Please enter a valid URL" });

    introspect.mockResolvedValue('{"errors":[{"message":"introspection is disabled"}]}');
    await schemas.fetch("https://a.test/graphql");
    expect(schemas.stateOf("https://a.test/graphql")?.error).toContain("The server says: introspection is disabled");
  });

  it("keeps the schema it had when a refresh fails", async () => {
    introspect.mockResolvedValue(JSON.stringify(answer));
    await schemas.fetch("https://a.test/graphql");
    introspect.mockRejectedValue(new Error("Failed to fetch"));
    await schemas.fetch("https://a.test/graphql");
    const state = schemas.stateOf("https://a.test/graphql");
    expect(state?.status).toBe("error");
    expect(state?.error).toBe("Failed to fetch");
    expect(state?.outline?.types).toHaveLength(4);
  });
});
