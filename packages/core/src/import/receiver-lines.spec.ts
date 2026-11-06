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

  // A send reads the vault by the reference's id: a secret of the same name is not the one a request is sent with.
  const secret = (id: string, name: string) => ({ id, name });

  it("says the secrets the vault does not have, those it has of the same name, and those it has, by id", () => {
    const lines = receiverLines(
      collection({
        variables: [
          row("token", "{{$secret.s-1}}"),
          row("key", " {{ $secret.s-2 }} "),
          row("note", "a {{$secret.s-3}}"),
        ],
        folderVariables: [
          row(" token ", "{{$secret.s-9}}"),
          row("pass", "{{$secret.s-4}}"),
          row("mine", "{{$secret.m}}"),
        ],
      }),
      [secret("other-id", "pass"), secret("m", "renamed here"), secret("x", "other")],
    );
    expect(lines.map(receiverLineText)).toEqual([
      "Needs 2 secrets you do not have: token, key. Requests that use them are not sent until you give the variables values.",
      "Needs 1 of the sender's secrets: pass. Your vault has a secret of that name, but this collection refers to the sender's. A request that uses it is not sent until you give the variable a value.",
      "Uses your secret: mine.",
    ]);
    expect(lines[0].names).toEqual(["token", "key"]);
  });

  it("agrees in the singular and the plural", () => {
    const one = collection({ variables: [row("token", "{{$secret.a}}")] });
    expect(receiverLines(one, []).map(receiverLineText)).toEqual([
      "Needs 1 secret you do not have: token. A request that uses it is not sent until you give the variable a value.",
    ]);
    const two = collection({ variables: [row("a", "{{$secret.a}}"), row("b", "{{$secret.b}}")] });
    expect(receiverLines(two, [secret("a", "a"), secret("b", "b")]).map(receiverLineText)).toEqual([
      "Uses your secrets: a, b.",
    ]);
    expect(receiverLines(two, [secret("1", "a"), secret("2", "b")]).map(receiverLineText)).toEqual([
      "Needs 2 of the sender's secrets: a, b. Your vault has secrets of those names, but this collection refers to the sender's. Requests that use them are not sent until you give the variables values.",
    ]);
  });

  it("does not say which the person has when the vault could not be read", () => {
    expect(
      receiverLines(collection({ variables: [row("token", "{{$secret.a}}")] }), null).map(receiverLineText),
    ).toEqual([
      "Needs 1 secret: token. If your vault does not have it, a request that uses it is not sent until you give the variable a value.",
    ]);
    expect(
      receiverLines(collection({ variables: [row("a", "{{$secret.a}}"), row("b", "{{$secret.b}}")] }), null).map(
        receiverLineText,
      ),
    ).toEqual([
      "Needs 2 secrets: a, b. If your vault does not have them, requests that use them are not sent until you give the variables values.",
    ]);
    expect(receiverLines(collection({}), null)).toEqual([]);
  });

  it("keeps a name with odd characters as it is written, and matches it exactly", () => {
    const name = 'api key "prod" <x> {ü}';
    const lines = receiverLines(
      collection({ variables: [row(name, "{{$secret.a}}"), row("__proto__", "{{$secret.b}}")] }),
      [secret("c", "constructor"), secret("d", "__proto__")],
    );
    expect(lines.map((line) => [line.kind, line.names])).toEqual([
      ["secrets-missing", [name]],
      ["secrets-same-name", ["__proto__"]],
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
