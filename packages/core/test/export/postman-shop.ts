import type { CollectionExport, Folder, Meta, RequestDoc } from "../../src/model/collection";
import { emptyRequest, type RequestContent } from "../../src/model/request";

/**
 * A collection that uses every body mode and all three levels of auth and
 * of scripts (P4.6 b). Its tests assert what the echo server received, so
 * the same results from two runners mean the same requests were sent.
 * Files: `pixel.png` of `FILES`. Environment: `base`, the echo server.
 */
const meta = (id: string): Meta => ({ id, createdAt: 0, updatedAt: 0, version: 1 });

const ECHO = `const echo = pm.response.json(); const header = (name) => (echo.headers.find(([key]) => key === name) || [])[1];`;
const add = (letter: string) => `pm.collectionVariables.set("order", pm.collectionVariables.get("order") + "${letter}");`;
const row = (key: string, value: string, enabled = true) => ({ key, value, enabled });

const folder = (id: string, name: string, order: number, rest: Partial<Folder> = {}): Folder => ({
  id,
  meta: meta(id),
  collectionId: "shop",
  name,
  order,
  variables: [],
  auth: { type: "inherit" },
  scripts: { pre: "", post: "" },
  ...rest,
});

const request = (id: string, name: string, order: number, folderId: string | undefined, content: Partial<RequestContent>): RequestDoc => ({
  id,
  meta: meta(id),
  collectionId: "shop",
  ...(folderId && { folderId }),
  name,
  order,
  ...emptyRequest(),
  auth: { type: "inherit" },
  headers: [row("X-Order", "{{order}}")],
  ...content,
});

