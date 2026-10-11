import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";
import { ImportError, detectFormat, importText } from "./import";
import { MAX_YAML_CHARS, YAML_TOO_LARGE } from "./yaml";

type Loose = Record<string, unknown>;

/** An OpenAPI 3.0 description around `paths`. */
const v3 = (paths: Loose, more: Loose = {}) => ({ openapi: "3.0.3", info: { title: "Shop", description: "The shop's API", version: "1" }, servers: [{ url: "https://api.test/v1" }], paths, ...more });
/** A Swagger 2.0 description around `paths`. */
const v2 = (paths: Loose, more: Loose = {}) => ({ swagger: "2.0", info: { title: "Shop", version: "1" }, host: "api.test", basePath: "/v1", schemes: ["https"], paths, ...more });
const ok = { responses: { 200: { description: "OK" } } };
const read = (file: unknown) => importText(JSON.stringify(file));
const only = (file: unknown) => {
  const imported = read(file);
  return { ...imported.collections[0].payload, warnings: imported.report.warnings };
};
/** The one request of a file with one operation. */
const one = (file: unknown) => {
  const { requests, warnings } = only(file);
  expect(requests).toHaveLength(1);
  return { ...requests[0], warnings: warnings.map((warning) => warning.message) };
};
const json = (text: string | undefined): unknown => JSON.parse(text ?? "null");

