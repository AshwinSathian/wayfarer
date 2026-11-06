import { describe, expect, it } from "vitest";
import type { CollectionExport } from "../model/collection";
import { emptyAuth } from "../model/request";
import { receiverLines, receiverLineText } from "./receiver-lines";

const row = (key: string, value: string) => ({ key, value, enabled: true });
const holder = { name: "x", auth: { type: "none" }, variables: [], scripts: { pre: "", post: "" } };
function collection(parts: {
  variables?: { key: string; value: string; enabled: boolean }[];
  folderVariables?: { key: string; value: string; enabled: boolean }[];
  auths?: object[];
  scripts?: string[];
}): CollectionExport {
  return {
    collection: { ...holder, variables: parts.variables ?? [] },
    folders: [{ ...holder, meta: { id: "f1" }, variables: parts.folderVariables ?? [] }],
    requests: (parts.auths ?? [{ type: "none" }]).map((auth, at) => ({
      ...holder,
      url: "https://api.example.com",
      auth,
      scripts: { pre: parts.scripts?.[at] ?? "", post: "" },
    })),
  } as unknown as CollectionExport;
}

describe("receiverLines", () => {
  it("says nothing of a collection that needs nothing", () => {
    expect(receiverLines(collection({ variables: [row("host", "api.example.com")] }), [])).toEqual([]);
  });

  it("names the secrets the vault does not have, and those it has, by name", () => {
    const lines = receiverLines(
      collection({
        variables: [
          row("token", "{{$secret.s-1}}"),
          row("key", " {{ $secret.s-2 }} "),
          row("note", "a {{$secret.s-3}}"),
        ],
        folderVariables: [row(" token ", "{{$secret.s-9}}"), row("pass", "{{$secret.s-4}}")],
      }),
      ["pass", "other"],
    );
    expect(lines.map(receiverLineText)).toEqual([
      "Needs 2 secrets you do not have: token, key. Requests that use them ask for them when you send them.",
      "Uses your secret: pass.",
    ]);
    expect(lines[0].names).toEqual(["token", "key"]);
  });

  it("agrees in the singular, and in the plural of the vault's names", () => {
    const one = collection({ variables: [row("token", "{{$secret.a}}")] });
    expect(receiverLines(one, []).map(receiverLineText)).toEqual([
      "Needs 1 secret you do not have: token. Requests that use it ask for it when you send them.",
    ]);
    const two = collection({ variables: [row("a", "{{$secret.a}}"), row("b", "{{$secret.b}}")] });
    expect(receiverLines(two, ["a", "b"]).map(receiverLineText)).toEqual(["Uses your secrets: a, b."]);
  });

  it("does not say which the person has when the vault's names could not be read", () => {
    expect(
      receiverLines(collection({ variables: [row("token", "{{$secret.a}}")] }), null).map(receiverLineText),
    ).toEqual(["Needs 1 secret: token. Requests that use it ask for it when you send them."]);
    expect(receiverLines(collection({}), null)).toEqual([]);
  });

  it("keeps a name with odd characters as it is written, and matches it exactly", () => {
    const name = 'api key "prod" <x> {ü}';
    const lines = receiverLines(
      collection({ variables: [row(name, "{{$secret.a}}"), row("__proto__", "{{$secret.b}}")] }),
      ["constructor", "__proto__"],
    );
    expect(lines.map((line) => [line.kind, line.names])).toEqual([
      ["secrets-missing", [name]],
      ["secrets-yours", ["__proto__"]],
    ]);
  });

  it("counts the credentials the share masked, in every auth type and holder", () => {
    const lines = receiverLines(
      collection({
        auths: [
          { ...emptyAuth("bearer"), token: "***" },
          { ...emptyAuth("basic"), username: "ana", password: "***" },
          { ...emptyAuth("awsv4"), secretKey: "***", sessionToken: "***" },
          { ...emptyAuth("oauth2"), clientSecret: "***", password: "" },
          { ...emptyAuth("apikey"), value: "{{key}}" },
        ],
      }),
      [],
    );
    expect(lines.map(receiverLineText)).toEqual(["5 credentials were not shared and are ***. Type yours in Auth."]);
    expect(
      receiverLines(collection({ auths: [{ ...emptyAuth("apikey"), value: "***" }] }), []).map(receiverLineText),
    ).toEqual(["1 credential was not shared and is ***. Type yours in Auth."]);
  });

  it("counts the scripts that came with it", () => {
    expect(
      receiverLines(collection({ auths: [{ type: "none" }], scripts: ["pm.test()"] }), []).map(receiverLineText),
    ).toEqual(["1 script came with it. It does not run until you read it and trust it."]);
    expect(
      receiverLines(collection({ auths: [{ type: "none" }, { type: "none" }], scripts: ["a()", " b() "] }), []).map(
        receiverLineText,
      ),
    ).toEqual(["2 scripts came with it. They do not run until you read them and trust them."]);
  });

  it("orders secrets, credentials, scripts", () => {
    const lines = receiverLines(
      collection({
        variables: [row("token", "{{$secret.a}}")],
        auths: [{ ...emptyAuth("bearer"), token: "***" }],
        scripts: ["a()"],
      }),
      [],
    );
    expect(lines.map((line) => line.kind)).toEqual(["secrets-missing", "credentials", "scripts"]);
  });
});
