import { describe, expect, it } from "vitest";
import { rowsOf } from "../../test/request-fixtures";
import type { Ancestor } from "../model/collection";
import { VariableResolver, type ScopeStack } from "../variables/resolver";
import { previewAddress, previewVariables } from "./preview";

const ancestor = (name: string, variables: Record<string, string>): Ancestor => ({
  name,
  variables: rowsOf(variables),
  auth: { type: "none" },
  scripts: { pre: "", post: "" },
});

describe("the preview before Send (D4.12, DQ8)", () => {
  const scopes: ScopeStack = {
    environment: rowsOf({ token: "{{$secret.s1}}", host: "api.example.com" }),
    folder: rowsOf({ page: "2", where: "outer" }),
    collection: rowsOf({ token: "collection-value", page: "1" }),
    global: rowsOf({ host: "global.example.com", region: "eu" }),
  };
  const holders = {
    environment: "Local",
    ancestors: [
      ancestor('collection "Shop"', {}),
      ancestor('folder "Outer"', { where: "outer" }),
      ancestor('folder "Pets"', { page: "2" }),
    ],
  };
  const tokens = new VariableResolver(scopes).tokens({
    url: "https://{{host}}/pets?page={{page}}&r={{region}}&w={{where}}",
    headers: [{ key: "Authorization", value: "Bearer {{token}}" }],
    body: ["{{missing}} {{$guid}} {{token}}"],
  });

  it("names each variable once, where it comes from and what it hides, a secret masked", () => {
    expect(previewVariables(tokens, scopes, holders)).toEqual([
      {
        name: "host",
        source: "environment",
        holder: 'environment "Local"',
        value: "api.example.com",
        shadows: ["the globals"],
      },
      { name: "page", source: "folder", holder: 'folder "Pets"', value: "2", shadows: ['collection "Shop"'] },
      { name: "region", source: "global", holder: "the globals", value: "eu", shadows: [] },
      { name: "where", source: "folder", holder: 'folder "Outer"', value: "outer", shadows: [] },
      {
        name: "token",
        source: "environment",
        holder: 'environment "Local"',
        vaulted: true,
        shadows: ['collection "Shop"'],
      },
      { name: "missing", source: "missing", shadows: [] },
      { name: "$guid", source: "dynamic", shadows: [] },
    ]);
  });

  it("names a scope by its kind when nothing names its holder", () => {
    const [host] = previewVariables(tokens, scopes, { ancestors: [] });
    expect(host).toMatchObject({ holder: "the environment", shadows: ["the globals"] });
    const [, page] = previewVariables(tokens, scopes, { ancestors: [] });
    expect(page).toMatchObject({ holder: "a folder", shadows: ["the collection"] });
  });

  it("gives the address as it would go, with a vault secret as *** and the vault not read", () => {
    expect(previewAddress(" {{host}}/k/{{token}} ", scopes)).toBe("https://api.example.com/k/***");
    expect(previewAddress("{{a}}", { environment: rowsOf({ a: "{{b}}", b: "{{a}}" }) })).toBe("{{a}}");
  });
});