describe("an OpenAPI description (P4.3)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is known by the version it names, as text or as the number YAML reads, and before a Postman file is asked for", () => {
    expect(detectFormat(v3({}))).toBe("openapi");
    expect(detectFormat(v2({}))).toBe("openapi");
    expect(detectFormat({ swagger: 2, paths: {} })).toBe("openapi");
    expect(detectFormat({ ...v3({}), item: [] })).toBe("openapi");
    // An Insomnia file that holds a specification is Insomnia's, and a file that only mentions the word is not one.
    expect(detectFormat({ type: "collection.insomnia.rest/5.0", openapi: "3.0.0", collection: [] })).toBe("insomnia");
    expect(detectFormat({ openapi: { version: 3 } })).toBeNull();
    expect(read(v3({ "/pets": { get: ok } })).report).toMatchObject({ format: "openapi", formatName: "OpenAPI description", counts: { collections: 1, folders: 0, requests: 1, environments: 0 } });
    // YAML, as most are written. An unquoted `swagger: 2.0` is a number there.
    expect(importText(stringify(v3({ "/pets": { get: ok } }))).report.counts.requests).toBe(1);
    expect(importText('swagger: 2.0\nhost: api.test\npaths:\n  /pets:\n    get:\n      responses: {}\n').collections[0].payload.requests[0].url).toBe("{{baseUrl}}/pets");
  });

  it("a version the app does not read is refused and named; one above 3.1 is read as 3.1, and said", () => {
    expect(() => read({ swagger: "1.2", apis: [] })).toThrow("This is a Swagger description of version 1.2, which Wayfarer does not read. It reads OpenAPI 3.0 and 3.1 and Swagger 2.0.");
    expect(() => read({ openapi: "4.0.0", paths: {} })).toThrow("This is an OpenAPI description of version 4.0.0, which Wayfarer does not read.");
    expect(only({ ...v3({ "/pets": { get: ok } }), openapi: "3.2.0" }).warnings).toEqual([{ item: 'collection "Shop"', message: "The file is written for OpenAPI 3.2.0: it is read as OpenAPI 3.1, and what is newer is left out." }]);
    expect(only({ ...v3({ "/pets": { get: ok } }), openapi: "3.1.1" }).warnings).toEqual([]);
  });

  it("a file with no operation is refused: paths that are empty, absent, or hold no method", () => {
    const message = "This OpenAPI file describes no operation under `paths`, so there is no request to import.";
    expect(() => read(v3({}))).toThrow(message);
    expect(() => read({ openapi: "3.1.0", info: { title: "Hooks" }, webhooks: { newPet: { post: ok } } })).toThrow(message);
    expect(() => read(v3({ "/pets": { summary: "No method", parameters: [] }, "/x": "text" }))).toThrow(message);
  });

  it("each method of each path is a request, named by its summary, its operationId, or its method and path", () => {
    const { collection, requests, folders } = only(
      v3({
        "/pets": { get: { summary: " List pets ", description: "All of them", ...ok }, post: { operationId: "createPet", ...ok }, parameters: [], summary: "not a method" },
        "/pets/{id}": { delete: ok, head: ok, options: ok, patch: ok, put: ok, trace: ok, connect: ok, "x-internal": ok },
      }),
    );
    expect(collection).toMatchObject({ name: "Shop", description: "The shop's API", scripts: { pre: "", post: "" } });
    expect(folders).toEqual([]);
    expect(requests.map((request) => `${request.method} ${request.url} ${request.name}`)).toEqual([
      "GET {{baseUrl}}/pets List pets",
      "POST {{baseUrl}}/pets createPet",
      "PUT {{baseUrl}}/pets/{{id}} PUT /pets/{id}",
      "DELETE {{baseUrl}}/pets/{{id}} DELETE /pets/{id}",
      "OPTIONS {{baseUrl}}/pets/{{id}} OPTIONS /pets/{id}",
      "HEAD {{baseUrl}}/pets/{{id}} HEAD /pets/{id}",
      "PATCH {{baseUrl}}/pets/{{id}} PATCH /pets/{id}",
      "TRACE {{baseUrl}}/pets/{{id}} TRACE /pets/{id}",
    ]);
    expect(requests[0].description).toBe("All of them");
    expect(only({ openapi: "3.0.0", paths: { "/": { get: ok } } }).collection.name).toBe("Imported from OpenAPI");
  });

  it("a tag is a folder: the file's own list first and in its order, an operation in the folder of its first tag, one with no tag beside the folders", () => {
    const { folders, requests, warnings } = only(
      v3(
        {
          "/a": { get: { summary: "A", tags: ["late"], ...ok } },
          "/b": { get: { summary: "B", tags: ["store", "pet"], ...ok } },
          "/c": { get: { summary: "C", ...ok } },
          "/d": { get: { summary: "D", tags: ["pet"], ...ok } },
          "/e": { get: { summary: "E", tags: [], ...ok } },
        },
        { tags: [{ name: "pet", description: "Pets" }, { name: "unused" }, { name: "store" }] },
      ),
    );
    expect(folders.map((folder) => [folder.name, folder.description, folder.order])).toEqual([
      ["pet", "Pets", 0],
      ["store", undefined, 1],
      ["late", undefined, 2],
    ]);
    const place = (name: string) => folders.find((folder) => folder.id === requests.find((request) => request.name === name)?.folderId)?.name;
    expect(["A", "B", "C", "D", "E"].map(place)).toEqual(["late", "store", undefined, "pet", undefined]);
    expect(warnings).toEqual([{ item: 'request "B"', message: "It has 2 tags (store, pet): it is in the folder of the first." }]);
  });

  it("the first server is the collection's variable baseUrl, its variables given their defaults; another server of a path or an operation is that request's address", () => {
    const servers = [{ url: "https://{tenant}.api.test:{port}/{version}/", variables: { tenant: { default: "acme" }, port: { default: 8443 } } }, { url: "https://staging.test" }];
    const { collection, requests, warnings } = only(
      v3({ "/pets": { get: ok }, "/files": { servers: [{ url: "https://files.test/" }], get: ok, post: { servers: [{ url: "https://upload.test/v2" }], ...ok } } }, { servers }),
    );
    // A server variable with no default is a variable of the app, which the composer asks for.
    expect(collection.variables).toEqual([{ key: "baseUrl", value: "https://acme.api.test:8443/{{version}}", enabled: true }]);
    expect(requests.map((request) => request.url)).toEqual(["{{baseUrl}}/pets", "https://files.test/files", "https://upload.test/v2/files"]);
    expect(warnings).toEqual([{ item: 'collection "Shop"', message: "The file names 2 servers: the collection's variable baseUrl holds the first (https://acme.api.test:8443/{{version}})." }]);
  });

  it("a server that is not a full address, or none, is said: the variable is there to be given one", () => {
    const said = (base: string) => `The file gives no full address for its server (${base}): give the collection's variable baseUrl the server's address before you send.`;
    for (const [file, value, base] of [
      [v3({ "/pets": { get: ok } }, { servers: [{ url: "/api/v3" }] }), "/api/v3", "/api/v3"],
      [v3({ "/pets": { get: ok } }, { servers: undefined }), "", "it names none"],
      [v3({ "/pets": { get: ok } }, { servers: [{ url: "/" }] }), "", "it names none"],
      [v2({ "/pets": { get: ok } }, { host: undefined }), "/v1", "/v1"],
      [v2({ "/pets": { get: ok } }, { host: undefined, basePath: undefined }), "", "it names none"],
    ] as const) {
      const { collection, requests, warnings } = only(file);
      expect(collection.variables).toEqual([{ key: "baseUrl", value, enabled: true }]);
      expect(requests[0].url).toBe("{{baseUrl}}/pets");
      expect(warnings).toEqual([{ item: 'collection "Shop"', message: said(base) }]);
    }
    // Swagger 2.0: the first scheme, the host and the base path; `https` when it names no scheme.
    expect(only(v2({ "/pets": { get: ok } }, { schemes: ["http", "https"] })).collection.variables[0].value).toBe("http://api.test/v1");
    expect(only(v2({ "/pets": { get: ok } }, { schemes: undefined, basePath: "/" })).collection.variables[0].value).toBe("https://api.test");
    expect(only(v2({ "/pets": { get: ok } })).warnings).toEqual([]);
  });

  it("parameters: one of the path is a variable, one of the query is in the address with the value the file gives, and the operation's replaces the path's of the same name", () => {
    const request = one(
      v3({
        "/shops/{shopId}/pets/{petId}.{format}": {
          parameters: [
            { name: "shopId", in: "path", required: true, schema: { type: "string" }, example: "not-used" },
            { name: "limit", in: "query", schema: { type: "integer", default: 5 } },
            { name: "sort", in: "query", schema: { type: "string" } },
          ],
          get: {
            summary: "Get",
            parameters: [
              { name: "limit", in: "query", example: 20, schema: { type: "integer", default: 5 } },
              { name: "status", in: "query", schema: { type: "array", items: { type: "string", enum: ["available", "sold"] } } },
              { name: "q", in: "query", examples: { none: { summary: "no value" }, first: { value: "a&b=c#d" }, second: { value: "z" } } },
              { name: "filter", in: "query", content: { "application/json": { schema: { type: "object", properties: { kind: { type: "string", default: "dog" } } } } } },
              { name: "ids", in: "query", schema: { type: "array", items: { type: "integer" }, example: [1, 2, 3] } },
              { name: "page", in: "query", schema: { type: "integer" } },
              { $ref: "#/components/parameters/trace" },
            ],
            ...ok,
          },
        },
      }, { components: { parameters: { trace: { name: "trace", in: "query", schema: { type: "boolean", default: false } } } } }),
    );
    // A value the file gives is kept; a bare type gives none, and an `&` or a `#` in one is written so that the address still reads as it.
    expect(request.url).toBe('{{baseUrl}}/shops/{{shopId}}/pets/{{petId}}.{{format}}?limit=20&sort=&status=available&q=a%26b=c%23d&filter={"kind":"dog"}&ids=1,2,3&page=&trace=false');
    expect(request.params.map((row) => row.key)).toEqual(["limit", "sort", "status", "q", "filter", "ids", "page", "trace"]);
    expect(request.warnings).toEqual([]);
  });

  it("header parameters are rows, one that is optional and has no value switched off; the three a parameter does not set are left out; cookies are one Cookie row", () => {
    const request = one(
      v3({
        "/pets": {
          get: {
            parameters: [
              { name: "X-Tenant", in: "header", required: true, schema: { type: "string" } },
              { name: "X-Trace", in: "header", schema: { type: "string" } },
              { name: "X-Version", in: "header", schema: { type: "string", enum: ["2", "1"] } },
              { name: "Accept", in: "header", schema: { type: "string", default: "text/csv" } },
              { name: "content-type", in: "header", example: "text/csv" },
              { name: "Authorization", in: "header", example: "Bearer x" },
              { name: "session", in: "cookie", example: "abc" },
              { name: "theme", in: "cookie", schema: { type: "string" } },
            ],
            ...ok,
          },
        },
      }),
    );
    expect(request.headers).toEqual([
      { key: "X-Tenant", value: "", enabled: true },
      { key: "X-Trace", value: "", enabled: false },
      { key: "X-Version", value: "2", enabled: true },
      { key: "Cookie", value: "session=abc; theme=", enabled: true },
    ]);
  });

  it("a JSON body is the file's example, the first of its examples, or a value written from the schema", () => {
    const body = (requestBody: unknown, components: Loose = {}) => one(v3({ "/pets": { post: { requestBody, ...ok } } }, { components })).body;
    expect(body({ content: { "application/json": { example: { name: "Rex" }, schema: { type: "object", properties: { name: { type: "string" } } } } } })).toEqual({ mode: "raw", raw: { language: "json", text: '{\n  "name": "Rex"\n}' } });
    expect(json(body({ content: { "application/json": { examples: { a: { $ref: "#/components/examples/dog" }, b: { value: 2 } } } } }, { examples: { dog: { value: { name: "Dog" } } } }).raw?.text)).toEqual({ name: "Dog" });
    // An example that is text is the body as written.
    expect(body({ content: { "application/json": { example: '{"raw": true}' } } }).raw?.text).toBe('{"raw": true}');
    const schema = {
      type: "object",
      properties: {
        id: { type: "integer", readOnly: true },
        name: { type: "string" },
        born: { type: "string", format: "date" },
        seen: { type: "string", format: "date-time" },
        ref: { type: "string", format: "uuid" },
        mail: { type: "string", format: "email" },
        home: { type: "string", format: "uri" },
        price: { type: "number" },
        sold: { type: "boolean" },
        status: { type: "string", enum: ["available", "sold"] },
        kind: { type: "string", default: "dog" },
        code: { const: "C" },
        nick: { type: ["null", "string"] },
        note: { type: "string", examples: ["first", "second"] },
        tags: { type: "array", items: { $ref: "#/components/schemas/Tag" } },
        owner: { allOf: [{ $ref: "#/components/schemas/Tag" }, { type: "object", properties: { since: { type: "integer", example: 2020 } } }] },
        either: { oneOf: [{ type: "integer" }, { type: "string" }] },
        any: { anyOf: [{ $ref: "#/components/schemas/Tag" }] },
        open: { type: "object" },
        nothing: {},
        list: { items: { type: "string" } },
        wrapped: { allOf: [{ type: "string" }] },
      },
    };
    expect(json(body({ $ref: "#/components/requestBodies/Pet" }, { requestBodies: { Pet: { content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } } } }, schemas: { Pet: schema, Tag: { properties: { label: { type: "string" } } } } }).raw?.text)).toEqual({
      name: "string",
      born: "2026-01-01",
      seen: "2026-01-01T00:00:00Z",
      ref: "00000000-0000-4000-8000-000000000000",
      mail: "user@example.com",
      home: "https://example.com",
      price: 0,
      sold: true,
      status: "available",
      kind: "dog",
      code: "C",
      nick: "string",
      note: "first",
      tags: [{ label: "string" }],
      owner: { label: "string", since: 2020 },
      either: 0,
      any: { label: "string" },
      open: {},
      nothing: null,
      list: ["string"],
      wrapped: "string",
    });
  });

  it("a body of another type: a form's fields, a multipart form's parts with a file, a file, text as the file's example, and the type as a header when the app would send another", () => {
    const made = (content: Loose) => one(v3({ "/pets": { post: { requestBody: { content }, ...ok } } }));
    const fields = { type: "object", properties: { name: { type: "string", example: "Rex" }, age: { type: "integer" }, tags: { type: "array", items: { type: "string", enum: ["a"] } }, photo: { type: "string", format: "binary" } } };
    expect(made({ "application/x-www-form-urlencoded": { schema: fields } }).body).toEqual({
      mode: "urlencoded",
      urlencoded: [
        { key: "name", value: "Rex", enabled: true },
        { key: "age", value: "0", enabled: true },
        { key: "tags", value: "a", enabled: true },
        { key: "photo", value: "string", enabled: true },
      ],
    });
    const multipart = made({ "multipart/form-data": { schema: fields } });
    expect(multipart.body).toEqual({
      mode: "multipart",
      multipart: [
        { key: "name", enabled: true, kind: "text", value: "Rex" },
        { key: "age", enabled: true, kind: "text", value: "0" },
        { key: "tags", enabled: true, kind: "text", value: "a" },
        { key: "photo", enabled: true, kind: "file", fileId: "", fileName: "" },
      ],
    });
    expect(multipart.warnings).toEqual(["A file of its body is named, not included: choose it again in the Body tab."]);
    expect(made({ "application/octet-stream": { schema: { type: "string", format: "binary" } } }).body).toEqual({ mode: "binary", binary: { fileId: "", fileName: "" } });
    expect(made({ "image/png": { schema: { type: "string", format: "binary" } } }).body.mode).toBe("binary");

    const xml = made({ "application/xml": { example: "<pet><name>Rex</name></pet>", schema: { type: "object" } } });
    expect(xml.body).toEqual({ mode: "raw", raw: { language: "xml", text: "<pet><name>Rex</name></pet>" } });
    expect(xml.headers).toEqual([]);
    // Only JSON is written from a schema.
    const bare = made({ "text/xml": { schema: { type: "object", properties: { name: { type: "string" } } } } });
    expect(bare.body).toEqual({ mode: "raw", raw: { language: "xml", text: "" } });
    expect(bare.headers).toEqual([{ key: "Content-Type", value: "text/xml", enabled: true }]);
    expect(bare.warnings).toEqual(["Its body (text/xml) has no example in the file that the app can write out: the body is empty."]);
    expect(made({ "text/plain": { example: "hello" } }).body.raw).toEqual({ language: "text", text: "hello" });
    expect(made({ "text/html": { example: "<p>" } }).body.raw?.language).toBe("html");

    // JSON under a name of its own is sent under that name; any type at all is JSON, with the app's own header.
    const vendor = made({ "application/vnd.api+json": { schema: { type: "object", properties: { data: { type: "string" } } } } });
    expect(vendor.body.raw).toEqual({ language: "json", text: '{\n  "data": "string"\n}' });
    expect(vendor.headers).toEqual([{ key: "Content-Type", value: "application/vnd.api+json", enabled: true }]);
    expect(made({ "*/*": { schema: { type: "object" } } })).toMatchObject({ body: { raw: { language: "json", text: "{}" } }, headers: [] });

    const several = made({ "application/xml": { example: "<a/>" }, "application/json": { example: { a: 1 } }, "text/plain": {} });
    expect(several.body.raw?.language).toBe("json");
    expect(several.warnings).toEqual(["Its body is described in 3 media types (application/xml, application/json, text/plain): the request has the application/json one."]);
    // No JSON among them: the first.
    expect(made({ "text/csv": { example: "a,b" }, "application/xml": { example: "<a/>" } }).body.raw).toEqual({ language: "text", text: "a,b" });
    expect(one(v3({ "/pets": { post: { requestBody: { content: {} }, ...ok } } })).body).toEqual({ mode: "none" });
  });

  it("Swagger 2.0: a body parameter is the body, form parameters are a form, one of them a file makes it multipart, and `consumes` says the type", () => {
    const made = (operation: Loose, more: Loose = {}) => one(v2({ "/pets/{id}": { post: { ...operation, ...ok } } }, more));
    const pet = { name: "pet", in: "body", schema: { $ref: "#/definitions/Pet" } };
    const definitions = { Pet: { type: "object", properties: { name: { type: "string", example: "Rex" } } } };
    expect(made({ parameters: [pet] }, { definitions }).body).toEqual({ mode: "raw", raw: { language: "json", text: '{\n  "name": "Rex"\n}' } });
    expect(made({ parameters: [pet], consumes: ["application/xml", "application/json"] }, { definitions }).body.raw?.language).toBe("json");
    const xml = made({ parameters: [{ ...pet, "x-example": "<pet/>" }] }, { definitions, consumes: ["application/xml"] });
    expect(xml.body.raw).toEqual({ language: "xml", text: "<pet/>" });

    const form = [
      { name: "id", in: "path", required: true, type: "integer" },
      { name: "name", in: "formData", type: "string", default: "Rex" },
      { name: "status", in: "formData", type: "string", enum: ["sold"] },
      { name: "age", in: "formData", type: "integer" },
      { name: "X-Rate", in: "header", type: "integer", default: 10 },
      { name: "verbose", in: "query", type: "boolean", "x-example": true },
    ];
    const urlencoded = made({ parameters: form });
    expect(urlencoded.url).toBe("{{baseUrl}}/pets/{{id}}?verbose=true");
    expect(urlencoded.headers).toEqual([{ key: "X-Rate", value: "10", enabled: true }]);
    expect(urlencoded.body).toEqual({
      mode: "urlencoded",
      urlencoded: [
        { key: "name", value: "Rex", enabled: true },
        { key: "status", value: "sold", enabled: true },
        { key: "age", value: "", enabled: true },
      ],
    });
    expect(made({ parameters: form, consumes: ["multipart/form-data"] }).body.mode).toBe("multipart");
    expect(made({ parameters: [...form, { name: "photo", in: "formData", type: "file" }] }).body.multipart?.at(-1)).toEqual({ key: "photo", enabled: true, kind: "file", fileId: "", fileName: "" });
  });

  it("an oauth2 scheme becomes OAuth 2.0 by the first flow the app has, with the addresses and the scopes the file gives and a client to fill in (P4.7)", () => {
    const flows = {
      implicit: { authorizationUrl: "https://idp.test/authorize", scopes: { read: "Read" } },
      password: { tokenUrl: "https://idp.test/token", scopes: { read: "Read" } },
      clientCredentials: { tokenUrl: "https://idp.test/token", scopes: { read: "Read", write: "Write" } },
      authorizationCode: { authorizationUrl: "https://idp.test/authorize", tokenUrl: "https://idp.test/token", scopes: { read: "Read", write: "Write" } },
    };
    const securitySchemes = {
      all: { type: "oauth2", flows },
      machine: { type: "oauth2", flows: { clientCredentials: flows.clientCredentials } },
      user: { type: "oauth2", flows: { password: flows.password } },
      old: { type: "oauth2", flows: { implicit: flows.implicit } },
    };
    const operation = (name: string, security: unknown) => ({ get: { summary: name, security, ...ok } });
    const { requests, warnings } = only(
      v3({ "/all": operation("all", [{ all: ["read"] }]), "/machine": operation("machine", [{ machine: [] }]), "/user": operation("user", [{ user: [] }]), "/old": operation("old", [{ old: ["read"] }]) }, { components: { securitySchemes } }),
    );
    const base = { type: "oauth2", authUrl: "", tokenUrl: "https://idp.test/token", clientId: "{{clientId}}", clientSecret: "", scope: "read", username: "", password: "", clientAuth: "header", retryOn401: false };
    expect(Object.fromEntries(requests.map((request) => [request.name, request.auth]))).toEqual({
      // The scopes the operation asks for, not every scope of the flow.
      all: { ...base, grant: "authorization_code", authUrl: "https://idp.test/authorize" },
      // None asked for: the flow's own.
      machine: { ...base, grant: "client_credentials", clientSecret: "{{clientSecret}}", scope: "read write" },
      user: { ...base, grant: "password", username: "{{authUsername}}", password: "{{authPassword}}" },
      old: { type: "none" },
    });
    expect(warnings).toEqual([{ item: 'request "old"', message: "Its auth is OAuth 2.0 with a grant the app does not have (implicit) and is left out: it is sent with no auth." }]);
  });

  it("Swagger 2.0 names one flow on the scheme: accessCode is the code grant, application the client's", () => {
    const securityDefinitions = {
      code: { type: "oauth2", flow: "accessCode", authorizationUrl: "https://idp.test/authorize", tokenUrl: "https://idp.test/token", scopes: { read: "Read" } },
      app: { type: "oauth2", flow: "application", tokenUrl: "https://idp.test/token", scopes: {} },
      old: { type: "oauth2", flow: "implicit", authorizationUrl: "https://idp.test/authorize", scopes: {} },
    };
    const operation = (name: string, security: unknown) => ({ get: { summary: name, security, ...ok } });
    const { requests, warnings } = only(v2({ "/code": operation("code", [{ code: [] }]), "/app": operation("app", [{ app: [] }]), "/old": operation("old", [{ old: [] }]) }, { securityDefinitions }));
    expect(requests.map((request) => [request.name, request.auth.type, "grant" in request.auth && request.auth.grant, "scope" in request.auth && request.auth.scope])).toEqual([
      ["code", "oauth2", "authorization_code", "read"],
      ["app", "oauth2", "client_credentials", ""],
      ["old", "none", false, false],
    ]);
    expect(warnings.map((warning) => warning.message)).toEqual(["Its auth is OAuth 2.0 with a grant the app does not have (implicit) and is left out: it is sent with no auth."]);
  });

  it("security: the file's is the collection's auth, an operation's is its own, none said inherits and an empty one is no auth; a value is a variable to fill in", () => {
    const securitySchemes = {
      key: { type: "apiKey", in: "header", name: "X-API-Key" },
      inQuery: { type: "apiKey", in: "query", name: "api_key" },
      inCookie: { type: "apiKey", in: "cookie", name: "sid" },
      token: { type: "http", scheme: "Bearer" },
      login: { type: "http", scheme: "basic" },
      digest: { type: "http", scheme: "digest" },
      oauth: { type: "oauth2", flows: {} },
      oidc: { $ref: "#/components/securitySchemes/connect" },
      connect: { type: "openIdConnect", openIdConnectUrl: "https://id.test/.well-known/openid-configuration" },
    };
    const operation = (name: string, security?: unknown) => ({ get: { summary: name, ...(security !== undefined && { security }), ...ok } });
    const { collection, requests, warnings } = only(
      v3(
        {
          "/inherits": operation("inherits"),
          "/none": operation("none", []),
          "/optional": operation("optional", [{}, { token: [] }]),
          "/token": operation("token", [{ token: [] }, { key: [] }]),
          "/login": operation("login", [{ login: [] }]),
          "/query": operation("query", [{ inQuery: [] }]),
          "/cookie": operation("cookie", [{ inCookie: [] }]),
          "/digest": operation("digest", [{ digest: [] }]),
          "/oauth": operation("oauth", [{ oauth: ["read"] }]),
          "/oidc": operation("oidc", [{ oidc: [] }]),
          "/both": operation("both", [{ key: [], token: [] }]),
          "/unknown": operation("unknown", [{ nowhere: [] }]),
        },
        { security: [{ key: [] }], components: { securitySchemes } },
      ),
    );
    expect(collection.auth).toEqual({ type: "apikey", key: "X-API-Key", value: "{{apiKey}}", in: "header" });
    expect(Object.fromEntries(requests.map((request) => [request.name, request.auth]))).toEqual({
      inherits: { type: "inherit" },
      none: { type: "none" },
      optional: { type: "none" },
      token: { type: "bearer", token: "{{bearerToken}}" },
      login: { type: "basic", username: "{{authUsername}}", password: "{{authPassword}}" },
      query: { type: "apikey", key: "api_key", value: "{{apiKey}}", in: "query" },
      cookie: { type: "none" },
      digest: { type: "none" },
      oauth: { type: "none" },
      oidc: { type: "none" },
      both: { type: "apikey", key: "X-API-Key", value: "{{apiKey}}", in: "header" },
      unknown: { type: "none" },
    });
    const left = (type: string) => `Its auth is of a type the app does not have (${type}) and is left out: it is sent with no auth.`;
    expect(warnings).toEqual([
      { item: 'request "both"', message: "It needs 2 security schemes together (key, token): only the first is set." },
      { item: 'request "cookie"', message: left("an API key in a cookie") },
      { item: 'request "digest"', message: left("http digest") },
      { item: 'request "oauth"', message: "Its auth is OAuth 2.0 with a grant the app does not have (none said) and is left out: it is sent with no auth." },
      { item: 'request "oidc"', message: left("openIdConnect") },
      { item: 'request "unknown"', message: left("nowhere, which the file does not describe") },
    ]);

    // Swagger 2.0 keeps its schemes in `securityDefinitions`, and Basic is a type of its own. A file with no `security` sends none.
    const old = only(v2({ "/a": operation("a", [{ login: [] }]), "/b": operation("b", [{ key: [] }]), "/c": operation("c") }, { securityDefinitions: { login: { type: "basic" }, key: { type: "apiKey", in: "query", name: "k" } } }));
    expect(old.collection.auth).toEqual({ type: "none" });
    expect(old.requests.map((request) => request.auth)).toEqual([{ type: "basic", username: "{{authUsername}}", password: "{{authPassword}}" }, { type: "apikey", key: "k", value: "{{apiKey}}", in: "query" }, { type: "inherit" }]);
  });

  it("a reference inside the file is followed: through others, by a pointer with escapes, to a path, a parameter, a body, a schema", () => {
    const { requests, warnings } = only({
      openapi: "3.1.0",
      servers: [{ url: "https://api.test" }],
      paths: { "/pets/{id}": { $ref: "#/components/pathItems/pet" } },
      components: {
        pathItems: { pet: { parameters: [{ $ref: "#/components/parameters/a~1b" }], put: { summary: "Put", requestBody: { $ref: "#/components/requestBodies/first" } } } },
        parameters: { "a/b": { $ref: "#/components/parameters/c~0d" }, "c~d": { $ref: "#/components/parameters/e%20f" }, "e f": { name: "depth", in: "query", example: 3 } },
        requestBodies: { first: { $ref: "#/components/requestBodies/second" }, second: { content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } } } },
        schemas: { Pet: { type: "object", properties: { first: { $ref: "#/components/schemas/Pet/properties/second" }, second: { type: "string", default: "two" }, third: { $ref: "#/paths/~1pets~1{id}" } } } },
      },
    });
    expect(requests.map((request) => request.url)).toEqual(["{{baseUrl}}/pets/{{id}}?depth=3"]);
    // The third leads through the path's own reference to something that is no schema: no value, and no harm.
    expect(json(requests[0].body.raw?.text)).toEqual({ first: "two", second: "two", third: null });
    expect(warnings).toEqual([]);
  });

  it("references that go round end: a ring of them, a schema inside itself, a path that is itself", () => {
    const schemas = {
      Node: { type: "object", properties: { name: { type: "string" }, parent: { $ref: "#/components/schemas/Node" }, children: { type: "array", items: { $ref: "#/components/schemas/Node" } }, pair: { $ref: "#/components/schemas/Pair" } } },
      Pair: { allOf: [{ $ref: "#/components/schemas/Node" }], properties: { other: { $ref: "#/components/schemas/Pair" } } },
      A: { $ref: "#/components/schemas/B" },
      B: { $ref: "#/components/schemas/C" },
      C: { $ref: "#/components/schemas/A" },
      Self: { $ref: "#/components/schemas/Self" },
    };
    const body = (schema: string) => ({ requestBody: { content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } } }, ...ok });
    const { requests, warnings } = only(v3({ "/node": { post: { summary: "Node", ...body("Node") } }, "/ring": { post: { summary: "Ring", ...body("A") } }, "/self": { post: { summary: "Self", ...body("Self") } }, "/loop": { $ref: "#/paths/~1loop" } }, { components: { schemas } }));
    expect(requests.map((request) => request.name)).toEqual(["Node", "Ring", "Self"]);
    // Where a schema would hold itself, it holds nothing.
    expect(json(requests[0].body.raw?.text)).toEqual({ name: "string", parent: null, children: [], pair: { other: null } });
    expect(requests[1].body.raw?.text).toBe("");
    expect(warnings).toEqual([
      { item: 'request "Ring"', message: "Its body (application/json) has no example in the file that the app can write out: the body is empty." },
      { item: 'request "Self"', message: "Its body (application/json) has no example in the file that the app can write out: the body is empty." },
      { item: 'request "Ring"', message: "It refers to a part of the file that is not there or leads back to itself (#/components/schemas/A), and that is left out." },
      { item: 'request "Self"', message: "It refers to a part of the file that is not there or leads back to itself (#/components/schemas/Self), and that is left out." },
      { item: "path /loop", message: "It refers to a part of the file that is not there or leads back to itself (#/paths/~1loop), and that is left out." },
    ]);
  });

  it("@claim:C-060 a reference to another file or to an address is never fetched: what the file itself holds is kept, and the report names the reference", () => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    vi.stubGlobal("XMLHttpRequest", fetched);
    const { requests, warnings } = only(
      v3(
        {
          "/pets": {
            post: {
              summary: "Create",
              parameters: [{ $ref: "https://specs.test/parameters.yaml#/limit" }, { name: "kept", in: "query", example: 1 }],
              requestBody: { content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, owner: { $ref: "./owner.yaml" }, tag: { $ref: "schemas.json#/Tag" }, more: { $ref: "//cdn.test/more.json" }, nowhere: { $ref: "#/components/schemas/Missing" }, anchor: { $ref: "#pet" } } } } } },
              ...ok,
            },
          },
          "/orders": { $ref: "file:///etc/orders.yaml" },
          "/users": { get: { summary: "Users", security: [{ remote: [] }], ...ok } },
        },
        { components: { securitySchemes: { remote: { $ref: "http://127.0.0.1:1/schemes.json#/remote" } } } },
      ),
    );
    expect(fetched).not.toHaveBeenCalled();
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual(["POST {{baseUrl}}/pets?kept=1", "GET {{baseUrl}}/users"]);
    expect(json(requests[0].body.raw?.text)).toEqual({ name: "string", owner: null, tag: null, more: null, nowhere: null, anchor: null });
    expect(warnings).toEqual([
      { item: 'request "Create"', message: "It refers to 4 other files or addresses (https://specs.test/parameters.yaml#/limit, ./owner.yaml, schemas.json#/Tag, and 1 more). An import fetches nothing: what they describe is left out." },
      { item: 'request "Create"', message: "It refers to 2 parts of the file that are not there or lead back to themselves (#/components/schemas/Missing, #pet), and those are left out." },
      { item: "path /orders", message: "It refers to another file or an address (file:///etc/orders.yaml). An import fetches nothing: what it describes is left out." },
      { item: 'request "Users"', message: "It refers to another file or an address (http://127.0.0.1:1/schemes.json#/remote). An import fetches nothing: what it describes is left out." },
      { item: 'request "Users"', message: "Its auth is of a type the app does not have (remote, which the file does not describe) and is left out: it is sent with no auth." },
    ]);
  });

  it("a schema that doubles at every level is sampled to a limit, not written out", () => {
    // Thirty levels, each holding the next twice: a billion values, written out.
    const schemas = Object.fromEntries(Array.from({ length: 30 }, (_unused, index) => [`L${index}`, { type: "object", properties: { a: { $ref: `#/components/schemas/L${index + 1}` }, b: { $ref: `#/components/schemas/L${index + 1}` } } }]));
    const request = one(v3({ "/deep": { post: { requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/L0" } } } }, ...ok } } }, { components: { schemas: { ...schemas, L30: { type: "string" } } } }));
    expect(request.body.raw?.text.length).toBeLessThan(100_000);
    expect(json(request.body.raw?.text)).toMatchObject({ a: { a: { a: {} } } });
  });

  it("a key of the file that is a name every object has is read as the file's, or not at all", () => {
    const file = JSON.parse(
      JSON.stringify(v3({ "/pets": { post: { tags: ["constructor"], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/__proto__" } } } }, security: [{ toString: [] }], ...ok } } }, { components: { schemas: {} } })).replace('"schemas":{}', '"schemas":{"__proto__":{"type":"object","properties":{"__proto__":{"type":"string","default":"own"},"constructor":{"type":"string","format":"constructor"}}}}'),
    ) as unknown;
    const { folders, requests } = only(file);
    expect(folders.map((folder) => folder.name)).toEqual(["constructor"]);
    expect(requests[0].body.raw?.text).toBe('{\n  "__proto__": "own",\n  "constructor": "string"\n}');
    expect(requests[0].auth).toEqual({ type: "none" });
    // A pointer does not reach what every object has.
    expect(one(v3({ "/x": { post: { requestBody: { content: { "application/json": { schema: { $ref: "#/constructor/prototype" } } } }, ...ok } } })).body.raw?.text).toBe("");
    expect(({} as Loose)["own"]).toBeUndefined();
  });

  it("a description in YAML has the limit of every YAML file, and in JSON the limit of every import", () => {
    const large = { ...v3({ "/pets": { get: ok } }), "x-pad": "x".repeat(MAX_YAML_CHARS + 1) };
    expect(() => importText(stringify(large))).toThrow(YAML_TOO_LARGE);
    expect(read(large).report.counts.requests).toBe(1);
  });

  it("any text, and any OpenAPI-shaped value, is imported or refused with an ImportError, and nothing else is thrown", () => {
    const outcome = (text: string): boolean => {
      try {
        importText(text);
        return true;
      } catch (error) {
        if (error instanceof ImportError) return true;
        throw error;
      }
    };
    const ref = fc.constantFrom("#", "#/", "#/paths", "#/paths/~1a", "#/components/schemas/A", "#/components/schemas/B", "#/a/0", "#/%", "#/~", "x.yaml", "https://x.test/#/a", "");
    const any = fc.oneof(fc.jsonValue(), ref.map(($ref) => ({ $ref })));
    const shaped = fc.oneof(
      fc.jsonValue().map((value) => JSON.stringify({ openapi: "3.0.0", info: value, servers: value, tags: value, security: value, paths: value, components: value })),
      fc.jsonValue().map((value) => JSON.stringify({ swagger: "2.0", host: value, basePath: value, schemes: value, consumes: value, paths: value, securityDefinitions: value })),
      fc.tuple(any, any, any, any).map(([a, b, c, d]) =>
        JSON.stringify({
          openapi: "3.1.0",
          servers: [{ url: a, variables: b }],
          tags: [a, { name: b }],
          security: c,
          paths: { "/a": { parameters: [a, { name: b, in: "query", schema: c, example: d }, { name: "h", in: "header", content: c }], get: { tags: a, summary: b, parameters: c, requestBody: d, security: a, servers: b }, post: { requestBody: { content: { "application/json": { schema: a, examples: b }, "multipart/form-data": { schema: c }, [typeof d === "string" ? d : "text/plain"]: c } } } }, "/b/{x}": a },
          components: { schemas: { A: a, B: { properties: { a: { $ref: "#/components/schemas/A" }, b: { $ref: "#/components/schemas/B" }, c }, allOf: [d, { $ref: "#/components/schemas/A" }], items: b } }, securitySchemes: b },
        }),
      ),
      fc.tuple(any, any, any).map(([a, b, c]) => JSON.stringify({ swagger: "2.0", paths: { "/a": { post: { consumes: a, parameters: [{ name: "b", in: "body", schema: b }, { name: "f", in: "formData", type: c }, c], security: [{ s: [] }] } } }, definitions: a, securityDefinitions: { s: b } })),
    );
    fc.assert(fc.property(shaped, outcome), { numRuns: 500 });
  });
});
