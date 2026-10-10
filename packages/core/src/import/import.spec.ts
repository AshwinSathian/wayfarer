import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CASES } from "../../test/pm-compat/cases";
import { inCollection, inFolder, requestContent } from "../../test/request-fixtures";
import { MAX_IMPORT_BYTES } from "../safe-json";
import { ImportError, curlToRequest, detectFormat, importText } from "./import";
import { NOT_SCANNED, SCRIPT_SCAN, unsupportedApis } from "./script-scan";

const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1, version: 1 as const });
const collectionFile = (scripts = { pre: "", post: "" }) => ({
  $id: "wayfarer/collection/3",
  meta: meta("export-1"),
  collection: { id: "col-1", meta: meta("col-1"), name: "Billing", order: 1, variables: [], ...inCollection, scripts: { pre: "", post: "pm.visualizer.set('<p></p>', {})" } },
  folders: [{ id: "f-1", meta: meta("f-1"), collectionId: "col-1", name: "Auth", order: 1, ...inFolder }],
  requests: [{ id: "r-1", meta: meta("r-1"), collectionId: "col-1", folderId: "f-1", name: "Login", order: 1, ...requestContent({ method: "POST", url: "https://api.test/login", scripts }) }],
});
const environmentsFile = { $id: "wayfarer/environments/2", environments: [{ id: "e-1", meta: meta("e-1"), name: "Dev", order: 1, vars: [] }] };

/** What `importText` throws for `text`. */
function refused(text: string): ImportError {
  try {
    importText(text);
  } catch (error) {
    if (error instanceof ImportError) return error;
    throw error;
  }
  throw new Error("The text was imported.");
}

