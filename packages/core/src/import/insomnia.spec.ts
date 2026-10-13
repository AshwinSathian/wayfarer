import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { ImportError, detectFormat, importText } from "./import";
import { MAX_YAML_ALIASES, MAX_YAML_CHARS, NOT_READABLE, YAML_ALIASES, YAML_TOO_LARGE, parseYaml } from "./yaml";

type Loose = Record<string, unknown>;

/** A format 5 file around `collection`. */
const v5 = (collection: unknown[], more: Loose = {}) => ({ type: "collection.insomnia.rest/5.0", name: "Shop", meta: { id: "wrk_1", description: "The shop's API" }, collection, ...more });
/** A format 4 file of `resources`, in a workspace `wrk_1`. */
const v4 = (resources: Loose[]) => ({ _type: "export", __export_format: 4, resources: [{ _id: "wrk_1", _type: "workspace", parentId: null, name: "Shop", description: "The shop's API" }, ...resources] });
const read = (file: unknown) => importText(JSON.stringify(file));
const only = (file: unknown) => {
  const imported = read(file);
  return { ...imported.collections[0].payload, warnings: imported.report.warnings, environments: imported.environments };
};
const messages = (file: unknown) => read(file).report.warnings;

describe("an Insomnia export (P4.4)", () => {
  it("is known by what it says it is, in both formats, and before a Postman file is asked for", () => {
    expect(detectFormat(v5([]))).toBe("insomnia");
    expect(detectFormat(v4([]))).toBe("insomnia");
    // A file with Postman's `item` that says it is Insomnia's is Insomnia's.
    expect(detectFormat({ ...v5([]), item: [] })).toBe("insomnia");
    expect(read(v5([])).report).toMatchObject({ format: "insomnia", formatName: "Insomnia export", counts: { collections: 1, folders: 0, requests: 0, environments: 0 } });
  });

  it("format 5: folders in folders with their requests, in the file's order, with names and descriptions", () => {
    const { collection, folders, requests } = only(
      v5([
        { name: "Orders", meta: { id: "fld_1", description: "Everything about orders" }, children: [{ name: "Old", children: [{ name: "List", method: "get", url: "https://api.test/orders", meta: { description: "All of them" } }] }, { name: "Make", method: "POST", url: "https://api.test/orders" }] },
        { name: "Ping", method: "GET", url: "https://api.test/ping" },
      ]),
    );
    expect(collection).toMatchObject({ name: "Shop", description: "The shop's API", auth: { type: "none" }, scripts: { pre: "", post: "" } });
    const orders = folders.find((folder) => folder.name === "Orders");
    const old = folders.find((folder) => folder.name === "Old");
    expect(orders).toMatchObject({ description: "Everything about orders", order: 0 });
    expect(old?.parentFolderId).toBe(orders?.id);
    const byName = [...requests].sort((a, b) => a.name.localeCompare(b.name));
    expect(byName.map((request) => [request.name, request.method, request.url, request.folderId, request.order, request.description])).toEqual([
      ["List", "GET", "https://api.test/orders", old?.id, 0, "All of them"],
      ["Make", "POST", "https://api.test/orders", orders?.id, 1, undefined],
      ["Ping", "GET", "https://api.test/ping", undefined, 1, undefined],
    ]);
  });

  it("format 4: a workspace is a collection, a resource is under its parent, and the order is the sort key's", () => {
    const { collection, folders, requests } = only(
      v4([
        { _id: "req_2", _type: "request", parentId: "fld_1", name: "Second", method: "GET", url: "https://api.test/2", metaSortKey: 2 },
        { _id: "req_1", _type: "request", parentId: "fld_1", name: "First", method: "GET", url: "https://api.test/1", metaSortKey: 1, description: "The first" },
        { _id: "fld_1", _type: "request_group", parentId: "wrk_1", name: "Orders", description: "About orders" },
        { _id: "req_3", _type: "request", parentId: "wrk_1", name: "Ping", method: "GET", url: "https://api.test/ping" },
      ]),
    );
    expect(collection).toMatchObject({ name: "Shop", description: "The shop's API" });
    expect(folders.map((folder) => [folder.name, folder.description])).toEqual([["Orders", "About orders"]]);
    const byName = [...requests].sort((a, b) => a.name.localeCompare(b.name));
    expect(byName.map((request) => [request.name, request.folderId === folders[0].id, request.order, request.description])).toEqual([
      ["First", true, 0, "The first"],
      ["Ping", false, 1, undefined],
      ["Second", true, 1, undefined],
    ]);
  });

  it("format 4: each workspace is a collection, and requests whose workspace is not in the file get one of their own", () => {
    const imported = read({
      _type: "export",
      __export_format: 4,
      resources: [
        { _id: "wrk_1", _type: "workspace", name: "One" },
        { _id: "wrk_2", _type: "workspace", name: "Two" },
        { _id: "req_1", _type: "request", parentId: "wrk_1", name: "A", method: "GET", url: "https://a.test/" },
        { _id: "req_2", _type: "request", parentId: "wrk_2", name: "B", method: "GET", url: "https://b.test/" },
        { _id: "req_3", _type: "request", parentId: "wrk_gone", name: "C", method: "GET", url: "https://c.test/" },
      ],
    });
    expect(imported.collections.map(({ payload }) => [payload.collection.name, payload.requests.map((request) => request.name)])).toEqual([
      ["One", ["A"]],
      ["Two", ["B"]],
      ["Imported from Insomnia", ["C"]],
    ]);
    expect(imported.report.counts).toEqual({ collections: 3, folders: 0, requests: 3, environments: 0 });
  });

  it("format 4: resources that name each other as parents, or share an id, are placed once or left out, and said", () => {
    const ring = read(
      v4([
        { _id: "fld_a", _type: "request_group", parentId: "fld_b", name: "A" },
        { _id: "fld_b", _type: "request_group", parentId: "fld_a", name: "B" },
        { _id: "req_1", _type: "request", parentId: "fld_a", name: "Lost", method: "GET", url: "https://a.test/" },
      ]),
    );
    expect(ring.report.counts).toMatchObject({ folders: 0, requests: 0 });
    expect(ring.report.warnings).toEqual([{ item: "file", message: "3 requests and folders are left out: the file does not say which collection they are in." }]);

    // Forty folders that all say they are the workspace, each in it: a tree made by following ids would have 40 to the power of 64 folders.
    const same = read(v4(Array.from({ length: 40 }, (_unused, index) => ({ _id: "wrk_1", _type: "request_group", parentId: "wrk_1", name: `F${index}` }))));
    expect(same.report.counts.folders).toBe(40);
  });

  it("a folder nested more than 64 deep is refused", () => {
    let tree: Loose = { name: "Leaf", method: "GET", url: "https://a.test/" };
    for (let depth = 0; depth < 70; depth++) tree = { name: `F${depth}`, children: [tree] };
    expect(() => read(v5([tree]))).toThrow("The file's folders are nested more than 64 deep.");
    const chain = Array.from({ length: 70 }, (_unused, index) => ({ _id: `fld_${index}`, _type: "request_group", parentId: index ? `fld_${index - 1}` : "wrk_1", name: `F${index}` }));
    expect(() => read(v4(chain))).toThrow("The file's folders are nested more than 64 deep.");
  });

  it("a variable is written the app's way, whichever way Insomnia wrote it, everywhere a request holds text", () => {
    const { requests, collection } = only(
      v5(
        [
          {
            name: "R",
            method: "POST",
            url: "{{ _.base_url }}/users/{{user}}",
            parameters: [{ name: "{{ _['page-name'] }}", value: "{{ _.paging.size }}" }],
            headers: [{ name: "X-Tenant", value: '{{_["tenant"]["id"]}}' }],
            body: { mimeType: "application/json", text: '{"id":"{{ id }}","keep":"{ {not} }"}' },
            authentication: { type: "bearer", token: "{{ _.token }}" },
          },
        ],
        { environments: { name: "Base Environment", data: { base_url: "https://api.test", paging: { size: 20, sort: { by: "name" } }, list: [1, 2], on: true, none: null, ref: "{{ _.base_url }}/v2" } } },
      ),
    );
    expect(requests[0]).toMatchObject({
      url: "{{base_url}}/users/{{user}}?{{page-name}}={{paging.size}}",
      params: [{ key: "{{page-name}}", value: "{{paging.size}}", enabled: true }],
      headers: [{ key: "X-Tenant", value: "{{tenant.id}}", enabled: true }],
      body: { mode: "raw", raw: { language: "json", text: '{"id":"{{id}}","keep":"{ {not} }"}' } },
      auth: { type: "bearer", token: "{{token}}" },
    });
    // The base environment is the collection's variables; a value in an object is named by its path, as the request names it.
    expect(collection.variables).toEqual([
      { key: "base_url", value: "https://api.test", enabled: true },
      { key: "paging.size", value: "20", enabled: true },
      { key: "paging.sort.by", value: "name", enabled: true },
      { key: "list", value: "[1,2]", enabled: true },
      { key: "on", value: "true", enabled: true },
      { key: "none", value: "", enabled: true },
      { key: "ref", value: "{{base_url}}/v2", enabled: true },
    ]);
  });

  it("a template tag or a filter is kept as written and said once for the request", () => {
    const { requests, warnings } = only(v5([{ name: "R", method: "GET", url: "https://api.test/{% uuid 'v4' %}", headers: [{ name: "X-A", value: "{{ name | upper }}" }, { name: "X-B", value: "{% now 'iso-8601' %}" }, { name: "X-C", value: "{{ open" }] }]));
    expect(requests[0].url).toBe("https://api.test/{% uuid 'v4' %}");
    expect(requests[0].headers[0].value).toBe("{{ name | upper }}");
    expect(warnings).toEqual([{ item: 'request "R"', message: "It uses a template of Insomnia's ({% uuid 'v4' %}, and 2 more), which the app does not have: the text is kept as written." }]);
  });

  it("environments: the ones under the base environment are the app's, in both formats; a folder's are its variables", () => {
    const five = only(
      v5([{ name: "F", environment: { region: "eu", nested: { key: "v" } }, children: [] }], {
        environments: { name: "Base Environment", data: { host: "base.test" }, subEnvironments: [{ name: "Dev", data: { host: "dev.test", region: "us" } }, { name: "", data: {} }] },
      }),
    );
    expect(five.collection.variables).toEqual([{ key: "host", value: "base.test", enabled: true }]);
    expect(five.environments.map((environment) => [environment.name, environment.vars])).toEqual([
      ["Dev", [{ key: "host", value: "dev.test", enabled: true }, { key: "region", value: "us", enabled: true }]],
      ["Environment", []],
    ]);
    expect(five.folders[0].variables).toEqual([{ key: "region", value: "eu", enabled: true }, { key: "nested.key", value: "v", enabled: true }]);
    // In Insomnia the folder's value wins over the environment's; here it loses, and the report says so.
    expect(five.warnings).toEqual([{ item: 'folder "F"', message: 'Its variable region is also in the environment "Dev". Insomnia uses the folder\'s value; the app uses the environment\'s when that environment is active.' }]);

    const four = only(
      v4([
        { _id: "env_base", _type: "environment", parentId: "wrk_1", name: "Base Environment", data: { host: "base.test" } },
        { _id: "env_dev", _type: "environment", parentId: "env_base", name: "Dev", data: { host: "dev.test" } },
        { _id: "env_lost", _type: "environment", parentId: "wrk_gone", name: "Other base", data: { a: 1 } },
      ]),
    );
    expect(four.collection.variables).toEqual([{ key: "host", value: "base.test", enabled: true }]);
    expect(four.environments.map((environment) => [environment.name, environment.vars])).toEqual([
      ["Dev", [{ key: "host", value: "dev.test", enabled: true }]],
      ["Other base", [{ key: "a", value: "1", enabled: true }]],
    ]);
  });

  it("a file of environments alone gives each with the base's values under its own", () => {
    const imported = read({ type: "environment.insomnia.rest/5.0", name: "Shared", environments: { name: "Base Environment", data: { host: "base.test", region: "eu" }, subEnvironments: [{ name: "Dev", data: { host: "dev.test" } }] } });
    expect(imported.report.counts).toEqual({ collections: 0, folders: 0, requests: 0, environments: 2 });
    expect(imported.environments.map((environment) => [environment.name, environment.vars.map((row) => `${row.key}=${row.value}`)])).toEqual([
      ["Shared", ["host=base.test", "region=eu"]],
      ["Dev", ["host=dev.test", "region=eu"]],
    ]);
  });

  it("auth: its own, none, or the nearest folder's when it has no type or is switched off, as Insomnia sends it", () => {
    const request = (name: string, authentication?: unknown) => ({ name, method: "GET", url: "https://api.test/", ...(authentication !== undefined && { authentication }) });
    const { requests, folders, collection, warnings } = only(
      v5([
        {
          name: "F",
          authentication: { type: "basic", username: "u", password: "p" },
          children: [
            request("none given"),
            request("empty", {}),
            request("off", { type: "bearer", token: "t", disabled: true }),
            request("said none", { type: "none" }),
            request("bearer", { type: "bearer", token: "t", prefix: "" }),
            request("bearer named", { type: "bearer", token: "t", prefix: "Bearer" }),
            request("another prefix", { type: "bearer", token: "t", prefix: "Token" }),
            request("no prefix", { type: "bearer", token: "t", prefix: "NO_PREFIX" }),
            request("key", { type: "apikey", key: "X-Key", value: "v", addTo: "header" }),
            request("key in query", { type: "apikey", key: "key", value: "v", addTo: "queryParams" }),
            request("key in cookie", { type: "apikey", key: "key", value: "v", addTo: "cookie" }),
            request("signed", { type: "iam", accessKeyId: "a", secretAccessKey: "{{ _.secret }}", sessionToken: "t", region: "eu-west-1", service: "s3" }),
            request("digest", { type: "digest", username: "u" }),
          ],
        },
        { name: "G", authentication: { type: "hawk", id: "i" }, children: [] },
        { name: "H", authentication: { type: "basic", username: "u", password: "p", disabled: true }, children: [] },
      ]),
    );
    expect(collection.auth).toEqual({ type: "none" });
    expect(folders.map((folder) => [folder.name, folder.auth])).toEqual([
      ["F", { type: "basic", username: "u", password: "p" }],
      ["G", { type: "none" }],
      ["H", { type: "inherit" }],
    ]);
    expect(requests.map((entry) => [entry.name, entry.auth])).toEqual([
      ["none given", { type: "inherit" }],
      ["empty", { type: "inherit" }],
      ["off", { type: "inherit" }],
      ["said none", { type: "none" }],
      ["bearer", { type: "bearer", token: "t" }],
      ["bearer named", { type: "bearer", token: "t" }],
      // Insomnia sends "Token t": the app's bearer sends "Bearer t", so it is a header of its own.
      ["another prefix", { type: "apikey", key: "Authorization", value: "Token t", in: "header" }],
      ["no prefix", { type: "apikey", key: "Authorization", value: "t", in: "header" }],
      ["key", { type: "apikey", key: "X-Key", value: "v", in: "header" }],
      ["key in query", { type: "apikey", key: "key", value: "v", in: "query" }],
      ["key in cookie", { type: "none" }],
      ["signed", { type: "awsv4", accessKey: "a", secretKey: "{{secret}}", sessionToken: "t", region: "eu-west-1", service: "s3" }],
      ["digest", { type: "none" }],
    ]);
    expect(warnings).toEqual([
      { item: 'request "key in cookie"', message: "Its auth is of a type the app does not have (an API key in a cookie) and is left out: it is sent with no auth." },
      { item: 'request "digest"', message: "Its auth is of a type the app does not have (digest) and is left out: it is sent with no auth." },
      { item: 'folder "G"', message: "Its auth is of a type the app does not have (hawk) and is left out: it is sent with no auth." },
    ]);
  });

  it("OAuth 2.0 is imported by its grant, the client named in the header unless Insomnia put it in the body; the implicit grant is left out and said (P4.7)", () => {
    const request = (name: string, authentication: unknown) => ({ name, method: "GET", url: "https://api.test/", authentication });
    const oauth = (grantType: string, more: Loose = {}) => ({ type: "oauth2", grantType, authorizationUrl: "https://idp.test/authorize", accessTokenUrl: "https://idp.test/token", clientId: "client", clientSecret: "{{ _.secret }}", scope: "read", usePkce: true, ...more });
    const { requests } = only(
      v5([
        request("code", oauth("authorization_code")),
        request("client", oauth("client_credentials", { credentialsInBody: true })),
        request("password", oauth("password", { username: "alice", password: "pw" })),
        request("implicit", oauth("implicit")),
      ]),
    );
    const base = { type: "oauth2", authUrl: "https://idp.test/authorize", tokenUrl: "https://idp.test/token", clientId: "client", clientSecret: "{{secret}}", scope: "read", username: "", password: "", clientAuth: "header", retryOn401: false };
    expect(requests.map((entry) => [entry.name, entry.auth])).toEqual([
      ["code", { ...base, grant: "authorization_code" }],
      ["client", { ...base, grant: "client_credentials", clientAuth: "body" }],
      ["password", { ...base, grant: "password", username: "alice", password: "pw" }],
      ["implicit", { type: "none" }],
    ]);
    expect(messages(v5([request("implicit", oauth("implicit"))]))).toEqual([
      { item: 'request "implicit"', message: "Its auth is OAuth 2.0 with a grant the app does not have (implicit) and is left out: it is sent with no auth." },
    ]);
  });

  it("a body: text by its media type, a form, a multipart form with a file named, a file, and GraphQL as the JSON it is sent as", () => {
    const request = (name: string, body: unknown) => ({ name, method: "POST", url: "https://api.test/", body });
    const { requests, warnings } = only(
      v5([
        request("none", {}),
        request("json", { mimeType: "application/json", text: '{"a":1}' }),
        request("xml", { mimeType: "application/xml", text: "<a/>" }),
        request("plain", { mimeType: "text/plain", text: "hello" }),
        request("other", { mimeType: "application/edn", text: "{:a 1}" }),
        request("untyped", { text: "hello" }),
        request("form", { mimeType: "application/x-www-form-urlencoded", params: [{ name: "a", value: "1" }, { name: "b", value: "2", disabled: true }, { name: "", value: "" }] }),
        request("parts", { mimeType: "multipart/form-data", params: [{ name: "note", value: "hi" }, { name: "upload", type: "file", fileName: "/home/me/report.pdf" }, { name: "off", value: "x", disabled: true }] }),
        request("file", { mimeType: "application/octet-stream", fileName: "/home/me/pixel.png" }),
        request("graphql", { mimeType: "application/graphql", text: '{"query":"{ me { id } }","variables":{"a":1},"operationName":"Me"}' }),
      ]),
    );
    expect(requests.map((entry) => [entry.name, entry.body])).toEqual([
      ["none", { mode: "none" }],
      ["json", { mode: "raw", raw: { language: "json", text: '{"a":1}' } }],
      ["xml", { mode: "raw", raw: { language: "xml", text: "<a/>" } }],
      ["plain", { mode: "raw", raw: { language: "text", text: "hello" } }],
      ["other", { mode: "raw", raw: { language: "text", text: "{:a 1}" } }],
      ["untyped", { mode: "raw", raw: { language: "text", text: "hello" } }],
      ["form", { mode: "urlencoded", urlencoded: [{ key: "a", value: "1", enabled: true }, { key: "b", value: "2", enabled: false }] }],
      [
        "parts",
        {
          mode: "multipart",
          multipart: [
            { key: "note", enabled: true, kind: "text", value: "hi" },
            { key: "upload", enabled: true, kind: "file", fileId: "", fileName: "/home/me/report.pdf" },
            { key: "off", enabled: false, kind: "text", value: "x" },
          ],
        },
      ],
      ["file", { mode: "binary", binary: { fileId: "", fileName: "/home/me/pixel.png" } }],
      ["graphql", { mode: "raw", raw: { language: "json", text: '{"query":"{ me { id } }","variables":{"a":1},"operationName":"Me"}' } }],
    ]);
    expect(warnings).toEqual([
      { item: 'request "parts"', message: "A file of its body is named, not included: choose it again in the Body tab." },
      { item: 'request "file"', message: "A file of its body is named, not included: choose it again in the Body tab." },
    ]);
  });

  it("the query's rows are in the address with what the address had, a switched-off one is kept, and a path parameter is its value", () => {
    const { requests, warnings } = only(
      v5([
        {
          name: "R",
          method: "GET",
          url: "https://api.test/users/:id/posts/:post?sort=asc",
          parameters: [{ name: "page", value: "2" }, { name: "q", value: "a&b=c" }, { name: "debug", value: "1", disabled: true }, { name: "", value: "" }],
          pathParameters: [{ name: "id", value: "42" }, { name: "post", value: "" }],
        },
      ]),
    );
    expect(requests[0].url).toBe("https://api.test/users/42/posts/{{post}}?sort=asc&page=2&q=a%26b=c");
    expect(requests[0].params).toEqual([
      { key: "sort", value: "asc", enabled: true },
      { key: "page", value: "2", enabled: true },
      { key: "q", value: "a%26b=c", enabled: true },
      { key: "debug", value: "1", enabled: false },
    ]);
    expect(warnings.map((warning) => warning.message.slice(0, 40))).toEqual(["A query parameter that is switched off (", "The path variable :id is replaced by its", "The path variable :post has no value in "]);
  });

  it("headers: rows with the ones switched off; a folder's headers are left out and said", () => {
    const { requests, warnings } = only(
      v5([{ name: "F", headers: [{ name: "X-Team", value: "a" }, { name: "X-Off", value: "b", disabled: true }], children: [{ name: "R", method: "GET", url: "https://api.test/", headers: [{ name: "Accept", value: "text/plain" }, { name: "X-Off", value: "1", disabled: true }, { name: "", value: "" }] }] }]),
    );
    expect(requests[0].headers).toEqual([
      { key: "Accept", value: "text/plain", enabled: true },
      { key: "X-Off", value: "1", enabled: false },
    ]);
    expect(warnings).toEqual([{ item: 'folder "F"', message: "Its headers (X-Team) are left out: in Insomnia a folder's headers are sent with each request in it, and the app has no headers on a folder. Add them to its requests." }]);
  });

  it("scripts are left out and said, in both formats: they are written for Insomnia's own object", () => {
    const five = only(v5([{ name: "F", scripts: { preRequest: "insomnia.environment.set('a', 1)" }, children: [{ name: "R", method: "GET", url: "https://api.test/", scripts: { preRequest: "x", afterResponse: "insomnia.test('ok', () => {})" } }, { name: "Quiet", method: "GET", url: "https://api.test/", scripts: { preRequest: "  ", afterResponse: "" } }] }]));
    expect([five.collection.scripts, ...five.folders.map((folder) => folder.scripts), ...five.requests.map((request) => request.scripts)]).toEqual(Array.from({ length: 4 }, () => ({ pre: "", post: "" })));
    expect(five.warnings).toEqual([
      { item: 'request "R"', message: 'Its pre-request and after-response scripts are left out: an Insomnia script calls Insomnia\'s own "insomnia" object, which the app does not have.' },
      { item: 'folder "F"', message: 'Its pre-request script is left out: an Insomnia script calls Insomnia\'s own "insomnia" object, which the app does not have.' },
    ]);
    const four = only(v4([{ _id: "req_1", _type: "request", parentId: "wrk_1", name: "R", method: "GET", url: "https://api.test/", afterResponseScript: "insomnia.test('ok', () => {})" }]));
    expect(four.requests[0].scripts).toEqual({ pre: "", post: "" });
    expect(four.warnings).toEqual([{ item: 'request "R"', message: 'Its after-response script is left out: an Insomnia script calls Insomnia\'s own "insomnia" object, which the app does not have.' }]);
  });

  it("what is not an HTTP request, a folder or an environment is left out and said", () => {
    expect(
      messages(
        v5([{ name: "Stream", url: "wss://api.test/", meta: { id: "ws-req_1" } }, { name: "", url: "grpc://api.test", protoFileId: "pf_1" }, { name: "No address", method: "GET", url: "" }, { name: "Odd", method: "GE T", url: "https://api.test/" }], {
          cookieJar: { name: "Default Jar", cookies: [{ key: "sid", value: "1" }] },
          certificates: [{ path: "ca.pem" }],
          testSuites: [{ name: "Suite", tests: [] }],
          spec: { contents: { openapi: "3.0.0" } },
        }),
      ),
    ).toEqual([
      { item: 'collection "Shop"', message: "Its cookies, certificates, unit tests and API specification are left out: the app imports requests, folders and environments." },
      { item: 'request "Stream"', message: "It is not an HTTP request (gRPC, WebSocket or Socket.IO) and is left out." },
      { item: 'request "Request"', message: "It is not an HTTP request (gRPC, WebSocket or Socket.IO) and is left out." },
      { item: 'request "No address"', message: "It has no address and is left out." },
      { item: 'request "Odd"', message: "Its method (GE T) is not an HTTP method and it is left out." },
    ]);
    // An empty jar and an empty specification are what every file has: nothing is said.
    expect(messages(v5([], { cookieJar: { name: "Default Jar" }, spec: { contents: {} } }))).toEqual([]);

    expect(
      messages(
        v4([
          { _id: "greq_1", _type: "grpc_request", parentId: "wrk_1", name: "Call" },
          { _id: "jar_1", _type: "cookie_jar", parentId: "wrk_1", cookies: [] },
          { _id: "jar_2", _type: "cookie_jar", parentId: "wrk_1", cookies: [{ key: "sid" }] },
          { _id: "spc_1", _type: "api_spec", parentId: "wrk_1", contents: "" },
          { _id: "uts_1", _type: "unit_test_suite", parentId: "wrk_1" },
          { _id: "ut_1", _type: "unit_test", parentId: "uts_1" },
        ]),
      ),
    ).toEqual([
      { item: 'request "Call"', message: "It is not an HTTP request (gRPC, WebSocket or Socket.IO) and is left out." },
      { item: "file", message: "What the file holds that is not a request, a folder or an environment is left out (cookie_jar, unit_test_suite, unit_test)." },
    ]);
  });

  it("a file that is Insomnia's and not one the app reads is refused, and says which", () => {
    expect(() => read({ _type: "export", __export_format: 3, resources: [] })).toThrow("This is an Insomnia export of format 3, which Wayfarer does not read. Export from a current Insomnia (format 4 or 5) and import that.");
    expect(() => read({ _type: "export", resources: [] })).toThrow("This is an Insomnia export of a format with no number, which Wayfarer does not read.");
    expect(() => read({ type: "mock.insomnia.rest/5.0", name: "Mock", routes: [] })).toThrow("This Insomnia file (mock.insomnia.rest/5.0) holds no requests and no environments, so there is nothing to import.");
  });

  it("a key of the file that is a name every object has is read as the file's, or not at all", () => {
    const { collection, requests } = only(v5([{ name: "R", method: "GET", url: "https://api.test/", headers: [{ name: "constructor", value: "x" }], authentication: { type: "constructor" } }], { environments: { name: "Base", data: JSON.parse('{"__proto__":{"polluted":"yes"},"constructor":"c"}') } }));
    expect(requests[0].headers).toEqual([{ key: "constructor", value: "x", enabled: true }]);
    expect(collection.variables).toEqual([
      { key: "__proto__.polluted", value: "yes", enabled: true },
      { key: "constructor", value: "c", enabled: true },
    ]);
    expect(({} as Loose)["polluted"]).toBeUndefined();
  });

  it("any text, and any Insomnia-shaped value, is imported or refused with an ImportError, and nothing else is thrown", () => {
    const outcome = (text: string): boolean => {
      try {
        importText(text);
        return true;
      } catch (error) {
        if (error instanceof ImportError) return true;
        throw error;
      }
    };
    const shaped = fc.oneof(
      fc.jsonValue().map((value) => JSON.stringify({ type: "collection.insomnia.rest/5.0", collection: value, environments: value })),
      fc.jsonValue().map((value) => JSON.stringify({ type: "collection.insomnia.rest/5.0", collection: [{ name: value, method: "GET", url: value, body: value, authentication: value, parameters: value, headers: value, pathParameters: value, scripts: value }, { children: value, environment: value, headers: value }] })),
      fc.jsonValue().map((value) => JSON.stringify({ _type: "export", __export_format: 4, resources: value })),
      fc.array(fc.record({ _id: fc.constantFrom("a", "b", "c", ""), parentId: fc.constantFrom("a", "b", "c", "", null), _type: fc.constantFrom("workspace", "request", "request_group", "environment"), url: fc.string(), method: fc.constantFrom("GET", "x y"), data: fc.jsonValue() })).map((resources) => JSON.stringify({ _type: "export", __export_format: 4, resources })),
      fc.string(),
      fc.string({ unit: fc.constantFrom("{", "}", "%", " ", "_", ".", "[", "]", "'", "a", ":", "-", "\n", "&", "*") }),
    );
    fc.assert(fc.property(shaped, outcome), { numRuns: 500 });
  });
});

