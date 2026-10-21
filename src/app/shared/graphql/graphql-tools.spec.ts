import { describe, expect, it } from "vitest";
import { completionsAt, introspectionQuery, outlineOf, problemsOf, schemaFrom } from "./graphql-tools";
import answer from "../../../../e2e/support/graphql-schema.json";

// P5.5: what the app does with a schema. The Monaco glue is in e2e/graphql.spec.ts.
describe("graphql-tools", () => {
  const schema = schemaFrom(JSON.stringify(answer));

  it("asks for a schema with the standard introspection query", () => {
    expect(introspectionQuery()).toContain("__schema");
  });

  it("reads an introspection answer, and says in a sentence when the text is not one", () => {
    expect(schema.getQueryType()?.name).toBe("Query");
    expect(() => schemaFrom("<html>")).toThrow("The server's answer is not JSON.");
    expect(() => schemaFrom('{"data":{"hello":"x"}}')).toThrow(
      "The server's answer holds no schema: it may not allow introspection.",
    );
    expect(() => schemaFrom('{"errors":[{"message":"introspection is disabled"}]}')).toThrow(
      "The server says: introspection is disabled",
    );
  });

  it("lists the types a person writes against, the root types first, each member with its arguments and type", () => {
    const outline = outlineOf(schema);
    expect(outline.types.map((type) => `${type.kind} ${type.name}${type.root ? ` (${type.root})` : ""}`)).toEqual([
      "type Query (query)",
      "type Mutation (mutation)",
      "enum Kind",
      "type Pet",
    ]);
    const query = outline.types[0];
    expect(query.members.map((member) => member.signature)).toEqual([
      "hello(name: String): String!",
      "pet(id: ID!): Pet",
      "pets: [Pet!]!",
    ]);
    expect(query.members[0].description).toBe("Says hello to someone, or to the world.");
    expect(outline.types[2].members.map((member) => member.name)).toEqual(["DOG", "CAT"]);
    expect(outline.types[3].description).toBe("An animal that can be adopted.");
  });

  it("finds a field the schema does not have, where it is, and a query that does not parse without any schema", () => {
    expect(problemsOf("{ hello }", schema)).toEqual([]);
    expect(problemsOf("", schema)).toEqual([]);
    const [unknown] = problemsOf("{\n  nope\n}", schema);
    expect(unknown).toMatchObject({ message: 'Cannot query field "nope" on type "Query".', line: 2, column: 3 });
    expect(problemsOf("{ hello ")[0].message).toContain("Syntax Error");
    // Without a schema a field cannot be wrong.
    expect(problemsOf("{ nope }")).toEqual([]);
  });

  it("offers what the schema allows at the cursor", () => {
    expect(completionsAt("{  }", 1, 3, schema).map((item) => item.label)).toEqual(
      expect.arrayContaining(["hello", "pet", "pets"]),
    );
    expect(completionsAt("{ pet(id: 1) {  } }", 1, 16, schema).map((item) => item.label)).toEqual(
      expect.arrayContaining(["id", "name", "kind"]),
    );
  });
});
