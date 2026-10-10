import { TestBed } from "@angular/core/testing";
import { applyVariableChanges, type Row, type ScriptResult, type VariableChange } from "@wayfarer/core";
import { requestContent, rowsOf } from "../../testing/request-fixtures";
import {
  BinaryBody,
  TransportError,
  type ResolvedRequest,
  type ResponseEnvelope,
  type TransportOptions,
} from "@wayfarer/core";
import { signal } from "@angular/core";
import { RequestExecutor, BuiltRequest, PreRequestScriptError, SendBlockedError, SendDeclinedError } from "./request-executor";
import { RequestSettings } from "./request-settings";
import { TransportRouter } from "./transport-router";
import { EnvironmentsStore } from "./environments-store";
import { ResponseInspector } from "../shared/inspect/response-inspector";
import { ScriptSandbox } from "../shared/scripts/script-sandbox";
import { AssertionRunner } from "../shared/scripts/assertion-runner";
import { EnvironmentDoc } from "../models/environments";
import { describe, it, beforeEach, expect, vi } from "vitest";

const bytes = (value: unknown): ArrayBuffer =>
  value === undefined ? new ArrayBuffer(0) : new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).buffer;

/** A response as the transport returns it, with a JSON body by default. */
function envelope(status: number, statusText: string, body?: unknown, contentType = "application/json"): ResponseEnvelope {
  const buffer = body instanceof ArrayBuffer ? body : bytes(body);
  return {
    status,
    statusText,
    headers: [["content-type", contentType]],
    body: buffer,
    redirected: false,
    finalUrl: "",
    route: "direct",
    sizes: { decoded: buffer.byteLength },
  };
}

class TransportStub {
  private outcome: ResponseEnvelope | TransportError = envelope(200, "OK", { ok: true });

  /** The call as the specs have always asserted it: method, URL, headers, body. */
  sendRequest = vi.fn();
  options: TransportOptions | undefined;

  send(request: ResolvedRequest, options: TransportOptions): Promise<ResponseEnvelope> {
    this.options = options;
    this.sendRequest(
      request.method,
      request.url,
      Object.fromEntries(request.headers),
      typeof request.body === "string" ? (JSON.parse(request.body) as unknown) : request.body
    );
    return this.outcome instanceof TransportError ? Promise.reject(this.outcome) : Promise.resolve(this.outcome);
  }

  setResponse(outcome: ResponseEnvelope | TransportError): void {
    this.outcome = outcome;
  }

  route(): "direct" | "bridge" {
    return "direct";
  }
}

class ResponseInspectorServiceStub {
  markRequest = vi.fn();
  markResponse = vi.fn();
}

class EnvironmentsServiceStub {
  private readonly activeEnvSignal = signal<EnvironmentDoc | null>(null);
  readonly activeEnvironment = this.activeEnvSignal.asReadonly();
  readonly globals = signal<Row[]>([]);
  changeGlobals = vi.fn().mockImplementation(async (changes: VariableChange[]) => this.globals.set(applyVariableChanges(this.globals(), changes)));
  changeEnvironment = vi.fn()
    .mockImplementation(async (id: string, changes: VariableChange[]) => {
      const current = this.activeEnvSignal();
      if (current && current.meta.id === id) {
        this.activeEnvSignal.set({ ...current, vars: applyVariableChanges(current.vars, changes) });
      }
    });

  setActiveEnvironment(env: EnvironmentDoc | null): void {
    this.activeEnvSignal.set(env);
  }
}

class ScriptSandboxServiceStub {
  private nextResult: ScriptResult = { logs: [], changes: { environment: [], collection: [], global: [] }, testResults: [] };

  execute = vi.fn().mockImplementation(async () => this.nextResult);

  setNextResult(result: ScriptResult): void {
    this.nextResult = result;
  }
}

function buildEnvironment(vars: Record<string, string>): EnvironmentDoc {
  return {
    id: "env-1",
    meta: { id: "env-1", createdAt: 1, updatedAt: 1, version: 1 },
    name: "Test env",
    order: 1,
    vars: rowsOf(vars),
  } as EnvironmentDoc;
}

function builtRequest(overrides: Partial<BuiltRequest> = {}): BuiltRequest {
  return {
    method: "GET",
    url: "https://example.com/data",
    headers: [],
    secrets: [],
    credentials: [],
    ...overrides,
  };
}

/** The request as composed, where a test does not look at it. */
const TEMPLATE = requestContent();

