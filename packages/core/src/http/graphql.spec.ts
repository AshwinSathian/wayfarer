import { describe, expect, it } from "vitest";
import { exportBody } from "../export/request";
import { validateRequestContent } from "../model/validate";
import { emptyRequest } from "../model/request";
import { Redactor } from "../redact/redactor";
import { scriptRequestOf, withScriptRequest } from "../scripting/request-view";
import { graphqlPayload } from "./graphql";

// P5.5: a GraphQL body is a query and its variables, sent as one JSON object.
describe("graphqlPayload", () => {
  it("is the JSON a GraphQL server reads: the query as text, the variables as the object they are", () => {
    expect(graphqlPayload("query Q($id: ID!) { pet(id: $id) { name } }", '{ "id": "7", "deep": { "n": 1 } }')).toEqual({
      text: '{"query":"query Q($id: ID!) { pet(id: $id) { name } }","variables":{"id":"7","deep":{"n":1}}}',
    });
  });

  it("names no variables when there are none", () => {
    expect(graphqlPayload("{ hello }", "")).toEqual({ text: '{"query":"{ hello }"}' });
    expect(graphqlPayload("{ hello }", "  \n ")).toEqual({ text: '{"query":"{ hello }"}' });
  });

  it("says why variables cannot be sent: not JSON, or JSON that is no object", () => {
    expect(graphqlPayload("{ hello }", "{ id: 7 }")).toEqual({ error: "The GraphQL variables are not JSON." });
    expect(graphqlPayload("{ hello }", "[1]")).toEqual({ error: "The GraphQL variables must be a JSON object." });
    expect(graphqlPayload("{ hello }", "null")).toEqual({ error: "The GraphQL variables must be a JSON object." });
  });
});

describe("a GraphQL body in the model", () => {
  const request = { ...emptyRequest(), method: "POST", url: "https://api.test/graphql", body: { mode: "graphql" as const, graphql: { query: "{ hello(name: \"{{who}}\") }", variables: '{"token":"s3cret-value"}' } } };

  it("is valid with a query and variables that are text, and not without them", () => {
    expect(validateRequestContent(request, "r")).toEqual([]);
    expect(validateRequestContent({ ...request, body: { mode: "graphql" } }, "r").map((issue) => issue.path)).toEqual(["r.body.graphql"]);
    expect(validateRequestContent({ ...request, body: { mode: "graphql", graphql: { query: 1, variables: null } } }, "r").map((issue) => issue.path)).toEqual(["r.body.graphql.query", "r.body.graphql.variables"]);
  });

  it("is exported, and shown to a script, as the JSON text it is sent as, with its variables replaced", () => {
    const resolve = (text: string) => text.replace("{{who}}", "Ada");
    expect(exportBody(request.body, "POST", resolve)).toEqual({ mode: "raw", text: '{"query":"{ hello(name: \\"Ada\\") }","variables":{"token":"s3cret-value"}}' });
    expect(scriptRequestOf(request).body).toEqual({ mode: "raw", raw: '{"query":"{ hello(name: \\"{{who}}\\") }","variables":{"token":"s3cret-value"}}' });
  });

  it("stays a GraphQL body when a script hands it back as it saw it, and is the script's JSON text when the script changed it", () => {
    const seen = scriptRequestOf(request);
    expect(withScriptRequest(request, seen).body).toEqual(request.body);
    const changed = withScriptRequest(request, { ...seen, body: { mode: "raw", raw: '{"query":"{ other }"}' } }).body;
    expect(changed).toMatchObject({ mode: "raw", raw: { language: "json", text: '{"query":"{ other }"}' } });
  });

  it("has a secret masked in its query and in its variables when it is stored", () => {
    const stored = new Redactor(["s3cret-value"]).template({ ...request, body: { mode: "graphql", graphql: { query: "{ a(t: \"s3cret-value\") }", variables: '{"token":"s3cret-value"}' } } });
    expect(stored.body.graphql).toEqual({ query: '{ a(t: "***") }', variables: '{"token":"***"}' });
  });
});
