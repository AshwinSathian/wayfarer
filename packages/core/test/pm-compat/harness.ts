import type { ScriptContext, ScriptResponse, ScriptResult, ScriptSendRequest } from "../../src/scripting/host";
import type { CompatCase } from "./cases";

/** What every row's script runs against. */
export const FIXTURE = {
  environment: [
    ["host", "api.test"],
    ["token", "abc123"],
    ["nested", "{{host}}/v1"],
  ],
  environmentName: "Staging",
  folder: [["inFolder", "from the folder"]],
  collection: [
    ["base", "https://{{host}}"],
    ["shared", "from collection"],
  ],
  globals: [
    ["shared", "from globals"],
    ["g", "1"],
  ],
  request: {
    method: "POST",
    url: "https://{{host}}/items?page=2#top",
    headers: [
      ["Content-Type", "application/json"],
      ["X-Trace", "t-1"],
    ],
    body: { mode: "raw", raw: '{"name":"{{token}}"}' },
  },
  response: { code: 201, status: "Created", headers: { "Content-Type": "application/json", "X-Id": "7" }, body: '{"id":7,"tags":["a","b"]}', responseTime: 12, responseSize: 25 },
} satisfies Partial<ScriptContext>;

const PRELUDE = `
function same(actual, expected) {
  const sorted = (value) => JSON.stringify(value, (key, inner) => (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.keys(inner).sort().map((name) => [name, inner[name]])) : inner));
  if (sorted(actual) !== sorted(expected)) throw new Error("got " + sorted(actual) + ", expected " + sorted(expected));
}
function refused(fn) {
  try { fn(); } catch (error) {
    if (!error || error.name !== "WayfarerUnsupportedError" || !/ is not supported — see docs\\/postman-compatibility\\.md#[a-z-]+$/.test(error.message)) throw error;
    return;
  }
  throw new Error("it did not throw");
}
`;

/** The script of a row, as it is run. */
export function scriptOf(row: CompatCase): string {
  return `${PRELUDE}\npm.test(${JSON.stringify(row.api)}, async () => {\n${row.script}\n});`;
}

/** The context of a row: a pre-request script has no response. */
export function contextOf(row: CompatCase): ScriptContext {
  const { response, ...rest } = FIXTURE;
  const info = { eventName: row.event ?? ("test" as const), requestName: "Create item", requestId: "req-1" };
  return structuredClone(row.event === "prerequest" ? { ...rest, info } : { ...rest, response, info });
}

/** Stands for the network: answers with the request it was given, and fails for an address that says so. */
export function echo(request: ScriptSendRequest): Promise<ScriptResponse> {
  if (request.url.includes("/fail")) return Promise.reject(new Error("Network error"));
  const body = JSON.stringify(request);
  return Promise.resolve({ code: 200, status: "OK", headers: { "Content-Type": "application/json" }, body, responseTime: 5, responseSize: body.length });
}

/** Why a row's run does not prove the row, or undefined when it does: no error, its own test passed, and the result the row names. */
export function verdict(row: CompatCase, result: ScriptResult): string | undefined {
  if (result.error !== undefined) return `the script ended in an error: ${result.error}`;
  const own = result.testResults.find((test) => test.label === row.api);
  if (!own) return "its test did not run";
  if (!own.passed) return own.error ?? "its test failed";
  return undefined;
}