describe("a YAML file (P4.4)", () => {
  it("is read when the text is not JSON: an Insomnia format 5 file imports", () => {
    const imported = importText(stringify(v5([{ name: "Ping", method: "GET", url: "https://api.test/ping", meta: { id: "req_1" } }])));
    expect(imported.report).toMatchObject({ format: "insomnia", counts: { collections: 1, requests: 1 } });
    // A byte order mark in front is not part of the text.
    expect(importText(`\uFEFF${stringify(v5([]))}`).report.format).toBe("insomnia");
  });

  it("a file that uses aliases to grow as it is read is refused with a message, in no time", () => {
    // A billion laughs: nine levels, each nine of the one before. Written out it is 9^9 strings.
    const bomb = ["a: &a [lol, lol, lol, lol, lol, lol, lol, lol, lol]", ...Array.from("bcdefghi", (name, index) => `${name}: &${name} [${Array.from({ length: 9 }, () => `*${"abcdefghi"[index]}`).join(", ")}]`)].join("\n");
    const started = Date.now();
    expect(() => importText(`type: collection.insomnia.rest/5.0\n${bomb}\ncollection: *i\n`)).toThrow(YAML_ALIASES);
    expect(() => parseYaml(bomb)).toThrow(ImportError);
    // Not a measure of speed: a file that was expanded would not end within the test's own time limit, let alone this.
    expect(Date.now() - started).toBeLessThan(4000);
    expect(YAML_ALIASES).toBe("The YAML file repeats parts of itself through aliases 100 times or more and is refused: a file written that way grows without end as it is read.");
  });

  it("aliases a person would write are read", () => {
    const text = (aliases: number): string => `defaults: &defaults\n  a: 1\n${Array.from({ length: aliases }, (_unused, index) => `k${index}: *defaults`).join("\n")}\n`;
    expect(Object.keys(parseYaml(text(MAX_YAML_ALIASES - 1)) as object)).toHaveLength(MAX_YAML_ALIASES);
    expect(() => parseYaml(text(MAX_YAML_ALIASES))).toThrow(YAML_ALIASES);
  });

  it("text that is neither, and a file that is one value, are refused", () => {
    for (const text of ["{not json", "just words", "", "a: [1, 2", "- !!js/function 'function () {}'\n- &a [*a"]) {
      expect(() => importText(text), text).toThrow(ImportError);
    }
    expect(() => importText("{not json")).toThrow(NOT_READABLE);
    expect(() => importText("just words")).toThrow(NOT_READABLE);
    // YAML that holds a map which is no format the app knows gets the message that names the formats.
    expect(() => importText("a: 1")).toThrow("This is not a file Wayfarer can import.");
  });

  it("text over 1 MB that is not JSON is not given to the YAML reader, which keeps every token of a file", () => {
    // Each of these, at a megabyte, took the reader a gigabyte; at the 10 MB every import may be, they ended the process.
    for (const dense of ["[", '"', "- ", "&a "]) {
      expect(() => importText(dense.repeat(Math.ceil((MAX_YAML_CHARS + 1) / dense.length)))).toThrow(YAML_TOO_LARGE);
    }
    expect(YAML_TOO_LARGE).toBe("The file is not JSON, and at more than 1 MB it is too large to be read as YAML: a YAML file takes far more memory to read than a JSON file of its size. If it is YAML, convert it to JSON and import that.");
    // At the limit it is read. JSON has the limit of every import, not this one.
    expect(Object.keys(parseYaml(`a: 1\n${"# a comment\n".repeat(MAX_YAML_CHARS / 12)}`.slice(0, MAX_YAML_CHARS)) as object)).toEqual(["a"]);
    expect(() => importText(JSON.stringify({ type: "collection.insomnia.rest/5.0", collection: [], pad: "x".repeat(MAX_YAML_CHARS * 2) }))).not.toThrow();
  });

  it("the reader's time grows with the file, not with its square: the keys of one map, and a file that is all errors", () => {
    // With the reader's own settings, 60,000 keys are compared pair by pair, and each of 200,000 errors is given the lines around it.
    const started = Date.now();
    expect(Object.keys(parseYaml(Array.from({ length: 60_000 }, (_unused, index) => `k${index}: 1`).join("\n")) as object)).toHaveLength(60_000);
    expect(() => parseYaml("&a ".repeat(200_000))).toThrow(NOT_READABLE);
    expect(parseYaml("a: 1\na: 2")).toEqual({ a: 2 });
    // Not a measure of speed: with the reader's own settings these took 15 and 16 seconds on a laptop, and under one second as set here.
    expect(Date.now() - started).toBeLessThan(10_000);
    // The test's own time limit is above that ceiling, so the ceiling decides: on a CI runner this takes 5 seconds, which is where Vitest's default ends a test (#259).
  }, 30_000);

  it("a tag makes no object, a merge key merges nothing, and a key named like a prototype's is a key", () => {
    expect(parseYaml("when: 2026-10-11\nn: 012\nyes: yes")).toEqual({ when: "2026-10-11", n: 12, yes: "yes" });
    expect(parseYaml("base: &b {a: 1}\nown:\n  <<: *b\n  c: 2")).toEqual({ base: { a: 1 }, own: { "<<": { a: 1 }, c: 2 } });
    const parsed = parseYaml("__proto__:\n  polluted: yes\n") as Loose;
    expect(Object.hasOwn(parsed, "__proto__")).toBe(true);
    expect(({} as Loose)["polluted"]).toBeUndefined();
  });
});