export const SHOP: CollectionExport = {
  $id: "wayfarer/collection/3",
  meta: meta("shop"),
  collection: {
    id: "shop",
    meta: meta("shop"),
    name: "Shop",
    description: "Every body mode, and auth and scripts at three levels.",
    order: 0,
    variables: [row("greeting", "hello"), row("token", "col-token"), row("order", ""), row("unused", "off", false)],
    auth: { type: "bearer", token: "{{token}}" },
    scripts: {
      pre: `pm.collectionVariables.set("order", "c");`,
      post: `pm.test("collection: the server answered 200", () => pm.response.to.have.status(200));`,
    },
  },
  folders: [
    folder("admin", "Admin", 0, {
      auth: { type: "basic", username: "admin", password: "p@ss" },
      scripts: { pre: add("f"), post: `${ECHO}\npm.test("folder Admin: its basic auth arrived", () => pm.expect(header("authorization")).to.eql("Basic YWRtaW46cEBzcw=="));` },
    }),
    folder("deep", "Deep", 0, { parentFolderId: "admin", scripts: { pre: add("d"), post: "" } }),
    folder("bodies", "Bodies", 1),
  ],
  requests: [
    request("form", "Form", 0, "deep", {
      method: "POST",
      url: "{{base}}/echo",
      body: { mode: "urlencoded", urlencoded: [row("q", "a b&c"), row("greeting", "{{greeting}}"), row("off", "1", false)] },
      scripts: {
        pre: add("r"),
        post: `${ECHO}
pm.test("Form: the scripts ran from the collection inward", () => pm.expect(header("x-order")).to.eql("cfdr"));
pm.test("Form: the fields that are switched on arrived", () => pm.expect(echo.body.replace(/\\+/g, "%20")).to.eql("q=a%20b%26c&greeting=hello"));
pm.test("Form: it is a form", () => pm.expect(header("content-type")).to.include("application/x-www-form-urlencoded"));`,
      },
    }),
    request("json", "JSON", 1, "admin", {
      method: "POST",
      url: "{{base}}/echo",
      body: { mode: "raw", raw: { language: "json", text: '{"name":"{{greeting}}"}' } },
      scripts: {
        pre: "",
        post: `${ECHO}
pm.test("JSON: a request without a script of its own still ran the others", () => pm.expect(header("x-order")).to.eql("cf"));
pm.test("JSON: the body arrived with its variable replaced", () => pm.expect(echo.body).to.eql('{"name":"hello"}'));
pm.test("JSON: its language is its type", () => pm.expect(header("content-type")).to.include("application/json"));`,
      },
    }),
    request("multipart", "Multipart", 0, "bodies", {
      method: "POST",
      url: "{{base}}/echo",
      auth: { type: "apikey", key: "X-Key", value: "k-1", in: "header" },
      body: {
        mode: "multipart",
        multipart: [
          { key: "note", kind: "text", value: "with a file", enabled: true },
          { key: "upload", kind: "file", fileId: "file-1", fileName: "pixel.png", enabled: true },
          { key: "left", kind: "text", value: "out", enabled: false },
        ],
      },
      scripts: {
        pre: "",
        post: `${ECHO}
pm.test("Multipart: its own key replaced the collection's bearer", () => { pm.expect(header("x-key")).to.eql("k-1"); pm.expect(header("authorization")).to.eql(undefined); });
pm.test("Multipart: it is a multipart form", () => pm.expect(header("content-type")).to.match(/^multipart\\/form-data; boundary=/));
pm.test("Multipart: the text part and the file arrived, the part switched off did not", () => {
  pm.expect(echo.body).to.include('name="note"');
  pm.expect(echo.body).to.include("with a file");
  pm.expect(echo.body).to.include('filename="pixel.png"');
  pm.expect(echo.body).to.not.include('name="left"');
});`,
      },
    }),
    request("file", "File", 1, "bodies", {
      method: "PUT",
      url: "{{base}}/echo",
      auth: { type: "none" },
      body: { mode: "binary", binary: { fileId: "file-1", fileName: "pixel.png", contentType: "image/png" } },
      scripts: {
        pre: "",
        post: `${ECHO}
pm.test("File: no auth was sent", () => pm.expect(header("authorization")).to.eql(undefined));
pm.test("File: the file's bytes arrived under its type", () => {
  pm.expect(echo.body.length).to.eql(64);
  pm.expect(echo.body.charCodeAt(63)).to.eql(63);
  pm.expect(header("content-type")).to.eql("image/png");
});`,
      },
    }),
    request("xml", "XML", 2, "bodies", {
      method: "PUT",
      url: "{{base}}/echo?kind=xml",
      params: [row("kind", "xml")],
      auth: { type: "apikey", key: "api_key", value: "k-2", in: "query" },
      body: { mode: "raw", raw: { language: "xml", text: "<a>{{greeting}}</a>" } },
      scripts: {
        pre: "",
        post: `${ECHO}
pm.test("XML: the key went into the query", () => pm.expect(echo.url).to.eql("/echo?kind=xml&api_key=k-2"));
pm.test("XML: the body arrived as XML", () => { pm.expect(echo.body).to.eql("<a>hello</a>"); pm.expect(header("content-type")).to.include("application/xml"); });`,
      },
    }),
    request("inherit", "Inherit bearer", 0, undefined, {
      url: "{{base}}/echo?a=1&b=two%20words",
      params: [row("a", "1"), row("c", "3", false), row("b", "two words")],
      headers: [row("X-Order", "{{order}}"), row("X-Off", "1", false)],
      scripts: {
        pre: add("r"),
        post: `${ECHO}
pm.test("Inherit bearer: the collection's token arrived", () => pm.expect(header("authorization")).to.eql("Bearer col-token"));
pm.test("Inherit bearer: the query arrived as typed, without the row switched off", () => pm.expect(echo.url).to.eql("/echo?a=1&b=two%20words"));
pm.test("Inherit bearer: the header switched off was not sent", () => pm.expect(header("x-off")).to.eql(undefined));
pm.test("Inherit bearer: only the collection's script and its own ran", () => pm.expect(header("x-order")).to.eql("cr"));
pm.test("Inherit bearer: fails on purpose, the answer is not 404", () => pm.response.to.have.status(404));`,
      },
    }),
  ],
};