describe("RequestExecutor", () => {
  let service: RequestExecutor;
  let transport: TransportStub;
  let responseInspector: ResponseInspectorServiceStub;
  let environmentsService: EnvironmentsServiceStub;
  let scriptSandbox: ScriptSandboxServiceStub;

  beforeEach(() => {
    transport = new TransportStub();
    responseInspector = new ResponseInspectorServiceStub();
    environmentsService = new EnvironmentsServiceStub();
    scriptSandbox = new ScriptSandboxServiceStub();

    TestBed.configureTestingModule({
      providers: [
        RequestExecutor,
        AssertionRunner,
        { provide: TransportRouter, useValue: transport },
        { provide: ResponseInspector, useValue: responseInspector },
        { provide: EnvironmentsStore, useValue: environmentsService },
        { provide: ScriptSandbox, useValue: scriptSandbox },
      ],
    });
    service = TestBed.inject(RequestExecutor);
  });

  it("sends the request built by buildRequest() and shapes a successful JSON response", async () => {
    transport.setResponse(envelope(200, "OK", { hello: "world" }));

    const result = await service.execute({ template: TEMPLATE, runScripts: true,
      preRequestScript: "",
      postRequestScript: "",
      tests: [],
      buildRequest: () => builtRequest({ url: "https://example.com/hello" }),
    });

    expect(transport.sendRequest).toHaveBeenCalledWith(
      "GET",
      "https://example.com/hello",
      {},
      undefined
    );
    expect(result.response.isError).toBe(false);
    expect(result.response.statusCode).toBe(200);
    expect(result.response.bodyIsJson).toBe(true);
    expect(result.response.dataText).toContain("world");
    expect(result.history.response?.status).toBe(200);
    expect(result.history.sent.url).toBe("https://example.com/hello");
  });

  it("marks request/response with the URL from buildRequest(), not a placeholder", async () => {
    await service.execute({ template: TEMPLATE, runScripts: true,
      preRequestScript: "",
      postRequestScript: "",
      tests: [],
      buildRequest: () => builtRequest({ url: "https://example.com/marked" }),
    });

    expect(responseInspector.markRequest).toHaveBeenCalledWith(
      expect.any(String),
      "https://example.com/marked"
    );
    expect(responseInspector.markResponse).toHaveBeenCalledWith(
      expect.any(String),
      "https://example.com/marked"
    );
  });

  it("includes a text body in the sent request and in history", async () => {
    const result = await service.execute({ template: TEMPLATE, runScripts: true,
      preRequestScript: "",
      postRequestScript: "",
      tests: [],
      buildRequest: () =>
        builtRequest({ method: "POST", body: JSON.stringify({ name: "widget" }) }),
    });
    expect(result.history.sent.bodyPreview).toBe('{"name":"widget"}');

    expect(transport.sendRequest).toHaveBeenCalledWith(
      "POST",
      expect.any(String),
      {},
      { name: "widget" }
    );
  });

  it("omits the body from the send call and history when the request has none", async () => {
    const result = await service.execute({ template: TEMPLATE, runScripts: true,
      preRequestScript: "",
      postRequestScript: "",
      tests: [],
      buildRequest: () => builtRequest({ method: "DELETE" }),
    });

    expect(transport.sendRequest).toHaveBeenCalledWith(
      "DELETE",
      expect.any(String),
      {},
      undefined
    );
    expect(result.history.sent.bodyPreview).toBeUndefined();
  });

  it("shapes a network error (status 0) into a readable message rather than leaking the raw event", async () => {
    // The browser says no more than "Failed to fetch"; the guidance text is shown instead (P0.5, #63).
    transport.setResponse(new TransportError("network", "Failed to fetch"));

    const result = await service.execute({ template: TEMPLATE, runScripts: true,
      preRequestScript: "",
      postRequestScript: "",
      tests: [],
      buildRequest: () => builtRequest(),
    });

    expect(result.response.isError).toBe(true);
    expect(result.response.bodyIsJson).toBe(false);
    expect(result.response.errorText).not.toContain("isTrusted");
    expect(result.response.errorText).toMatch(/^Network error/);
    expect(result.response.errorText).toMatch(/CORS/);
    expect(result.response.errorText).not.toContain("Unknown Error");
    expect(result.history.error).toBeDefined();
  });

  it("shapes a JSON error body from a real HTTP error response", async () => {
    transport.setResponse(envelope(500, "Server Error", { message: "boom" }));

    const result = await service.execute({ template: TEMPLATE, runScripts: true,
      preRequestScript: "",
      postRequestScript: "",
      tests: [],
      buildRequest: () => builtRequest(),
    });

    expect(result.response.isError).toBe(true);
    expect(result.response.statusCode).toBe(500);
    expect(result.response.bodyIsJson).toBe(true);
    expect(result.response.errorText).toContain("boom");
  });

  it("runs the pre-request script before calling buildRequest(), so env mutations it makes are visible to the built request", async () => {
    environmentsService.setActiveEnvironment(buildEnvironment({}));
    scriptSandbox.setNextResult({
      logs: [],
      changes: { environment: [{ key: "authToken", value: "fetched-token" }], collection: [], global: [] },
      testResults: [],
    });

    let capturedEnvDuringBuild: string | undefined;
    await service.execute({ template: TEMPLATE, runScripts: true,
      preRequestScript: "pm.environment.set('authToken', 'fetched-token');",
      postRequestScript: "",
      tests: [],
      buildRequest: () => {
        capturedEnvDuringBuild = environmentsService.activeEnvironment()?.vars.find((row) => row.key === "authToken")?.value;
        return builtRequest();
      },
    });

    expect(scriptSandbox.execute).toHaveBeenCalledBefore(transport.sendRequest);
    expect(capturedEnvDuringBuild).toBe("fetched-token");
  });

  it("merges pre-script test results into the final testResults", async () => {
    scriptSandbox.execute.mockImplementation(async (script: string) => {
      if (script.includes("pre")) {
        return {
          logs: [],
          changes: { environment: [], collection: [], global: [] },
          testResults: [{ label: "pre check", passed: true, source: "script" as const }],
        };
      }
      return { logs: [], changes: { environment: [], collection: [], global: [] }, testResults: [] };
    });

    const result = await service.execute({ template: TEMPLATE, runScripts: true,
      preRequestScript: "pre script",
      postRequestScript: "",
      tests: [],
      buildRequest: () => builtRequest(),
    });

    expect(result.testResults).toEqual([
      expect.objectContaining({ label: "pre check", passed: true }),
    ]);
  });

  it("runs the post-response script with response context and merges its test results", async () => {
    transport.setResponse(envelope(201, "Created", { id: 1 }));
    scriptSandbox.setNextResult({
      logs: [],
      changes: { environment: [], collection: [], global: [] },
      testResults: [{ label: "post check", passed: true, source: "script" as const }],
    });

    const result = await service.execute({ template: TEMPLATE, runScripts: true,
      preRequestScript: "",
      postRequestScript: "pm.test('post check', () => true);",
      tests: [],
      buildRequest: () => builtRequest(),
    });

    expect(scriptSandbox.execute).toHaveBeenCalledWith(
      "pm.test('post check', () => true);",
      expect.any(Object),
      expect.objectContaining({ statusCode: 201 }),
      // Since P3.3: the default time limit, and what else a script is given.
      undefined,
      expect.objectContaining({ info: expect.objectContaining({ eventName: "test" }) }),
    );
    expect(result.testResults).toEqual([
      expect.objectContaining({ label: "post check", passed: true }),
    ]);
  });

  it("runs visual test assertions against the response and merges them into testResults", async () => {
    transport.setResponse(envelope(200, "OK", {}));

    const result = await service.execute({ template: TEMPLATE, runScripts: true,
      preRequestScript: "",
      postRequestScript: "",
      tests: [{ id: "t1", target: "status", operator: "equals", expected: "200" }],
      buildRequest: () => builtRequest(),
    });

    expect(result.testResults.length).toBe(1);
    expect(result.testResults[0].passed).toBe(true);
  });

  it("applies post-script env mutations too", async () => {
    environmentsService.setActiveEnvironment(buildEnvironment({ counter: "1" }));
    scriptSandbox.setNextResult({
      logs: [],
      changes: { environment: [{ key: "counter", value: "2" }], collection: [], global: [] },
      testResults: [],
    });

    await service.execute({ template: TEMPLATE, runScripts: true,
      preRequestScript: "",
      postRequestScript: "increment",
      tests: [],
      buildRequest: () => builtRequest(),
    });

    // The change alone, for the store to apply to what is stored: not this tab's copy of the variables.
    expect(environmentsService.changeEnvironment).toHaveBeenCalledWith("env-1", [{ key: "counter", value: "2", keepSecret: true }]);
    expect(environmentsService.activeEnvironment()?.vars).toEqual([{ key: "counter", value: "2", enabled: true }]);
  });

  it("runs both scripts in every build, sends, and runs Tests-tab assertions (C-006)", async () => {
    scriptSandbox.setNextResult({ logs: [], changes: { environment: [], collection: [], global: [] }, testResults: [{ label: "t", passed: true, source: "script" }] });
    const result = await service.execute({ template: TEMPLATE, runScripts: true,
      preRequestScript: "pm.test('t', () => {});",
      postRequestScript: "pm.test('t', () => {});",
      tests: [{ id: "a1", target: "status", operator: "equals", expected: "200" }],
      buildRequest: () => builtRequest(),
    });

    expect(scriptSandbox.execute).toHaveBeenCalledTimes(2);
    expect(transport.sendRequest).toHaveBeenCalledTimes(1);
    expect(result.testResults.map((row) => [row.label, row.passed, row.source])).toEqual([
      ["t", true, "script"],
      ["t", true, "script"],
      ["Status code equals 200", true, "assertion"],
    ]);
  });

  it("F65: the console lines of both scripts come back, the pre-request script's first", async () => {
    scriptSandbox.execute.mockImplementation(async (_script: string, _env: unknown, response?: unknown) => ({
      logs: response ? ["after"] : ["before", "[warn] careful"],
      changes: { environment: [], collection: [], global: [] },
      testResults: [],
    }));
    const result = await service.execute({ template: TEMPLATE, runScripts: true,
      preRequestScript: "console.log('before'); console.warn('careful')",
      postRequestScript: "console.log('after')",
      tests: [],
      buildRequest: () => builtRequest(),
    });
    expect(result.scriptLogs).toEqual(["before", "[warn] careful", "after"]);
  });

  it("masks a vault secret and a credential in everything a script wrote; a stored variable loses the secret and keeps the credential", async () => {
    environmentsService.setActiveEnvironment(buildEnvironment({ token: "typed-credential-1" }));
    scriptSandbox.setNextResult({
      logs: ["echoed vault-secret-42 and typed-credential-1"],
      changes: { environment: [{ key: "leaked", value: "prefix vault-secret-42" }, { key: "token", value: "typed-credential-1" }], collection: [], global: [] },
      testResults: [{ label: "saw vault-secret-42", passed: false, error: "got typed-credential-1", source: "script" }],
      error: "threw vault-secret-42",
    });
    const result = await service.execute({ template: TEMPLATE, runScripts: true,
      preRequestScript: "",
      postRequestScript: "leak()",
      tests: [],
      buildRequest: () => builtRequest({ secrets: ["vault-secret-42"], credentials: ["typed-credential-1"] }),
    });

    expect(result.scriptLogs).toEqual(["echoed *** and ***"]);
    expect(result.testResults).toEqual([
      { label: "saw ***", passed: false, error: "got ***", source: "script" },
      { label: "Post-response script", passed: false, error: "threw ***", source: "script" },
    ]);
    // The secret must not be stored outside the vault. The credential was typed into this environment and stays what it was.
    expect(environmentsService.changeEnvironment).toHaveBeenCalledWith("env-1", [
      { key: "leaked", value: "prefix ***", keepSecret: true },
      { key: "token", value: "typed-credential-1", keepSecret: true },
    ]);
  });

  it("skips both scripts when they are not approved, and still sends and runs the assertions (D6)", async () => {
    const result = await service.execute({ template: TEMPLATE, runScripts: false,
      preRequestScript: "pm.environment.set('a', '1');",
      postRequestScript: "pm.test('t', () => {});",
      tests: [{ id: "a1", target: "status", operator: "equals", expected: "200" }],
      buildRequest: () => builtRequest(),
    });

    expect(scriptSandbox.execute).not.toHaveBeenCalled();
    expect(transport.sendRequest).toHaveBeenCalledTimes(1);
    expect(result.testResults).toHaveLength(1);
    expect(result.testResults[0]).toEqual(expect.objectContaining({ passed: true, source: "assertion" }));
  });

  it("F65: a script that ends in an error is a failed row, after the tests that ran before it", async () => {
    scriptSandbox.setNextResult({
      logs: [],
      changes: { environment: [], collection: [], global: [] },
      testResults: [{ label: "ran first", passed: true, source: "script" }],
      error: "'notDefined' is not defined",
    });
    const result = await service.execute({ template: TEMPLATE, runScripts: true,
      preRequestScript: "",
      postRequestScript: "pm.test('ran first', () => {}); notDefined();",
      tests: [],
      buildRequest: () => builtRequest(),
    });

    expect(result.testResults).toEqual([
      { label: "ran first", passed: true, source: "script" },
      { label: "Post-response script", passed: false, error: "'notDefined' is not defined", source: "script" },
    ]);
    expect(transport.sendRequest).toHaveBeenCalledTimes(1);
  });

  describe("the order of a send with scripts (P3.9)", () => {
    const NO_CHANGES = { environment: [], collection: [], global: [] };

    it("a pre-request script that ends in an error stops the send: nothing is built or sent, and its rows, its console and what it set are kept", async () => {
      environmentsService.setActiveEnvironment(buildEnvironment({}));
      scriptSandbox.setNextResult({
        logs: ["before the error"],
        changes: { ...NO_CHANGES, environment: [{ key: "set", value: "1" }] },
        testResults: [{ label: "ran first", passed: true, source: "script" }],
        error: "'notDefined' is not defined",
      });
      const buildRequest = vi.fn(() => builtRequest());
      const failure: unknown = await service
        .execute({ template: TEMPLATE, runScripts: true, preRequestScript: "pm.test('ran first', () => {}); notDefined();", postRequestScript: "after()", tests: [], buildRequest })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(PreRequestScriptError);
      expect(failure).toBeInstanceOf(SendBlockedError);
      const stopped = failure as PreRequestScriptError;
      expect(stopped.message).toBe("The pre-request script failed, so the request was not sent.");
      expect(stopped.testResults).toEqual([
        { label: "ran first", passed: true, source: "script" },
        { label: "Pre-request script", passed: false, error: "'notDefined' is not defined", source: "script" },
      ]);
      expect(stopped.scriptLogs).toEqual(["before the error"]);
      expect(stopped.timings.preScriptMs).toEqual(expect.any(Number));
      expect(buildRequest).not.toHaveBeenCalled();
      expect(transport.sendRequest).not.toHaveBeenCalled();
      // Only the pre-request script ran, and what it set before the error is stored, as in Postman.
      expect(scriptSandbox.execute).toHaveBeenCalledTimes(1);
      expect(environmentsService.activeEnvironment()?.vars).toEqual(rowsOf({ set: "1" }));
    });

    it("a pre-request test that fails does not stop the send: only an error does", async () => {
      scriptSandbox.setNextResult({ logs: [], changes: NO_CHANGES, testResults: [{ label: "expects too much", passed: false, error: "no", source: "script" }] });
      const result = await service.execute({ template: TEMPLATE, runScripts: true, preRequestScript: "pm.test(...)", postRequestScript: "", tests: [], buildRequest: () => builtRequest() });
      expect(transport.sendRequest).toHaveBeenCalledTimes(1);
      expect(result.testResults).toEqual([{ label: "expects too much", passed: false, error: "no", source: "script" }]);
    });

    it("reports three durations: a pre-request script that waits 200 ms does not change the request's", async () => {
      let clock = 0;
      vi.spyOn(performance, "now").mockImplementation(() => clock);
      const waits = [200, 8];
      scriptSandbox.execute.mockImplementation(async () => {
        clock += waits.shift() ?? 0;
        return { logs: [], changes: NO_CHANGES, testResults: [] };
      });
      const send = transport.send.bind(transport);
      transport.send = (request, options) => {
        clock += 340;
        return send(request, options);
      };
      const result = await service.execute({ template: TEMPLATE, runScripts: true, preRequestScript: "wait()", postRequestScript: "check()", tests: [], buildRequest: () => builtRequest() });
      vi.restoreAllMocks();

      expect(result.timings).toEqual({ preScriptMs: 200, requestMs: 340, postScriptMs: 8 });
      expect(result.durationMs).toBe(340);
    });

    it("gives no duration for a script that did not run", async () => {
      const result = await service.execute({ template: TEMPLATE, runScripts: false, preRequestScript: "a()", postRequestScript: "b()", tests: [], buildRequest: () => builtRequest() });
      expect(Object.keys(result.timings)).toEqual(["requestMs"]);
    });

    it("the post-response script sees the request as it was sent, a vault secret in it masked and a credential as it is", async () => {
      scriptSandbox.setNextResult({ logs: [], changes: NO_CHANGES, testResults: [] });
      // The stub reads a text body as JSON; this one is a form.
      transport.send = () => Promise.resolve(envelope(200, "OK", { ok: true }));
      const template = requestContent({ method: "POST", url: "https://{{host}}/items?k={{API_KEY}}", headers: rowsOf({ "X-Key": "{{API_KEY}}" }), body: { mode: "urlencoded", urlencoded: [{ key: "key", value: "{{API_KEY}}", enabled: true }] } });
      await service.execute({
        template,
        runScripts: true,
        preRequestScript: "",
        postRequestScript: "check()",
        tests: [],
        buildRequest: () =>
          builtRequest({
            method: "POST",
            url: "https://api.test/items?k=vault-secret-42",
            headers: [["X-Key", "vault-secret-42"], ["Authorization", "Bearer typed-credential-1"]],
            body: "key=vault-secret-42&plain=a+b",
            secrets: ["vault-secret-42"],
            credentials: ["typed-credential-1"],
          }),
      });
      const given = scriptSandbox.execute.mock.calls[0][4] as { request: unknown };
      expect(given.request).toEqual({
        method: "POST",
        url: "https://api.test/items?k=***",
        headers: [["X-Key", "***"], ["Authorization", "Bearer typed-credential-1"]],
        body: { mode: "urlencoded", urlencoded: [["key", "***"], ["plain", "a b"]] },
      });
      expect(JSON.stringify(scriptSandbox.execute.mock.calls)).not.toContain("vault-secret-42");
    });

    it("Q6: when the user declines a request a pre-request script sent elsewhere, what that script set is undone", async () => {
      environmentsService.setActiveEnvironment(buildEnvironment({ host: "api.test", kept: "1" }));
      environmentsService.globals.set(rowsOf({ g: "1" }));
      const stored = new Map<string, string>([["base", "https://api.test"]]);
      const change = vi.fn(async (changes: VariableChange[]) => changes.forEach(({ key, value }) => (value === null ? stored.delete(key) : stored.set(key, value))));
      scriptSandbox.setNextResult({
        logs: [],
        changes: { environment: [{ key: "host", value: "elsewhere.test" }, { key: "fresh", value: "x" }], collection: [{ key: "base", value: "https://elsewhere.test" }], global: [{ key: "g", value: null }] },
        testResults: [],
      });
      const failure: unknown = await service
        .execute({
          template: TEMPLATE,
          runScripts: true,
          preRequestScript: "redirect()",
          postRequestScript: "",
          tests: [],
          collection: { variables: () => rowsOf(Object.fromEntries(stored)), change },
          buildRequest: () => {
            // The script's changes were stored when the request is built.
            expect(environmentsService.activeEnvironment()?.vars).toEqual(rowsOf({ host: "elsewhere.test", kept: "1", fresh: "x" }));
            throw new SendDeclinedError("declined");
          },
        })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(SendDeclinedError);
      expect(transport.sendRequest).not.toHaveBeenCalled();
      expect(environmentsService.activeEnvironment()?.vars).toEqual(rowsOf({ host: "api.test", kept: "1" }));
      expect(environmentsService.globals()).toEqual(rowsOf({ g: "1" }));
      expect(Object.fromEntries(stored)).toEqual({ base: "https://api.test" });
    });
  });

  const form = (...parts: [string, string | File][]): FormData => {
    const data = new FormData();
    for (const [name, value] of parts) data.append(name, value);
    return data;
  };

  describe("inherited scripts (P4.9): the collection's, each folder's from the outside in, the request's own", () => {
    const NO_CHANGES = { environment: [], collection: [], global: [] };
    const inherited = [
      { name: 'collection "Shop"', scripts: { pre: "collectionPre()", post: "collectionPost()" } },
      { name: 'folder "Outer"', scripts: { pre: "outerPre()", post: "" } },
      { name: 'folder "Inner"', scripts: { pre: "", post: "innerPost()" } },
    ];
    /** Each script that ran, with the environment it was given. */
    const ran = () => scriptSandbox.execute.mock.calls.map(([script, env]) => [script, env] as [string, Record<string, string>]);
    /** Every script sets `last` to its own text, logs it, and has one test; `fail` names a script that ends in an error. */
    const scripted = (fail?: string) =>
      scriptSandbox.execute.mockImplementation(
        async (script: string): Promise<ScriptResult> => ({
          logs: [script],
          changes: { ...NO_CHANGES, environment: [{ key: "last", value: script }, { key: script, value: "ran" }] },
          testResults: [{ label: `test of ${script}`, passed: true, source: "script" }],
          ...(script === fail && { error: "boom" }),
        })
      );
    const spec = (buildRequest: () => BuiltRequest = () => builtRequest()) => ({
      template: TEMPLATE,
      runScripts: true,
      preRequestScript: "requestPre()",
      postRequestScript: "requestPost()",
      tests: [],
      inherited,
      folderVariables: () => rowsOf({ inFolder: "f" }),
      buildRequest,
    });

    it("run in that order around the send, each with the variables the one before left, and a blank script is not run", async () => {
      environmentsService.setActiveEnvironment(buildEnvironment({}));
      scripted();
      const order: string[] = [];
      transport.sendRequest.mockImplementation(() => order.push("send"));
      scriptSandbox.execute.mock.calls.length = 0;
      const result = await service.execute(spec(() => (order.push("build"), builtRequest())));

      expect(ran().map(([script]) => script)).toEqual(["collectionPre()", "outerPre()", "requestPre()", "collectionPost()", "innerPost()", "requestPost()"]);
      // Built and sent after the last pre-request script and before the first post-response script.
      expect(order).toEqual(["build", "send"]);
      expect(ran().map(([, env]) => env["last"])).toEqual([undefined, "collectionPre()", "outerPre()", "requestPre()", "collectionPost()", "innerPost()"]);
      expect(result.scriptLogs).toEqual(["collectionPre()", "outerPre()", "requestPre()", "collectionPost()", "innerPost()", "requestPost()"]);
      expect(result.testResults.map((row) => row.label)).toEqual(["collectionPre()", "outerPre()", "requestPre()", "collectionPost()", "innerPost()", "requestPost()"].map((script) => `test of ${script}`));
      // A script reads the folders' variables and is told which event it is, for the request being sent.
      const extras = scriptSandbox.execute.mock.calls.map((call) => call[4] as { folder: unknown; info: { eventName: string } });
      expect(extras.map((given) => given.info.eventName)).toEqual(["prerequest", "prerequest", "prerequest", "test", "test", "test"]);
      expect(extras[0].folder).toEqual([["inFolder", "f"]]);
      expect(result.timings).toEqual({ preScriptMs: expect.any(Number) as number, requestMs: expect.any(Number) as number, postScriptMs: expect.any(Number) as number });
    });

    it("an error in a folder's pre-request script stops the send: no later script runs, nothing is built, and the row and the message name the folder", async () => {
      environmentsService.setActiveEnvironment(buildEnvironment({}));
      scripted("outerPre()");
      const buildRequest = vi.fn(() => builtRequest());
      const failure: unknown = await service.execute(spec(buildRequest)).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(PreRequestScriptError);
      const stopped = failure as PreRequestScriptError;
      expect(stopped.message).toBe('The pre-request script of folder "Outer" failed, so the request was not sent.');
      expect(stopped.testResults).toEqual([
        { label: "test of collectionPre()", passed: true, source: "script" },
        { label: "test of outerPre()", passed: true, source: "script" },
        { label: 'Pre-request script of folder "Outer"', passed: false, error: "boom", source: "script" },
      ]);
      expect(stopped.scriptLogs).toEqual(["collectionPre()", "outerPre()"]);
      expect(ran().map(([script]) => script)).toEqual(["collectionPre()", "outerPre()"]);
      expect(buildRequest).not.toHaveBeenCalled();
      expect(transport.sendRequest).not.toHaveBeenCalled();
    });

    it("an error in the collection's post-response script is a failed row named for it, and the scripts after it still run", async () => {
      scripted("collectionPost()");
      const result = await service.execute(spec());

      expect(ran().map(([script]) => script).slice(3)).toEqual(["collectionPost()", "innerPost()", "requestPost()"]);
      expect(result.testResults).toContainEqual({ label: 'Post-response script of collection "Shop"', passed: false, error: "boom", source: "script" });
    });

    it("not approved, none of them runs", async () => {
      scripted();
      scriptSandbox.execute.mockClear();
      await service.execute({ ...spec(), runScripts: false });

      expect(scriptSandbox.execute).not.toHaveBeenCalled();
      expect(transport.sendRequest).toHaveBeenCalledTimes(1);
    });

    it("Q6: when the user declines, what every pre-request script set is undone, the inherited ones' too", async () => {
      environmentsService.setActiveEnvironment(buildEnvironment({ last: "before" }));
      scripted();
      await expect(
        service.execute(
          spec(() => {
            throw new SendDeclinedError("declined");
          })
        )
      ).rejects.toBeInstanceOf(SendDeclinedError);

      expect(environmentsService.activeEnvironment()?.vars).toEqual(rowsOf({ last: "before" }));
    });
  });

  describe("protected-variable placeholders (P0.3, #60)", () => {
    const secret = "{{$secret.0b6f1c2e-0000-4000-8000-000000000001}}";
    const cases: [string, Partial<BuiltRequest>][] = [
      ["URL", { url: `https://example.com/?key=${secret}` }],
      ["header value", { headers: [["X-Api-Key", secret]] }],
      ["header name", { headers: [[secret, "1"]] }],
      ["nested body", { method: "POST", body: JSON.stringify({ a: { b: [secret] } }) }],
      ["form body, percent-encoded", { method: "POST", body: new URLSearchParams([["key", "{{ $secret.abc }}"]]).toString() }],
      ["multipart field value", { method: "POST", body: form(["key", secret]) }],
      ["multipart field name", { method: "POST", body: form([secret, "1"]) }],
      ["multipart file name", { method: "POST", body: form(["file", new File(["x"], `${secret}.txt`)]) }],
      ["spaced placeholder", { headers: [["Authorization", "Bearer {{ $secret.abc }}"]] }],
      ["percent-encoded URL", { url: "https://example.com/?key=%7B%7B%24secret.abc%7D%7D" }],
      ["Basic credentials", { headers: [["Authorization", `Basic ${btoa(`user:${secret}`)}`]] }],
    ];

    for (const [where, overrides] of cases) {
      it(`blocks the send when the ${where} still holds one`, async () => {
        await expect(
          service.execute({ template: TEMPLATE, runScripts: true,
            preRequestScript: "",
            postRequestScript: "",
            tests: [],
            buildRequest: () => builtRequest(overrides),
          })
        ).rejects.toThrow(SendBlockedError);
        expect(transport.sendRequest).not.toHaveBeenCalled();
      });
    }

    it("still sends an ordinary {{var}} left unresolved", async () => {
      await service.execute({ template: TEMPLATE, runScripts: true,
        preRequestScript: "",
        postRequestScript: "",
        tests: [],
        buildRequest: () => builtRequest({ headers: [["X-Id", "{{missing}}"]] }),
      });
      expect(transport.sendRequest).toHaveBeenCalledTimes(1);
    });
  });

  it("passes a binary body through for download instead of stringifying it (P0.4, #62)", async () => {
    const png = new BinaryBody(new Uint8Array([0x89, 0x50]).buffer, "image/png");
    transport.setResponse(envelope(200, "OK", png.bytes, "image/png"));

    const result = await service.execute({ template: TEMPLATE, runScripts: true,
      preRequestScript: "",
      postRequestScript: "",
      tests: [],
      buildRequest: () => builtRequest(),
    });

    // The executor decodes the transport's bytes itself now, so this is an equal body, not the same object.
    expect(result.response.binary).toEqual(png);
    expect(result.response.bodyIsJson).toBe(false);
    expect(result.response.dataText).toBe("");
  });

  // P2.3 (F10, F11)
  it("passes the caller's signal and the timeout setting to the transport", async () => {
    TestBed.inject(RequestSettings).timeoutMs.set(1500);
    const controller = new AbortController();

    await service.execute({ template: TEMPLATE, runScripts: true, preRequestScript: "", postRequestScript: "", tests: [], buildRequest: () => builtRequest(), signal: controller.signal });

    expect(transport.options).toEqual({ signal: controller.signal, timeoutMs: 1500 });
  });

  it("measures the duration around the transport call only, not the pre-request script (F11)", async () => {
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    scriptSandbox.execute.mockImplementation(async () => {
      clock += 5000;
      return { logs: [], changes: { environment: [], collection: [], global: [] }, testResults: [] };
    });
    const send = transport.send.bind(transport);
    transport.send = (request, options) => {
      clock += 120;
      return send(request, options);
    };

    const result = await service.execute({ template: TEMPLATE, runScripts: true,
      preRequestScript: "pm.environment.set('a', '1');",
      postRequestScript: "",
      tests: [],
      buildRequest: () => builtRequest(),
    });
    vi.restoreAllMocks();

    expect(scriptSandbox.execute).toHaveBeenCalled();
    expect(result.durationMs).toBe(120);
    expect(result.history.durationMs).toBe(120);
  });

  it("shows a timeout and a cancel as what they are, with no status", async () => {
    for (const failure of [
      new TransportError("timeout", "Timed out after 1000 ms"),
      new TransportError("aborted", "The request was cancelled."),
    ]) {
      transport.setResponse(failure);
      const result = await service.execute({ template: TEMPLATE, runScripts: true, preRequestScript: "", postRequestScript: "", tests: [], buildRequest: () => builtRequest() });

      expect(result.response).toEqual(
        expect.objectContaining({ isError: true, statusCode: undefined, errorText: failure.message, dataText: "" })
      );
      expect(result.history.response?.status).toBeUndefined();
      expect(result.history.error).toBe(failure.message);
    }
  });

  it("shows the Local Bridge's own failure with the status it answered", async () => {
    transport.setResponse(new TransportError("bridge", "invalid or missing bridge token", 401));

    const result = await service.execute({ template: TEMPLATE, runScripts: true, preRequestScript: "", postRequestScript: "", tests: [], buildRequest: () => builtRequest() });

    expect(result.response).toEqual(
      expect.objectContaining({ isError: true, statusCode: 401, errorText: "invalid or missing bridge token" })
    );
  });

  it("reports the final URL of a redirected request, and an error status with no body by its status line", async () => {
    transport.setResponse({ ...envelope(200, "OK", { ok: true }), redirected: true, finalUrl: "https://example.com/end" });
    const redirected = await service.execute({ template: TEMPLATE, runScripts: true, preRequestScript: "", postRequestScript: "", tests: [], buildRequest: () => builtRequest() });
    expect(redirected.response.redirectedTo).toBe("https://example.com/end");

    transport.setResponse(envelope(404, "Not Found"));
    const missing = await service.execute({ template: TEMPLATE, runScripts: true, preRequestScript: "", postRequestScript: "", tests: [], buildRequest: () => builtRequest() });
    expect(missing.response.redirectedTo).toBeUndefined();
    expect(missing.response.errorText).toBe("Http failure response for https://example.com/data: 404 Not Found");
    expect(missing.history.error).toBe("Http failure response for https://example.com/data: 404 Not Found");
  });

  describe("history (P2.9): what is stored of an exchange", () => {
    const run = (request: Partial<BuiltRequest>, template = TEMPLATE) =>
      service.execute({ template, runScripts: true, preRequestScript: "", postRequestScript: "", tests: [], buildRequest: () => builtRequest(request) });

    it("masks every vault secret and credential in what was sent, in the request as composed and in the response", async () => {
      transport.setResponse({
        ...envelope(200, "OK", { echoed: "vault-plaintext", basic: btoa("bob:typed-password") }),
        headers: [["content-type", "application/json"], ["x-echo", "vault-plaintext"], ["set-cookie", "a=1"], ["set-cookie", "b=2"]],
        route: "bridge",
      });

      const { history } = await run(
        {
          method: "POST",
          url: "https://example.com/data?k=vault-plaintext",
          headers: [["Authorization", `Basic ${btoa("bob:typed-password")}`], ["X-Trace", "vault-plaintext"]],
          body: '{"token":"vault-plaintext"}',
          secrets: ["vault-plaintext"],
          credentials: ["typed-password"],
        },
        requestContent({ method: "POST", url: "https://example.com/data?k={{k}}", auth: { type: "basic", username: "bob", password: "typed-password" } })
      );

      const stored = JSON.stringify(history);
      expect(stored).not.toContain("vault-plaintext");
      expect(stored).not.toContain("typed-password");
      expect(history.sent).toEqual({
        method: "POST",
        url: "https://example.com/data?k=***",
        headers: [["Authorization", "***"], ["X-Trace", "***"]],
        bodyPreview: '{"token":"***"}',
      });
      expect(history.template.url).toBe("https://example.com/data?k={{k}}");
      expect(history.template.auth).toEqual({ type: "basic", username: "bob", password: "***" });
      // A repeated header is kept once per value; a credential header is masked whole.
      expect(history.response?.headers).toEqual([["content-type", "application/json"], ["x-echo", "***"], ["set-cookie", "***"], ["set-cookie", "***"]]);
      expect(history.response?.body?.text).toContain('"echoed":"***"');
      expect(history.route).toBe("bridge");
    });

    it("keeps no binary body, and describes a form or a file by names and sizes", async () => {
      transport.setResponse(envelope(200, "OK", new Uint8Array([0, 159, 146, 150]).buffer, "image/png"));
      const form = new FormData();
      form.append("note", "hello");
      form.append("upload", new File([new Uint8Array(3)], "key.pem", { type: "application/x-pem-file" }));

      const withForm = await run({ method: "POST", body: form });
      expect(withForm.history.response).toEqual({ status: 200, statusText: "OK", headers: [["content-type", "image/png"]] });
      expect(withForm.history.sent.bodyPreview).toBe("note=hello\nupload=@key.pem (3 bytes, application/x-pem-file)");

      const withFile = await run({ method: "PUT", body: new Blob([new Uint8Array(5)]) });
      expect(withFile.history.sent.bodyPreview).toBe("@file (5 bytes)");
    });

    it("records the route a failed request would have taken, masks its error text, and has no response", async () => {
      transport.setResponse(new TransportError("network", "failed"));
      const { history } = await run({ url: "https://example.com/data?k=vault-plaintext", secrets: ["vault-plaintext"] });

      expect(history.response).toBeUndefined();
      expect(history.route).toBe("direct");
      expect(history.error).toBe("Http failure response for https://example.com/data?k=***: 0 Unknown Error");
    });
  });

  it("rethrows what is not a transport failure", async () => {
    transport.send = () => Promise.reject(new RangeError("bug"));
    await expect(
      service.execute({ template: TEMPLATE, runScripts: true, preRequestScript: "", postRequestScript: "", tests: [], buildRequest: () => builtRequest() })
    ).rejects.toThrow(RangeError);
  });

  describe("scripts: the request, the scopes and pm.sendRequest (P3.3)", () => {
    const NO_CHANGES = { environment: [], collection: [], global: [] };
    type Extras = NonNullable<Parameters<ScriptSandbox["execute"]>[4]>;
    /** What the sandbox was given for the run numbered `call`. */
    const extras = (call = 0) => scriptSandbox.execute.mock.calls[call][4] as Extras;

    it("gives a script the request as composed, the three scopes and the saved request's name; what a pre-request script left of the request is what is built", async () => {
      environmentsService.setActiveEnvironment(buildEnvironment({ host: "api.test" }));
      environmentsService.globals.set(rowsOf({ g: "1" }));
      const template = requestContent({ method: "POST", url: "https://{{host}}/items", headers: rowsOf({ "X-A": "1" }) });
      scriptSandbox.setNextResult({
        logs: [],
        changes: NO_CHANGES,
        testResults: [],
        request: { method: "PUT", url: "https://{{host}}/signed", headers: [["X-A", "1"], ["X-Signed", "abc"]], body: { mode: "raw", raw: "signed" } },
      });
      const built: unknown[] = [];
      const result = await service.execute({
        template,
        runScripts: true,
        preRequestScript: "sign()",
        postRequestScript: "check()",
        tests: [],
        info: { requestName: "Create item", requestId: "req-1" },
        collection: { variables: () => rowsOf({ base: "https://{{host}}" }), change: vi.fn() },
        buildRequest: (request) => {
          built.push(request);
          return builtRequest();
        },
      });

      expect(extras(0)).toMatchObject({
        environmentName: "Test env",
        globals: [["g", "1"]],
        collection: [["base", "https://{{host}}"]],
        request: { method: "POST", url: "https://{{host}}/items", headers: [["X-A", "1"]], body: { mode: "none" } },
        info: { eventName: "prerequest", requestName: "Create item", requestId: "req-1" },
      });
      expect(built).toEqual([{ ...template, method: "PUT", url: "https://{{host}}/signed", headers: rowsOf({ "X-A": "1", "X-Signed": "abc" }), body: { mode: "raw", raw: { language: "text", text: "signed" } } }]);
      // The post-response script sees the request that was sent (P3.9: as built, not as composed), and history keeps the one the user composed.
      expect(extras(1)).toMatchObject({ request: { method: "GET", url: "https://example.com/data" }, info: { eventName: "test" } });
      expect(result.history.template).toEqual(template);
    });

    it("stores what a script changed in each scope, a removal as a removal", async () => {
      environmentsService.setActiveEnvironment(buildEnvironment({ old: "1" }));
      const change = vi.fn().mockResolvedValue(null);
      scriptSandbox.setNextResult({
        logs: [],
        changes: { environment: [{ key: "token", value: "" }, { key: "old", value: null }], collection: [{ key: "base", value: "https://b.test" }], global: [{ key: "g", value: "2" }] },
        testResults: [],
      });
      const result = await service.execute({ template: TEMPLATE, runScripts: true, preRequestScript: "set()", postRequestScript: "", tests: [], collection: { variables: () => [], change }, buildRequest: () => builtRequest() });

      // An empty value is a value (it removed the variable before P3.3).
      expect(environmentsService.changeEnvironment).toHaveBeenCalledWith("env-1", [{ key: "token", value: "", keepSecret: true }, { key: "old", value: null, keepSecret: true }]);
      expect(environmentsService.activeEnvironment()?.vars).toEqual(rowsOf({ token: "" }));
      expect(environmentsService.changeGlobals).toHaveBeenCalledWith([{ key: "g", value: "2", keepSecret: true }]);
      expect(change).toHaveBeenCalledWith([{ key: "base", value: "https://b.test", keepSecret: true }]);
      expect(result.scriptLogs).toEqual([]);
    });

    it("says so in the console when what a script set has nowhere to be kept", async () => {
      scriptSandbox.setNextResult({ logs: ["from the script"], changes: { environment: [{ key: "a", value: "1" }], collection: [{ key: "b", value: "2" }], global: [] }, testResults: [] });
      const result = await service.execute({ template: TEMPLATE, runScripts: true, preRequestScript: "set()", postRequestScript: "", tests: [], buildRequest: () => builtRequest() });
      expect(environmentsService.changeEnvironment).not.toHaveBeenCalled();
      expect(result.scriptLogs).toEqual([
        "from the script",
        "[warn] pm.environment: no environment is active, so what the script set was not kept.",
        "[warn] pm.collectionVariables: this request is in no collection, so what the script set was not kept.",
      ]);
    });

    it("a vault secret is masked in a variable a post-response script sets, in every scope", async () => {
      environmentsService.setActiveEnvironment(buildEnvironment({}));
      const change = vi.fn().mockResolvedValue(null);
      const leaked = [{ key: "leaked", value: "got vault-secret-42" }, { key: "gone", value: null }];
      scriptSandbox.setNextResult({ logs: [], changes: { environment: leaked, collection: leaked, global: leaked }, testResults: [] });
      await service.execute({ template: TEMPLATE, runScripts: true, preRequestScript: "", postRequestScript: "leak()", tests: [], collection: { variables: () => [], change }, buildRequest: () => builtRequest({ secrets: ["vault-secret-42"] }) });
      const masked = [{ key: "leaked", value: "got ***", keepSecret: true }, { key: "gone", value: null, keepSecret: true }];
      expect(environmentsService.changeEnvironment).toHaveBeenCalledWith("env-1", masked);
      expect(environmentsService.changeGlobals).toHaveBeenCalledWith(masked);
      expect(change).toHaveBeenCalledWith(masked);
    });

    /** Runs a send whose post-response script makes `request` with pm.sendRequest, and gives what the script got. */
    async function scriptSends(request: Parameters<NonNullable<Extras["send"]>>[0], signal?: AbortSignal): Promise<unknown> {
      let outcome: unknown;
      scriptSandbox.execute.mockImplementation(async (_script: string, _env: unknown, _response: unknown, _timeout: unknown, given: Extras) => {
        transport.sendRequest.mockClear();
        outcome = await given.send?.(request).catch((error: unknown) => error);
        return { logs: [], changes: NO_CHANGES, testResults: [] };
      });
      await service.execute({ template: TEMPLATE, runScripts: true, preRequestScript: "", postRequestScript: "send()", tests: [], buildRequest: () => builtRequest(), signal });
      return outcome;
    }

    it("pm.sendRequest goes out through the transport, with the user's timeout and the send's own signal, and the script gets the response", async () => {
      TestBed.inject(RequestSettings).timeoutMs.set(1500);
      transport.setResponse(envelope(201, "Created", { token: "t-1" }));
      const controller = new AbortController();
      const outcome = await scriptSends({ method: "POST", url: "https://auth.test/token", headers: [["X-A", "1"]], body: '{"grant":"x"}' }, controller.signal);

      expect(transport.sendRequest).toHaveBeenCalledExactlyOnceWith("POST", "https://auth.test/token", { "X-A": "1" }, { grant: "x" });
      expect(transport.options?.timeoutMs).toBe(1500);
      expect(transport.options?.signal).toBe(controller.signal);
      expect(outcome).toMatchObject({ code: 201, status: "Created", headers: { "content-type": "application/json" }, body: '{"token":"t-1"}', responseSize: 15 });
    });

    it("pm.sendRequest: a request that gets no response reaches the script as its error", async () => {
      transport.setResponse(new TransportError("timeout", "Timed out after 1500 ms"));
      const outcome = await scriptSends({ method: "GET", url: "https://auth.test/slow", headers: [] });
      expect(outcome).toBeInstanceOf(TransportError);
      expect((outcome as Error).message).toBe("Timed out after 1500 ms");
    });

    it.each([
      ["the address", { url: "https://auth.test/?k={{$secret.abc}}" }],
      ["the address, percent-encoded", { url: "https://auth.test/?k=%7B%7B%24secret.abc%7D%7D" }],
      ["a header", { headers: [["X-Key", "{{ $secret.abc }}"]] as [string, string][] }],
      ["a Basic header, inside the base64", { headers: [["Authorization", `Basic ${btoa("user:{{$secret.abc}}")}`]] as [string, string][] }],
      ["the body", { body: '{"key":"{{$secret.abc}}"}' }],
      ["a form body, encoded", { body: "key=%7B%7B%24secret.abc%7D%7D" }],
    ])("@claim:C-007 pm.sendRequest sends nothing when %s holds a secret's placeholder, and names the error", async (_where, part) => {
      const outcome = await scriptSends({ method: "POST", url: "https://auth.test/token", headers: [], ...part });
      expect(transport.sendRequest).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({ name: "WayfarerUnsupportedError", message: "pm.sendRequest with a vault secret is not supported — see docs/postman-compatibility.md#pm-sendrequest" });
    });
  });
});