describe("importText: one road from a file's text to the app's model", () => {
  it("a Wayfarer collection file gives its collection, a plan and a report with its counts", () => {
    const imported = importText(JSON.stringify(collectionFile()));

    expect(detectFormat(collectionFile())).toBe("wayfarer-collection");
    expect(imported.report).toMatchObject({ format: "wayfarer-collection", formatName: "Wayfarer collection", counts: { collections: 1, folders: 1, requests: 1, environments: 0 } });
    expect(imported.collections.map((entry) => entry.payload.collection.name)).toEqual(["Billing"]);
    expect(imported.collections[0].plan.map((entry) => [entry.type, entry.name, entry.action])).toEqual([
      ["collection", "Billing", "overwrite"],
      ["folder", "Auth", "overwrite"],
      ["request", "Login", "overwrite"],
    ]);
    expect(imported.environments).toEqual([]);
  });

  it("as a copy, every id is a new one and the plan creates", () => {
    const imported = importText(JSON.stringify(collectionFile()), { duplicateAsNew: true });
    const { payload, plan } = imported.collections[0];

    expect(plan.every((entry) => entry.action === "create")).toBe(true);
    expect([payload.collection.meta.id, payload.folders[0].meta.id, payload.requests[0].meta.id]).not.toContain("col-1");
    expect(payload.requests[0].folderId).toBe(payload.folders[0].meta.id);
  });

  it("an environments file gives its environments", () => {
    const imported = importText(JSON.stringify(environmentsFile));

    expect(imported.report).toMatchObject({ format: "wayfarer-environments", counts: { collections: 0, folders: 0, requests: 0, environments: 1 }, warnings: [] });
    expect(imported.environments.map((environment) => environment.name)).toEqual(["Dev"]);
  });

  it("a file of no known format is refused with a message that names the formats", () => {
    for (const text of ['{"info":{"schema":"https://example.test/unknown"}}', "[]", "42", '"text"', "null"]) {
      expect(refused(text).message).toBe(
        'This is not a file Wayfarer can import. It reads a Wayfarer collection ("$id": "wayfarer/collection/3"), a Wayfarer environments file ("$id": "wayfarer/environments/2"), a HAR 1.2 file, and a cURL command.'
      );
    }
    expect(refused("{not json").message).toBe("The file is not valid JSON, so it is not a file Wayfarer can import.");
    expect(refused(" ".repeat(MAX_IMPORT_BYTES + 1)).message).toBe("The file is larger than 10 MB.");
    expect(refused('{"$id":"wayfarer/workspace/3","stores":{}}').message).toBe("This is a workspace backup, which replaces everything. Restore it in Settings.");
  });

  it("a file of a known format that is not what the app writes is refused with each problem and its path", () => {
    const broken = { ...collectionFile(), requests: [{ ...collectionFile().requests[0], method: "GET; rm -rf ~" }] };
    const error = refused(JSON.stringify(broken));

    expect(error.message).toBe("The file is not a valid Wayfarer collection.");
    expect(error.issues).toEqual([{ path: "requests[0].method", message: "Value must be an HTTP method: one word of at most 32 characters, in upper case." }]);
    // A format 2 file: the message says which format is read.
    expect(refused(JSON.stringify({ ...collectionFile(), $id: "wayfarer/collection/2" })).issues).toEqual([
      { path: "$id", message: 'Not a Wayfarer collection file: "$id" must be "wayfarer/collection/3".' },
    ]);
    expect(refused('{"$id":"wayfarer/environments/2","environments":5}').issues).toEqual([{ path: "", message: "Expected an array of environments." }]);
  });

  it("the report names each script that uses something the app does not have, by where it is", () => {
    const imported = importText(JSON.stringify(collectionFile({ pre: "const jar = pm.cookies.jar(); require('xml2js');", post: "pm.test('ok', () => pm.response.to.have.status(200));" })));

    expect(imported.report.warnings).toEqual([
      { item: 'collection "Billing"', message: "Its post-response script uses pm.visualizer.set, which Wayfarer does not have. The script will end in an error there." },
      { item: 'request "Login"', message: "Its pre-request script uses pm.cookies.jar and require('xml2js'), which Wayfarer does not have. The script will end in an error there." },
    ]);
  });

  it("a cURL command is one request in a collection of its own, under new ids, with what was left out in the report", () => {
    const imported = importText(`curl 'https://api.test/users?page=2' -k -H 'Accept: application/json' -u ada:secret`);

    expect(imported.report).toEqual({
      format: "curl",
      formatName: "cURL command",
      counts: { collections: 1, folders: 0, requests: 1, environments: 0 },
      warnings: [{ item: 'request "GET api.test/users"', message: "-k (do not check the server's certificate) was left out: a browser always checks it, and the Local Bridge cannot skip the check yet." }],
    });
    const { payload, plan } = imported.collections[0];
    expect(payload.collection).toMatchObject({ name: "Imported from cURL", auth: { type: "none" }, scripts: { pre: "", post: "" } });
    expect(payload.requests).toMatchObject([{ name: "GET api.test/users", method: "GET", url: "https://api.test/users?page=2", auth: { type: "basic", username: "ada", password: "secret" }, collectionId: payload.collection.meta.id }]);
    expect(plan.map((entry) => entry.action)).toEqual(["create", "create"]);
    // Twice the same command: two collections, not one over the other.
    expect(importText("curl https://api.test/").collections[0].payload.collection.meta.id).not.toBe(importText("curl https://api.test/").collections[0].payload.collection.meta.id);
  });

  it("a HAR file is one request per entry, in a collection of its own", () => {
    const har = { log: { version: "1.2", entries: [{ request: { method: "GET", url: "https://a.test/one", headers: [] } }, { request: { method: "POST", url: "https://a.test/two", headers: [], postData: { mimeType: "image/png", text: "AAAA", encoding: "base64" } } }] } };
    const imported = importText(JSON.stringify(har));

    expect(detectFormat(har)).toBe("har");
    expect(imported.report).toMatchObject({ format: "har", formatName: "HAR 1.2", counts: { collections: 1, folders: 0, requests: 2, environments: 0 } });
    expect(imported.report.warnings).toEqual([{ item: 'request "POST /two"', message: "Its body is binary (base64 in the file) and was left out." }]);
    expect(imported.collections[0].payload.requests.map((request) => [request.name, request.order])).toEqual([["GET /one", 0], ["POST /two", 1]]);
  });

  it("a command or a HAR that makes a request the app cannot hold is refused, with the field", () => {
    expect(refused(JSON.stringify({ log: { entries: [{ request: { method: "GET IT", url: "https://a.test/" } }] } })).issues).toEqual([
      { path: "requests[0].method", message: "Value must be an HTTP method: one word of at most 32 characters, in upper case." },
    ]);
    expect(refused("curl --url ''").message).toBe("The cURL command does not make a request the app can hold.");
    // A pasted command has the cap a file has.
    expect(() => curlToRequest(`curl https://a.test/ -d '${"x".repeat(MAX_IMPORT_BYTES)}'`)).toThrow(new ImportError("The file is larger than 10 MB."));
  });

  it("throws nothing but ImportError, whatever the text", () => {
    const outcome = (text: string): "imported" | "refused" => {
      try {
        importText(text);
        return "imported";
      } catch (error) {
        if (error instanceof ImportError) return "refused";
        throw error;
      }
    };
    fc.assert(fc.property(fc.oneof(fc.string(), fc.json(), fc.json().map((json) => `{"$id":"wayfarer/collection/3","collection":${json},"folders":${json},"requests":${json},"meta":${json}}`)), (text) => outcome(text) === "refused"));
    fc.assert(fc.property(fc.json(), (json) => outcome(`{"$id":"wayfarer/environments/2","environments":${json}}`) !== undefined));
  });
});

describe("the script scan and the compatibility matrix", () => {
  it("covers every row the matrix marks unsupported, or says why a row is not looked for", () => {
    const rows = CASES.filter((row) => row.status === "unsupported").map((row) => row.api);
    expect([...SCRIPT_SCAN.map((entry) => entry.api), ...Object.keys(NOT_SCANNED)].sort()).toEqual([...rows].sort());
  });

  it("finds what a script names, once each, and nothing in a script that uses only what is there", () => {
    expect(unsupportedApis("pm.cookies.get('a'); pm.cookies.get('b'); setInterval(() => {}, 5); const fs = require('path'); tv4.validate({}, {});")).toEqual([
      "pm.cookies.get",
      "tv4",
      "setInterval",
      "require('path')",
    ]);
    expect(unsupportedApis("pm.environment.set('a', '1'); const _ = require('lodash'); pm.test('t', () => pm.expect(_.isString('')).to.equal(true)); setTimeout(() => {}, 1);")).toEqual([]);
    // A name inside a longer one is another name.
    expect(unsupportedApis("pm.cookies.jarred; mypm.vault.get; required('ajv'); clearTimeouts()")).toEqual([]);
  });
});
