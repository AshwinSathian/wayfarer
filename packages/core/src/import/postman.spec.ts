import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addressParts, postmanCollection as exported } from "../export/postman";
import { ImportError, importText } from "./import";
import { isPostmanCollection, isPostmanEnvironment, isPostmanV1, postmanCollection, postmanEnvironment } from "./postman";

const SCHEMA = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";
const collection = (item: unknown[], rest: Record<string, unknown> = {}) => ({ info: { name: "Shop", schema: SCHEMA }, item, ...rest });
const request = (rest: Record<string, unknown> = {}, name = "R") => ({ name, request: { method: "GET", url: "https://api.test/a", ...rest } });
const one = (rest: Record<string, unknown>) => postmanCollection(collection([request(rest)]));

describe("postmanCollection: a Postman file as a collection of the app", () => {
  it("names, descriptions, variables and the tree: folders in folders, a folder's items numbered as the file has them", () => {
    const { payload, warnings } = postmanCollection(
      collection(
        [
          { name: "Admin", description: { content: "For admins", type: "text/plain" }, variable: [{ key: "region", value: "eu" }], item: [{ name: "Deep", item: [request({}, "Inner")] }, request({ description: "Lists them" }, "List")] },
          request({}, "Top"),
        ],
        { info: { name: "Shop", description: "A shop", schema: SCHEMA }, variable: [{ key: "base", value: "https://api.test" }, { id: "old", value: 7, disabled: true }] }
      )
    );

    expect(warnings).toEqual([]);
    expect(payload.$id).toBe("wayfarer/collection/3");
    expect(payload.collection).toMatchObject({ name: "Shop", description: "A shop", auth: { type: "none" }, scripts: { pre: "", post: "" } });
    expect(payload.collection.variables).toEqual([{ key: "base", value: "https://api.test", enabled: true }, { key: "old", value: "7", enabled: false }]);
    const [admin, deep] = payload.folders;
    expect(admin).toMatchObject({ name: "Admin", description: "For admins", order: 0, variables: [{ key: "region", value: "eu", enabled: true }], auth: { type: "inherit" } });
    expect(deep).toMatchObject({ name: "Deep", parentFolderId: admin.id, order: 0 });
    expect(payload.requests.map((doc) => [doc.name, doc.order, doc.folderId, doc.description])).toEqual([["Inner", 0, deep.id, undefined], ["List", 1, admin.id, "Lists them"], ["Top", 1, undefined, undefined]]);
    // Ids are the app's own, each once.
    const ids = [payload.collection.id, ...payload.folders.map((folder) => folder.id), ...payload.requests.map((doc) => doc.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(payload.requests.every((doc) => doc.collectionId === payload.collection.id && doc.tests.length === 0)).toBe(true);
  });

  it("auth: v2.1's lists and v2.0's objects; none at all inherits, and a collection has nothing to inherit", () => {
    const { payload } = postmanCollection(
      collection(
        [
          request({ auth: { type: "bearer", bearer: [{ key: "token", value: "t-1", type: "string" }] } }, "bearer 2.1"),
          request({ auth: { type: "basic", basic: { username: "u", password: "p" } } }, "basic 2.0"),
          request({ auth: { type: "apikey", apikey: [{ key: "key", value: "X-Key" }, { key: "value", value: "k" }, { key: "in", value: "query" }] } }, "key in query"),
          request({ auth: { type: "apikey", apikey: [{ key: "key", value: "X-Key" }, { key: "value", value: "k" }] } }, "key in header"),
          request({ auth: { type: "noauth" } }, "none"),
          request({}, "inherits"),
          request({ auth: null }, "null inherits"),
        ],
        { auth: { type: "basic", basic: [{ key: "password", value: "p" }, { key: "username", value: "u" }] } }
      )
    );

    expect(payload.collection.auth).toEqual({ type: "basic", username: "u", password: "p" });
    expect(payload.requests.map((doc) => doc.auth)).toEqual([
      { type: "bearer", token: "t-1" },
      { type: "basic", username: "u", password: "p" },
      { type: "apikey", key: "X-Key", value: "k", in: "query" },
      { type: "apikey", key: "X-Key", value: "k", in: "header" },
      { type: "none" },
      { type: "inherit" },
      { type: "inherit" },
    ]);
    expect(postmanCollection(collection([])).payload.collection.auth).toEqual({ type: "none" });
  });

  it("an auth type the app does not have is left out with a warning, and sends none: it does not start inheriting", () => {
    const { payload, warnings } = postmanCollection(collection([{ name: "F", auth: { type: "digest" }, item: [] }, request({ auth: { type: "ntlm", ntlm: [{ key: "accessToken", value: "x" }] } }, "Signed")], { auth: { type: "hawk" } }));

    expect(payload.requests[0].auth).toEqual({ type: "none" });
    expect(payload.folders[0].auth).toEqual({ type: "none" });
    expect(payload.collection.auth).toEqual({ type: "none" });
    expect(warnings).toEqual([
      { item: 'folder "F"', message: "Its auth is of a type the app does not have (digest) and is left out: it is sent with no auth." },
      { item: 'request "Signed"', message: "Its auth is of a type the app does not have (ntlm) and is left out: it is sent with no auth." },
      { item: 'collection "Shop"', message: "Its auth is of a type the app does not have (hawk) and is left out: it is sent with no auth." },
    ]);
    expect(JSON.stringify(payload)).not.toContain("accessToken");
  });

  it("OAuth 2.0 is imported by its grant, and exported again as Postman writes it; a token in the file is not kept (P4.7)", () => {
    const fields = (grant: string, more: Record<string, string> = {}) => Object.entries({ grant_type: grant, authUrl: "https://idp.test/authorize", accessTokenUrl: "https://idp.test/token", clientId: "client", clientSecret: "{{secret}}", scope: "read write", ...more }).map(([key, value]) => ({ key, value }));
    const { payload, warnings } = postmanCollection(
      collection([
        request({ auth: { type: "oauth2", oauth2: fields("authorization_code_with_pkce", { accessToken: "token-in-the-file", addTokenTo: "queryParams", redirect_uri: "https://oauth.pstmn.io/v1/callback" }) } }, "Code"),
        request({ auth: { type: "oauth2", oauth2: fields("authorization_code") } }, "Code, no PKCE said"),
        request({ auth: { type: "oauth2", oauth2: fields("client_credentials", { client_authentication: "body" }) } }, "Client"),
        request({ auth: { type: "oauth2", oauth2: fields("password_credentials", { username: "alice", password: "{{pw}}" }) } }, "Password"),
        // v2.0 holds the fields as an object, and Postman asks for a code when no grant is said.
        request({ auth: { type: "oauth2", oauth2: { accessToken: "only-a-token" } } }, "Token only"),
        request({ auth: { type: "oauth2", oauth2: fields("implicit") } }, "Implicit"),
      ]),
    );
    const base = { type: "oauth2", authUrl: "https://idp.test/authorize", tokenUrl: "https://idp.test/token", clientId: "client", clientSecret: "{{secret}}", scope: "read write", username: "", password: "", clientAuth: "header", retryOn401: false };
    expect(payload.requests.map((doc) => doc.auth)).toEqual([
      { ...base, grant: "authorization_code" },
      { ...base, grant: "authorization_code" },
      { ...base, grant: "client_credentials", clientAuth: "body" },
      { ...base, grant: "password", username: "alice", password: "{{pw}}" },
      { ...base, grant: "authorization_code", authUrl: "", tokenUrl: "", clientId: "", clientSecret: "", scope: "" },
      { type: "none" },
    ]);
    expect(warnings).toEqual([
      { item: 'request "Code"', message: "The OAuth 2.0 token in the file is not kept: get one in the Auth tab." },
      { item: 'request "Code"', message: "Its OAuth 2.0 token was added to the address: the app sends it in the Authorization header." },
      { item: 'request "Token only"', message: "The OAuth 2.0 token in the file is not kept: get one in the Auth tab." },
      { item: 'request "Implicit"', message: "Its auth is OAuth 2.0 with a grant the app does not have (implicit) and is left out: it is sent with no auth." },
    ]);
    expect(JSON.stringify(payload)).not.toContain("token-in-the-file");
    expect(JSON.stringify(payload)).not.toContain("only-a-token");

    const again = exported(payload).file as { item: { request: { auth: { oauth2: { key: string; value: string }[] } } }[] };
    expect(Object.fromEntries(again.item[3].request.auth.oauth2.map((entry) => [entry.key, entry.value]))).toEqual({
      grant_type: "password_credentials",
      authUrl: "https://idp.test/authorize",
      accessTokenUrl: "https://idp.test/token",
      clientId: "client",
      clientSecret: "{{secret}}",
      scope: "read write",
      username: "alice",
      password: "{{pw}}",
      client_authentication: "header",
      addTokenTo: "header",
    });
    expect(again.item[0].request.auth.oauth2[0]).toEqual({ key: "grant_type", value: "authorization_code_with_pkce", type: "string" });
    expect(postmanCollection(again).payload.requests.map((doc) => doc.auth)).toEqual(payload.requests.map((doc) => doc.auth));
  });

  it("AWS Signature is imported with its five fields, and exported again as Postman writes it (P4.8)", () => {
    const awsv4 = [{ key: "accessKey", value: "AKID" }, { key: "secretKey", value: "{{secret}}" }, { key: "sessionToken", value: "t" }, { key: "region", value: "eu-west-1" }, { key: "service", value: "s3" }, { key: "addAuthDataToQuery", value: false }];
    const { payload, warnings } = postmanCollection(collection([request({ auth: { type: "awsv4", awsv4 } }, "Signed"), request({ auth: { type: "awsv4", awsv4: { accessKey: "AKID" } } }, "Sparse")]));
    expect(payload.requests.map((doc) => doc.auth)).toEqual([
      { type: "awsv4", accessKey: "AKID", secretKey: "{{secret}}", sessionToken: "t", region: "eu-west-1", service: "s3" },
      { type: "awsv4", accessKey: "AKID", secretKey: "", sessionToken: "", region: "", service: "" },
    ]);
    expect(warnings).toEqual([]);
    const again = exported(payload).file as { item: { request: { auth: unknown } }[] };
    expect(again.item[0].request.auth).toEqual({ type: "awsv4", awsv4: awsv4.slice(0, 5).map((entry) => ({ ...entry, type: "string" })) });
    expect(postmanCollection(again).payload.requests.map((doc) => doc.auth)).toEqual(payload.requests.map((doc) => doc.auth));
  });

  it("scripts at three levels: prerequest and test, as lines or as one text; a switched-off event and another kind are not run", () => {
    const event = (listen: string, exec: unknown, rest: Record<string, unknown> = {}) => ({ listen, script: { type: "text/javascript", exec }, ...rest });
    const { payload, warnings } = postmanCollection(
      collection([{ name: "F", event: [event("test", "one text")], item: [{ ...request(), event: [event("prerequest", ["a", "b"]), event("prerequest", ["c"]), event("test", ["off"], { disabled: true }), event("beforeInvoke", ["x"])] }] }], {
        event: [event("prerequest", ["const a = 1;", "", "use(a);"])],
      })
    );

    expect(payload.collection.scripts).toEqual({ pre: "const a = 1;\n\nuse(a);", post: "" });
    expect(payload.folders[0].scripts).toEqual({ pre: "", post: "one text" });
    expect(payload.requests[0].scripts).toEqual({ pre: "a\nb\nc", post: "" });
    expect(warnings).toEqual([{ item: 'request "R"', message: 'A script for "beforeInvoke" is left out: the app runs a script before a request and after its response.' }]);
    // An import approves nothing: the file has no trust in it.
    expect(Object.hasOwn(payload.collection, "scriptTrust")).toBe(false);
  });

  it("headers: rows, one switched off; v2.0's one text of lines", () => {
    expect(one({ header: [{ key: "Accept", value: "*/*" }, { key: "X-Off", value: "1", disabled: true }] }).payload.requests[0].headers).toEqual([{ key: "Accept", value: "*/*", enabled: true }, { key: "X-Off", value: "1", enabled: false }]);
    expect(one({ header: "Accept: */*\n//X-Off: 1\nX-Time: 12:30\n\nBare" }).payload.requests[0].headers).toEqual([
      { key: "Accept", value: "*/*", enabled: true },
      { key: "X-Off", value: "1", enabled: false },
      { key: "X-Time", value: "12:30", enabled: true },
      { key: "Bare", value: "", enabled: true },
    ]);
  });

  it("every body mode, with the parts the file keeps beside the one that is sent", () => {
    const body = (value: unknown) => one({ method: "POST", body: value });
    expect(body({ mode: "raw", raw: '{"a":1}', options: { raw: { language: "json" } } }).payload.requests[0].body).toEqual({ mode: "raw", raw: { language: "json", text: '{"a":1}' } });
    expect(body({ mode: "raw", raw: "plain" }).payload.requests[0].body).toEqual({ mode: "raw", raw: { language: "text", text: "plain" } });
    expect(body({ mode: "raw", raw: "x", options: { raw: { language: "cobol" } } }).payload.requests[0].body.raw?.language).toBe("text");
    expect(body({ mode: "urlencoded", urlencoded: [{ key: "q", value: "a b" }, { key: "off", value: "1", disabled: true }], raw: "kept" }).payload.requests[0].body).toEqual({
      mode: "urlencoded",
      raw: { language: "text", text: "kept" },
      urlencoded: [{ key: "q", value: "a b", enabled: true }, { key: "off", value: "1", enabled: false }],
    });
    const form = body({ mode: "formdata", formdata: [{ key: "note", value: "n", type: "text" }, { key: "plain", value: "p" }, { key: "up", type: "file", src: "report.pdf" }, { key: "many", type: "file", src: ["a.png", "b.png"], disabled: true }, { key: "none", type: "file", src: null }] });
    expect(form.payload.requests[0].body).toEqual({
      mode: "multipart",
      multipart: [
        { key: "note", enabled: true, kind: "text", value: "n" },
        { key: "plain", enabled: true, kind: "text", value: "p" },
        { key: "up", enabled: true, kind: "file", fileId: "", fileName: "report.pdf" },
        { key: "many", enabled: false, kind: "file", fileId: "", fileName: "a.png" },
        { key: "none", enabled: true, kind: "file", fileId: "", fileName: "" },
      ],
    });
    expect(form.warnings).toEqual([{ item: 'request "R"', message: "A file of its body is named, not included: choose it again in the Body tab." }]);
    expect(body({ mode: "file", file: { src: "pixel.png" } }).payload.requests[0].body).toEqual({ mode: "binary", binary: { fileId: "", fileName: "pixel.png" } });
    expect(body({ mode: "file" }).payload.requests[0].body).toEqual({ mode: "binary" });
    expect(body({ raw: "kept", urlencoded: [] }).payload.requests[0].body).toEqual({ mode: "none", raw: { language: "text", text: "kept" }, urlencoded: [] });
    expect(body({ mode: "raw", raw: "x", disabled: true }).payload.requests[0].body).toEqual({ mode: "none", raw: { language: "text", text: "x" } });
    expect(body(undefined).payload.requests[0].body).toEqual({ mode: "none" });
    for (const mode of ["raw", "urlencoded", "formdata"]) expect(importText(JSON.stringify(collection([request({ method: "POST", body: { mode } })]))).collections).toHaveLength(1);
  });

  it("a GraphQL body is a GraphQL body, its query and its variables as written (P5.5), and a kind the app does not have is left out and said", () => {
    const graphql = one({ method: "POST", body: { mode: "graphql", graphql: { query: "query { me { id } }", variables: '{ "n": 1 }' } } });
    expect(graphql.payload.requests[0].body).toEqual({ mode: "graphql", graphql: { query: "query { me { id } }", variables: '{ "n": 1 }' } });
    expect(graphql.warnings).toEqual([]);
    expect(one({ method: "POST", body: { mode: "graphql", graphql: { query: "{ a }" } } }).payload.requests[0].body.graphql).toEqual({ query: "{ a }", variables: "" });
    expect(one({ method: "POST", body: { mode: "graphql" } }).payload.requests[0].body).toEqual({ mode: "graphql", graphql: { query: "", variables: "" } });
    const odd = one({ method: "POST", body: { mode: "protobuf" } });
    expect(odd.payload.requests[0].body).toEqual({ mode: "none" });
    expect(odd.warnings).toEqual([{ item: 'request "R"', message: "Its body is of a kind the app does not have (protobuf) and is left out." }]);
  });

  it("the address: as one text, or put together from the parts Postman sends by", () => {
    const address = (url: unknown) => {
      const [doc] = one({ url }).payload.requests;
      return [doc.url, doc.params];
    };
    expect(address("https://api.test/items?a=1&flag")).toEqual(["https://api.test/items?a=1&flag", [{ key: "a", value: "1", enabled: true }, { key: "flag", value: "", enabled: true }]]);
    expect(address({ raw: "ignored", protocol: "https", auth: { user: "u", password: "p" }, host: ["api", "test"], port: "8443", path: ["v1", "items", ""], query: [{ key: "q", value: "1" }, { key: "off", value: "0", disabled: true }, { key: "flag", value: null }], hash: "top" })).toEqual([
      "https://u:p@api.test:8443/v1/items/?q=1&flag#top",
      [{ key: "q", value: "1", enabled: true }, { key: "off", value: "0", enabled: false }, { key: "flag", value: "", enabled: true }],
    ]);
    expect(address({ host: "{{base}}", path: "/a/b" })[0]).toBe("{{base}}/a/b");
    expect(address({ raw: "{{base}}/only-raw?x=1" })).toEqual(["{{base}}/only-raw?x=1", [{ key: "x", value: "1", enabled: true }]]);
    expect(address({ host: ["h"], auth: { user: "only" }, query: [] })[0]).toBe("only@h");
  });

  it("a part of the file that holds what an address is cut at is written so that it stays one part; a variable is left as typed", () => {
    const [doc] = one({ url: { host: ["h"], path: ["a?b", "c#d", "{{p/q}}"], query: [{ key: "k#1&2=3", value: "v&w#x={{a&b}}" }, { key: "{{?}}", value: "{{&}}" }] } }).payload.requests;

    expect(doc.url).toBe("h/a%3Fb/c%23d/{{p/q}}?k%231%262%3D3=v%26w%23x={{a&b}}&{{?}}={{&}}");
    expect(addressParts(doc.url).query).toEqual([{ key: "k%231%262%3D3", value: "v%26w%23x={{a&b}}" }, { key: "{{?}}", value: "{{&}}" }]);
    expect(doc.params).toEqual([{ key: "k%231%262%3D3", value: "v%26w%23x={{a&b}}", enabled: true }, { key: "{{?}}", value: "{{&}}", enabled: true }]);
  });

  it("a path variable is its value, or a variable of its name when the file gives none: each said once for the request", () => {
    const { payload, warnings } = one({ url: { host: ["h"], path: ["users", ":id", "posts", ":post", ":", ":unlisted"], variable: [{ key: "id", value: "42" }, { key: "post", value: "" }] } });

    // A part that only starts with a colon, and is not a variable the file lists, is text.
    expect(payload.requests[0].url).toBe("h/users/42/posts/{{post}}/:/:unlisted");
    expect(warnings).toEqual([
      { item: 'request "R"', message: "The path variable :id is replaced by its value in the address: the app has no path variables." },
      { item: 'request "R"', message: "The path variable :post has no value in the file: in the address it is {{post}}, to be given a value as a variable." },
    ]);
    expect(one({ url: { host: ["h"], path: [":a", ":b"], variable: [{ key: "a" }, { key: "b", value: null }] } }).warnings[0].message).toBe("The path variables :a, :b have no value in the file: in the address they are {{a}}, {{b}}, to be given a value as variables.");
    expect(one({ url: { host: ["h"], path: [":a", ":b"], variable: [{ key: "a", value: "1" }, { key: "b", value: "2" }] } }).warnings[0].message).toBe("The path variables :a, :b are replaced by their values in the address: the app has no path variables.");
  });

  it("a query parameter that is switched off is kept, and the report says the composer does not show it", () => {
    expect(one({ url: { host: ["h"], query: [{ key: "off", value: "1", disabled: true }] } }).warnings[0].message).toBe(
      "A query parameter that is switched off (off) is kept for an export, but the composer has no switch for a parameter: it does not show one, and saving the request there drops it."
    );
    expect(one({ url: { host: ["h"], query: [{ key: "a", disabled: true }, { key: "b", disabled: true }] } }).warnings[0].message).toContain("2 query parameters that are switched off are kept");
  });

  it("a request the app cannot hold is left out and said; a bare address is a GET; a method is upper case", () => {
    const { payload, warnings } = postmanCollection(collection([{ name: "Draft", request: { method: "POST", url: "" } }, { name: "Odd", request: { method: "GE T", url: "h" } }, { name: "Bare", request: "https://api.test/bare" }, request({ method: "patch" }, "Lower"), { request: { url: "h/unnamed" } }]));

    expect(payload.requests.map((doc) => [doc.name, doc.method, doc.url, doc.order])).toEqual([["Bare", "GET", "https://api.test/bare", 0], ["Lower", "PATCH", "https://api.test/a", 1], ["GET h/unnamed", "GET", "h/unnamed", 2]]);
    expect(warnings).toEqual([{ item: 'request "Draft"', message: "It has no address and is left out." }, { item: 'request "Odd"', message: "Its method (GE T) is not an HTTP method and it is left out." }]);
  });

  it("saved responses are left out and counted; a folder after a request stays after it, and nothing is said", () => {
    const { payload, warnings } = postmanCollection(collection([{ ...request(), response: [{ name: "ok" }, { name: "bad" }] }, { name: "After", item: [request({}, "Inside"), { name: "Deep", item: [] }, request({}, "Last inside")] }, request({}, "Last")]));

    expect(warnings).toEqual([{ item: 'collection "Shop"', message: "2 saved responses are left out: the app keeps responses in its history, not in a collection." }]);
    expect([...payload.folders, ...payload.requests].map((entry) => [entry.name, entry.order])).toEqual([["After", 1], ["Deep", 1], ["R", 0], ["Inside", 0], ["Last inside", 2], ["Last", 2]]);
    // And an export writes the items as the file had them.
    const names = (items: { name: string; item?: unknown }[]): unknown[] => items.map((item) => (item.item ? [item.name, names(item.item as { name: string }[])] : item.name));
    expect(names(exported(payload).file["item"] as { name: string }[])).toEqual(["R", ["After", ["Inside", ["Deep", []], "Last inside"]], "Last"]);
    expect(postmanCollection(collection([{ ...request(), response: [{}] }])).warnings[0].message).toContain("1 saved response is left out");
  });

  it("a file is untrusted: keys named like Object's own are data, values of any kind become text, and nesting has an end", () => {
    const hostile = { item: [{ name: 7, constructor: "x", request: { method: "GET", url: { host: ["h"], query: [{ key: "__proto__", value: { a: 1 } }] }, header: [{ key: "constructor", value: true }, "not a row", null], auth: { type: "constructor" }, body: { mode: "raw", raw: 5 } } }], info: null, variable: "no", event: [null, 3] };
    const { payload } = postmanCollection(hostile);

    expect(payload.collection.name).toBe("Imported from Postman");
    expect(payload.requests[0]).toMatchObject({ name: "7", url: 'h?__proto__={"a":1}', headers: [{ key: "constructor", value: "true", enabled: true }], auth: { type: "none" }, body: { mode: "raw", raw: { language: "text", text: "" } } });
    expect(importText(JSON.stringify(hostile)).report.counts).toEqual({ collections: 1, folders: 0, requests: 1, environments: 0 });

    let deep: unknown = request();
    for (let level = 0; level < 70; level += 1) deep = { name: `L${level}`, item: [deep] };
    expect(() => postmanCollection(collection([deep]))).toThrow(new ImportError("The collection's folders are nested more than 64 deep."));
    expect(() => postmanCollection("text")).toThrow(ImportError);
  });

  it("whatever JSON it is given, it returns or throws ImportError, and what it returns the app can hold (property)", () => {
    const anything = fc.jsonValue({ maxDepth: 4 });
    const itemish = fc.letrec((tie) => ({
      item: fc.record({ name: anything, item: fc.option(fc.array(tie("item"), { maxLength: 3 }), { nil: undefined }), request: anything, event: anything, auth: anything, variable: anything }, { requiredKeys: [] }),
    })).item;
    fc.assert(
      fc.property(fc.record({ info: anything, item: fc.array(fc.oneof(itemish, anything), { maxLength: 4 }), auth: anything, event: anything, variable: anything }, { requiredKeys: ["item"] }), (file) => {
        try {
          const imported = importText(JSON.stringify(file));
          expect(imported.report.format).toBe("postman-collection");
        } catch (error) {
          expect(error).toBeInstanceOf(ImportError);
        }
      }),
      { numRuns: 300 }
    );
  });

  it("an address cut into Postman's parts and put together again by the importer is the address (property)", () => {
    const piece = fc.oneof(fc.constantFrom("http", "https", "://", "/", "?", "#", "&", "=", ":", "@", ".", "{{base}}", "{{a/b}}", "{{?}}", "8080", "api", "[::1]", "%20", " "), fc.string({ maxLength: 3 }));
    fc.assert(
      fc.property(fc.array(piece, { maxLength: 12 }).map((pieces) => pieces.join("")), (raw) => {
        fc.pre(raw.trim() !== "" && !raw.includes(""));
        const source = { $id: "wayfarer/collection/3" as const, meta: { id: "c", createdAt: 0, updatedAt: 0, version: 1 as const }, collection: { id: "c", meta: { id: "c", createdAt: 0, updatedAt: 0, version: 1 as const }, name: "C", order: 0, variables: [], auth: { type: "none" as const }, scripts: { pre: "", post: "" } }, folders: [], requests: [] };
        const doc = { id: "r", meta: source.meta, collectionId: "c", name: "R", order: 0, method: "GET", url: raw, params: [], headers: [], body: { mode: "none" as const }, auth: { type: "inherit" as const }, scripts: { pre: "", post: "" }, tests: [], settings: {} };
        const back = postmanCollection(exported({ ...source, requests: [doc] }).file).payload.requests[0];
        expect(back.url).toBe(raw);
      }),
      { numRuns: 1000 }
    );
  });
});

describe("postmanEnvironment and what a file is taken for", () => {
  it("an environment: its values, one switched off either way Postman has written it", () => {
    const { environment, warnings } = postmanEnvironment({ name: "Staging", values: [{ key: "a", value: "1", enabled: true }, { key: "b", value: 2, enabled: false }, { key: "c", value: null, disabled: true }, { key: "d" }], _postman_variable_scope: "environment" });

    expect(warnings).toEqual([]);
    expect(environment).toMatchObject({ name: "Staging", order: 0, vars: [{ key: "a", value: "1", enabled: true }, { key: "b", value: "2", enabled: false }, { key: "c", value: "", enabled: false }, { key: "d", value: "", enabled: true }] });
    expect(environment.id).toBe(environment.meta.id);
  });

  it("Postman's globals, in either of its forms, become an environment, and the report says so", () => {
    for (const file of [[{ key: "g", value: "1", enabled: true }], { values: [{ key: "g", value: "1" }], _postman_variable_scope: "globals" }]) {
      const imported = importText(JSON.stringify(file));
      expect(imported.report).toMatchObject({ format: "postman-environment", formatName: "Postman environment", counts: { environments: 1 } });
      expect(imported.environments[0]).toMatchObject({ name: "Postman globals", vars: [{ key: "g", value: "1", enabled: true }] });
      expect(imported.report.warnings).toEqual([{ item: 'environment "Postman globals"', message: "Postman's globals are imported as an environment: choose it as the active environment, or copy what you need into the app's globals." }]);
    }
  });

  it("which file is which: by what it holds", () => {
    expect(isPostmanCollection({ item: [] })).toBe(true);
    expect(isPostmanCollection({ info: { schema: SCHEMA } })).toBe(false);
    expect(isPostmanCollection([])).toBe(false);
    expect(isPostmanV1({ requests: [], order: [] })).toBe(true);
    expect(isPostmanEnvironment({ values: [] })).toBe(true);
    expect(isPostmanEnvironment({ values: [{ key: "a" }] })).toBe(true);
    expect(isPostmanEnvironment({ values: [{ name: "a" }] })).toBe(false);
    // A bare list is globals only when it has entries with keys: a data file of a run is a list too.
    expect(isPostmanEnvironment([])).toBe(false);
    expect(isPostmanEnvironment([{ key: "g" }])).toBe(true);
    expect(isPostmanEnvironment([{ user: "a" }])).toBe(false);
    expect(() => importText(JSON.stringify([{ user: "a" }]))).toThrow(/This is not a file Wayfarer can import/);
    expect(() => importText(JSON.stringify({ requests: [], order: [], folders: [] }))).toThrow("This is a Postman Collection v1 file, which Wayfarer does not read. In Postman, export the collection as Collection v2.1 and import that.");
  });

  it("a file that starts with a byte order mark is read as the file it is", () => {
    expect(importText(`${String.fromCharCode(0xfeff)}${JSON.stringify(collection([request()]))}`).report.counts.requests).toBe(1);
  });
});
