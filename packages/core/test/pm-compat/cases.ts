/**
 * The compatibility matrix: one row per part of Postman's script API, each
 * with a script that proves what the row says. The same rows are run in
 * Node (`pm-compat.test.ts`) and in the app's worker
 * (`src/app/shared/scripts/pm-compat.spec.ts`), and
 * `docs/postman-compatibility.md` is written from them.
 *
 * A row's script is the body of an async function run as one `pm.test`. It
 * has `same(actual, expected)` and `refused(fn)` (see `harness.ts`), and
 * the context of `FIXTURE`.
 */
export interface CompatCase {
  api: string;
  /** supported: as in Postman. partial: `note` says what differs. unsupported: it throws, and `note` names the error when it is not WayfarerUnsupportedError. */
  status: "supported" | "partial" | "unsupported";
  note?: string;
  /** Which script it runs as. A post-response script ("test") unless said. */
  event?: "prerequest";
  script: string;
  /** What the run must give back besides a passed test. */
  result?: Record<string, unknown>;
}

const TEXT = "Values are text: a number or an object that is set is read back as a string.";
const ALL_SCOPES = "Replaces from every scope, nearest first, as `pm.variables.replaceIn` does.";
const RUN_ONLY = "Recorded. It has an effect in a collection run only, and there is none yet.";

/** get, set, unset, has, toObject, replaceIn and clear of one stored scope. */
function scope(name: string, key: "environment" | "collection" | "global", has: [string, string], all: Record<string, string>): CompatCase[] {
  const [known, value] = has;
  return [
    { api: `${name}.get`, status: "supported", script: `same(${name}.get("${known}"), ${JSON.stringify(value)}); same(${name}.get("missing"), undefined); same(${name}.get("constructor"), undefined);` },
    { api: `${name}.set`, status: "partial", note: TEXT, script: `${name}.set("fresh", 5); same(${name}.get("fresh"), "5"); ${name}.set("__proto__", "own"); same(${name}.get("__proto__"), "own");`, result: { changes: { [key]: [{ key: "fresh", value: "5" }, { key: "__proto__", value: "own" }] } } },
    { api: `${name}.unset`, status: "supported", script: `${name}.unset("${known}"); same(${name}.has("${known}"), false);`, result: { changes: { [key]: [{ key: known, value: null }] } } },
    { api: `${name}.has`, status: "supported", script: `same(${name}.has("${known}"), true); same(${name}.has("missing"), false); same(${name}.has("toString"), false);` },
    { api: `${name}.toObject`, status: "supported", script: `same(${name}.toObject(), ${JSON.stringify(all)});` },
    { api: `${name}.replaceIn`, status: "partial", note: ALL_SCOPES, script: `same(${name}.replaceIn("{{${known}}} and {{missing}}"), ${JSON.stringify(`${value.replace("{{host}}", "api.test")} and {{missing}}`)});` },
    { api: `${name}.clear`, status: "supported", script: `${name}.clear(); same(${name}.toObject(), {});`, result: { changes: { [key]: Object.keys(all).map((name) => ({ key: name, value: null })) } } },
  ];
}

const unsupported = (api: string, call: string): CompatCase => ({ api, status: "unsupported", script: `refused(() => ${call});` });

export const CASES: CompatCase[] = [
  { api: "pm.environment.name", status: "supported", script: `same(pm.environment.name, "Staging");` },
  ...scope("pm.environment", "environment", ["token", "abc123"], { host: "api.test", token: "abc123", nested: "{{host}}/v1" }),
  ...scope("pm.globals", "global", ["g", "1"], { shared: "from globals", g: "1" }),
  ...scope("pm.collectionVariables", "collection", ["base", "https://{{host}}"], { base: "https://{{host}}", shared: "from collection" }),

  { api: "pm.variables.get", status: "supported", script: `same(pm.variables.get("shared"), "from collection"); same(pm.variables.get("g"), "1"); same(pm.variables.get("missing"), undefined);` },
  { api: "pm.variables.set", status: "partial", note: TEXT, script: `pm.variables.set("shared", "local"); same(pm.variables.get("shared"), "local"); same(pm.collectionVariables.get("shared"), "from collection");`, result: { changes: { environment: [], collection: [], global: [] } } },
  { api: "pm.variables.has", status: "supported", script: `same(pm.variables.has("token"), true); same(pm.variables.has("missing"), false);` },
  { api: "pm.variables.toObject", status: "supported", script: `same(pm.variables.toObject(), { shared: "from collection", g: "1", base: "https://{{host}}", host: "api.test", token: "abc123", nested: "{{host}}/v1" });` },
  { api: "pm.variables.replaceIn", status: "supported", script: `same(pm.variables.replaceIn("{{base}}/{{nested}}?{{missing}}"), "https://api.test/api.test/v1?{{missing}}"); same(/^[0-9a-f-]{36}$/.test(pm.variables.replaceIn("{{$guid}}")), true); same(pm.variables.replaceIn("{{$secret.abc}}"), "{{$secret.abc}}");` },

  { api: "pm.iterationData.get", status: "partial", note: "Empty: there is no collection run with a data file yet.", script: `same(pm.iterationData.get("token"), undefined);` },
  { api: "pm.iterationData.has", status: "partial", note: "Empty: there is no collection run with a data file yet.", script: `same(pm.iterationData.has("token"), false);` },
  { api: "pm.iterationData.toObject", status: "partial", note: "Empty: there is no collection run with a data file yet.", script: `same(pm.iterationData.toObject(), {});` },

  { api: "pm.request.url.toString", status: "supported", event: "prerequest", script: `same(pm.request.url.toString(), "https://{{host}}/items?page=2#top"); same(String(pm.request.url), "https://{{host}}/items?page=2#top");` },
  { api: "pm.request.url.getHost / getPath / getQueryString", status: "partial", note: "Read from the address as written, `{{variables}}` not replaced. The parts as lists (`protocol`, `host`, `path`, `query`) are not there.", event: "prerequest", script: `same([pm.request.url.getHost(), pm.request.url.getPath(), pm.request.url.getQueryString()], ["{{host}}", "/items", "page=2"]);` },
  { api: "pm.request.url (assign)", status: "supported", event: "prerequest", script: `pm.request.url = "https://other.test/v2"; same(pm.request.url.getHost(), "other.test");`, result: { request: { url: "https://other.test/v2" } } },
  { api: "pm.request.method", status: "supported", event: "prerequest", script: `same(pm.request.method, "POST"); pm.request.method = "put"; same(pm.request.method, "PUT");`, result: { request: { method: "PUT" } } },
  { api: "pm.request.headers.get", status: "supported", event: "prerequest", script: `same(pm.request.headers.get("content-type"), "application/json"); same(pm.request.headers.get("missing"), undefined);` },
  { api: "pm.request.headers.has", status: "supported", event: "prerequest", script: `same([pm.request.headers.has("X-TRACE"), pm.request.headers.has("missing")], [true, false]);` },
  { api: "pm.request.headers.add", status: "supported", event: "prerequest", script: `pm.request.headers.add({ key: "X-Signed", value: "abc" }); same(pm.request.headers.get("x-signed"), "abc");`, result: { request: { headers: [["Content-Type", "application/json"], ["X-Trace", "t-1"], ["X-Signed", "abc"]] } } },
  { api: "pm.request.headers.upsert", status: "supported", event: "prerequest", script: `pm.request.headers.upsert({ key: "x-trace", value: "t-2" }); pm.request.headers.upsert({ key: "X-New", value: 1 });`, result: { request: { headers: [["Content-Type", "application/json"], ["x-trace", "t-2"], ["X-New", "1"]] } } },
  { api: "pm.request.headers.remove", status: "supported", event: "prerequest", script: `pm.request.headers.remove("X-TRACE"); same(pm.request.headers.has("X-Trace"), false);`, result: { request: { headers: [["Content-Type", "application/json"]] } } },
  { api: "pm.request.headers.toObject / each", status: "supported", event: "prerequest", script: `same(pm.request.headers.toObject(), { "Content-Type": "application/json", "X-Trace": "t-1" }); const seen = []; pm.request.headers.each((header) => seen.push(header.key + "=" + header.value)); same(seen, ["Content-Type=application/json", "X-Trace=t-1"]);` },
  { api: "pm.request.body (raw)", status: "supported", event: "prerequest", script: `same([pm.request.body.mode, pm.request.body.raw, pm.request.body.toString()], ["raw", '{"name":"{{token}}"}', '{"name":"{{token}}"}']); pm.request.body.raw = "changed";`, result: { request: { body: { mode: "raw", raw: "changed" } } } },
  { api: "pm.request.body.update", status: "partial", note: "Text and `urlencoded` only. A multipart form and a file can be seen (`mode`) and not changed.", event: "prerequest", script: `pm.request.body.update({ mode: "urlencoded", urlencoded: [{ key: "a", value: 1 }] }); same(pm.request.body.urlencoded.get("a"), "1"); refused(() => pm.request.body.update({ mode: "formdata", formdata: [] }));`, result: { request: { body: { mode: "urlencoded", urlencoded: [["a", "1"]] } } } },
  { api: "pm.request (post-response)", status: "supported", script: `same([pm.request.method, pm.request.headers.get("X-Trace"), pm.request.name, pm.request.id], ["POST", "t-1", "Create item", "req-1"]);` },

  { api: "pm.response.code", status: "supported", script: `same(pm.response.code, 201);` },
  { api: "pm.response.status", status: "supported", script: `same(pm.response.status, "Created");` },
  { api: "pm.response.headers", status: "supported", script: `same([pm.response.headers.get("content-type"), pm.response.headers.get("X-Id"), pm.response.headers.get("missing"), pm.response.headers.has("x-id")], ["application/json", "7", undefined, true]); same(pm.response.headers.toObject(), { "Content-Type": "application/json", "X-Id": "7" });` },
  { api: "pm.response.json", status: "supported", script: `same(pm.response.json(), { id: 7, tags: ["a", "b"] });` },
  { api: "pm.response.text", status: "supported", script: `same(pm.response.text(), '{"id":7,"tags":["a","b"]}');` },
  { api: "pm.response.responseTime", status: "supported", script: `same(pm.response.responseTime, 12);` },
  { api: "pm.response.responseSize", status: "supported", script: `same(pm.response.responseSize, 25);` },
  { api: "pm.response.to.have.status", status: "supported", script: `pm.response.to.have.status(201); pm.response.to.have.status("Created"); pm.response.to.not.have.status(200); let message = ""; try { pm.response.to.have.status(200); } catch (error) { message = error.name + ": " + error.message; } same(message, "AssertionError: expected response to have status code 200 but got 201");` },
  { api: "pm.response.to.have.header", status: "supported", script: `pm.response.to.have.header("x-id"); pm.response.to.have.header("X-Id", "7"); pm.response.to.not.have.header("X-Missing"); let failed = false; try { pm.response.to.have.header("X-Id", "8"); } catch (error) { failed = true; } same(failed, true);` },
  { api: "pm.response.to.have.body", status: "supported", script: `pm.response.to.have.body(); pm.response.to.have.body('{"id":7,"tags":["a","b"]}'); pm.response.to.have.body(/"tags"/); pm.response.to.not.have.body("other");` },
  { api: "pm.response.to.have.jsonBody", status: "partial", note: "With no argument or with a value to compare the whole body with. `jsonBody(path, value)` throws WayfarerUnsupportedError.", script: `pm.response.to.have.jsonBody(); pm.response.to.have.jsonBody({ tags: ["a", "b"], id: 7 }); pm.response.to.not.have.jsonBody({ id: 8 }); refused(() => pm.response.to.have.jsonBody("id", 7));` },
  { api: "pm.response.to.be.ok", status: "supported", script: `pm.response.to.not.be.ok; let message = ""; try { pm.response.to.be.ok; } catch (error) { message = error.message; } same(message, "expected response to have status code 200 but got 201");` },
  { api: "pm.response.to.be.success", status: "supported", script: `pm.response.to.be.success;` },
  { api: "pm.response.to.be.error", status: "supported", script: `pm.response.to.not.be.error; let failed = false; try { pm.response.to.be.error; } catch (error) { failed = true; } same(failed, true);` },
  { api: "pm.response.to.be.clientError", status: "supported", script: `pm.response.to.not.be.clientError;` },
  { api: "pm.response.to.be.serverError", status: "supported", script: `pm.response.to.not.be.serverError;` },

  { api: "pm.test", status: "supported", script: `pm.test("inner passes", () => {}); pm.test("inner fails", () => { throw new Error("as it should"); });`, result: { testResults: [{ label: "inner passes", passed: true }, { label: "inner fails", passed: false, error: "as it should" }, { passed: true }] } },
  { api: "pm.test (async)", status: "supported", script: `pm.test("waits", async () => { await new Promise((resolve) => setTimeout(resolve, 5)); throw new Error("late"); });`, result: { testResults: [{ passed: true }, { label: "waits", passed: false, error: "late" }] } },
  { api: "pm.test.skip", status: "partial", note: "The test is not run and is listed as passed, with \"(skipped)\" after its name.", script: `pm.test.skip("not now", () => { throw new Error("ran"); });`, result: { testResults: [{ label: "not now (skipped)", passed: true }, { passed: true }] } },
  { api: "pm.expect", status: "supported", script: `pm.expect({ a: [1, { b: 2 }] }).to.deep.equal({ a: [1, { b: 2 }] }); pm.expect(1).to.be.a("number").and.to.be.below(2); pm.expect("abc").to.include("b").and.to.have.lengthOf(3); pm.expect(null).to.be.null; pm.expect([1, 2]).to.have.members([2, 1]); pm.expect({ a: 1 }).to.have.property("a", 1); let message = ""; try { pm.expect(1, "the count").to.equal(2); } catch (error) { message = error.name + ": " + error.message; } same(message, "AssertionError: the count: expected 1 to equal 2");` },

  { api: "pm.expect(pm.response)", status: "supported", script: `pm.expect(pm.response).to.have.status(201); pm.expect(pm.response).to.have.header("X-Id", "7"); pm.expect(pm.response).to.have.jsonBody({ id: 7, tags: ["a", "b"] }); pm.expect(pm.response).to.be.success; pm.expect(pm.response).to.not.be.ok; pm.expect(pm.response).to.not.have.status(200); pm.expect(1).to.be.ok; let message = ""; try { pm.expect(pm.response).to.be.ok; } catch (error) { message = error.message; } same(message, "expected response to have status code 200 but got 201");` },
  { api: "pm.info.eventName", status: "supported", script: `same(pm.info.eventName, "test");` },
  { api: "pm.info.eventName (pre-request)", status: "supported", event: "prerequest", script: `same(pm.info.eventName, "prerequest");` },
  { api: "pm.info.iteration", status: "partial", note: "Always 0: there is no collection run yet.", script: `same(pm.info.iteration, 0);` },
  { api: "pm.info.iterationCount", status: "partial", note: "Always 1: there is no collection run yet.", script: `same(pm.info.iterationCount, 1);` },
  { api: "pm.info.requestName", status: "supported", script: `same(pm.info.requestName, "Create item");` },
  { api: "pm.info.requestId", status: "supported", script: `same(pm.info.requestId, "req-1");` },

  { api: "pm.sendRequest (callback)", status: "supported", script: `const answer = await new Promise((resolve, reject) => pm.sendRequest("https://{{host}}/token", (error, response) => (error ? reject(error) : resolve(response)))); same([answer.code, answer.status, answer.json().method, answer.json().url], [200, "OK", "GET", "https://api.test/token"]); answer.to.have.status(200);`, result: { logs: ["[pm.sendRequest] GET https://api.test/token → 200"] } },
  { api: "pm.sendRequest (promise)", status: "supported", script: `const answer = await pm.sendRequest({ url: "https://api.test/login", method: "post", header: { "Content-Type": "application/json", "X-Key": "{{token}}" }, body: { mode: "raw", raw: JSON.stringify({ user: "{{host}}" }) } }); same(answer.json(), { method: "POST", url: "https://api.test/login", headers: [["Content-Type", "application/json"], ["X-Key", "abc123"]], body: '{"user":"api.test"}' });` },
  { api: "pm.sendRequest (urlencoded body)", status: "supported", script: `const answer = await pm.sendRequest({ url: "https://api.test/form", method: "POST", header: [{ key: "Accept", value: "*/*" }, { key: "X-Off", value: "1", disabled: true }], body: { mode: "urlencoded", urlencoded: [{ key: "grant type", value: "a&b" }, { key: "off", value: "1", disabled: true }] } }); same(answer.json(), { method: "POST", url: "https://api.test/form", headers: [["Accept", "*/*"], ["Content-Type", "application/x-www-form-urlencoded"]], body: "grant%20type=a%26b" });` },
  { api: "pm.sendRequest (a request that fails)", status: "supported", script: `const outcome = await new Promise((resolve) => pm.sendRequest("https://api.test/fail", (error, response) => resolve([error && error.message, response]))); same(outcome, ["Network error", null]); let caught = ""; try { await pm.sendRequest("https://api.test/fail"); } catch (error) { caught = error.message; } same(caught, "Network error");` },
  { api: "pm.sendRequest (limit)", status: "partial", note: "A script may make 10 requests in one run. The next is answered with an error.", script: `for (let i = 0; i < 10; i++) await pm.sendRequest("https://api.test/" + i); let caught = ""; try { await pm.sendRequest("https://api.test/eleventh"); } catch (error) { caught = error.message; } same(caught, "pm.sendRequest: a script may make 10 requests, and this is one more.");` },
  { api: "pm.sendRequest (formdata, file or graphql body)", status: "unsupported", script: `let error; try { await pm.sendRequest({ url: "https://api.test/upload", method: "POST", body: { mode: "formdata", formdata: [] } }); } catch (thrown) { error = thrown; } refused(() => { throw error; });` },

  { api: "pm.execution.setNextRequest", status: "partial", note: RUN_ONLY, script: `pm.execution.setNextRequest("Login");`, result: { nextRequest: "Login" } },
  { api: "pm.execution.skipRequest", status: "partial", note: RUN_ONLY, event: "prerequest", script: `pm.execution.skipRequest();`, result: { skipRequest: true } },

  unsupported("pm.cookies.get", `pm.cookies.get("session")`),
  unsupported("pm.cookies.has", `pm.cookies.has("session")`),
  unsupported("pm.cookies.toObject", `pm.cookies.toObject()`),
  unsupported("pm.cookies.jar", `pm.cookies.jar()`),
  unsupported("pm.visualizer.set", `pm.visualizer.set("<p></p>", {})`),
  unsupported("pm.vault.get", `pm.vault.get("key")`),
  unsupported("pm.require", `pm.require("npm:lodash")`),

  { api: "console.log / info / warn / error", status: "supported", script: `console.log("a", 1, { b: [true] }); console.info("i"); console.warn("w"); console.error("e");`, result: { logs: ['a 1 {"b":[true]}', "i", "[warn] w", "[error] e"] } },
  { api: "setTimeout", status: "supported", script: `const order = []; await new Promise((resolve) => { setTimeout(() => { order.push("later"); resolve(); }, 10); order.push("first"); }); same(order, ["first", "later"]);` },
  { api: "clearTimeout, setInterval, clearInterval", status: "unsupported", note: "ReferenceError: the names do not exist.", script: `for (const name of ["clearTimeout", "setInterval", "clearInterval"]) same(typeof globalThis[name], "undefined");` },
  { api: "atob / btoa", status: "supported", script: `same([btoa("user:pass"), atob("dXNlcjpwYXNz")], ["dXNlcjpwYXNz", "user:pass"]);` },

  { api: "require('chai')", status: "supported", script: `require("chai").expect([1]).to.deep.equal([1]); require("chai").assert.isTrue(true);` },
  { api: "require('crypto-js')", status: "supported", script: `const CryptoJS = require("crypto-js"); same(CryptoJS.HmacSHA256("message", "key").toString(), "6e9ef29b75fffc5b7abae527d58fdadb2fe42e7219011976917343065f58ed4a"); same(CryptoJS.MD5("abc").toString(CryptoJS.enc.Base64), "kAFQmDzST7DWlj99KOF/cg=="); same(CryptoJS.AES.decrypt(CryptoJS.AES.encrypt("text", "pass").toString(), "pass").toString(CryptoJS.enc.Utf8), "text");` },
  { api: "require('lodash')", status: "supported", script: `const _ = require("lodash"); same(_.chunk([1, 2, 3], 2), [[1, 2], [3]]); same(_.get({ a: [{ b: 7 }] }, "a[0].b"), 7);` },
  { api: "require('moment')", status: "partial", note: "Without locales: English only.", script: `same(require("moment")("2026-10-10T12:00:00Z").utc().add(1, "day").format("YYYY-MM-DD"), "2026-10-11");` },
  { api: "require('uuid')", status: "supported", script: `const uuid = require("uuid"); same(uuid.validate(uuid.v4()), true); same(uuid.v4() === uuid.v4(), false);` },
  { api: "require('atob') / require('btoa')", status: "supported", script: `same(require("atob")(require("btoa")("a")), "a");` },
  ...["ajv", "cheerio", "csv-parse/lib/sync", "postman-collection", "tv4", "xml2js"].map((name) => unsupported(`require('${name}')`, `require("${name}")`)),
  { api: "require of a Node module (buffer, events, path, querystring, stream, string_decoder, timers, url, util)", status: "unsupported", script: `for (const name of ["buffer", "events", "path", "querystring", "stream", "string_decoder", "timers", "url", "util"]) refused(() => require(name));` },
];
