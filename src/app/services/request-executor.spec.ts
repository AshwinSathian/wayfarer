import { TestBed } from "@angular/core/testing";
import { applyVariableChanges, type VariableChange } from "@wayfarer/core";
import { requestContent, rowsOf } from "../../testing/request-fixtures";
import {
  BinaryBody,
  TransportError,
  type ResolvedRequest,
  type ResponseEnvelope,
  type TransportOptions,
} from "@wayfarer/core";
import { signal } from "@angular/core";
import { RequestExecutor, BuiltRequest, SendBlockedError } from "./request-executor";
import { RequestSettings } from "./request-settings";
import { TransportRouter } from "./transport-router";
import { EnvironmentsStore } from "./environments-store";
import { ResponseInspector } from "../shared/inspect/response-inspector";
import { SCRIPTS_ENABLED, ScriptSandbox } from "../shared/scripts/script-sandbox";
import { AssertionRunner } from "../shared/scripts/assertion-runner";
import { EnvironmentDoc } from "../models/environments";
import { ScriptExecutionResult } from "../models/test-assertion";
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
  private nextResult: ScriptExecutionResult = { logs: [], envMutations: {}, testResults: [] };

  execute = vi.fn().mockImplementation(async () => this.nextResult);

  setNextResult(result: ScriptExecutionResult): void {
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

    const result = await service.execute({ template: TEMPLATE,
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
    await service.execute({ template: TEMPLATE,
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
    const result = await service.execute({ template: TEMPLATE,
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
    const result = await service.execute({ template: TEMPLATE,
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

    const result = await service.execute({ template: TEMPLATE,
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

    const result = await service.execute({ template: TEMPLATE,
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
      envMutations: { authToken: "fetched-token" },
      testResults: [],
    });

    let capturedEnvDuringBuild: string | undefined;
    await service.execute({ template: TEMPLATE,
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
          envMutations: {},
          testResults: [{ label: "pre check", passed: true, source: "script" as const }],
        };
      }
      return { logs: [], envMutations: {}, testResults: [] };
    });

    const result = await service.execute({ template: TEMPLATE,
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
      envMutations: {},
      testResults: [{ label: "post check", passed: true, source: "script" as const }],
    });

    const result = await service.execute({ template: TEMPLATE,
      preRequestScript: "",
      postRequestScript: "pm.test('post check', () => true);",
      tests: [],
      buildRequest: () => builtRequest(),
    });

    expect(scriptSandbox.execute).toHaveBeenCalledWith(
      "pm.test('post check', () => true);",
      expect.any(Object),
      expect.objectContaining({ statusCode: 201 }),
    );
    expect(result.testResults).toEqual([
      expect.objectContaining({ label: "post check", passed: true }),
    ]);
  });

  it("runs visual test assertions against the response and merges them into testResults", async () => {
    transport.setResponse(envelope(200, "OK", {}));

    const result = await service.execute({ template: TEMPLATE,
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
      envMutations: { counter: "2" },
      testResults: [],
    });

    await service.execute({ template: TEMPLATE,
      preRequestScript: "",
      postRequestScript: "increment",
      tests: [],
      buildRequest: () => builtRequest(),
    });

    // The change alone, for the store to apply to what is stored: not this tab's copy of the variables.
    expect(environmentsService.changeEnvironment).toHaveBeenCalledWith("env-1", [{ key: "counter", value: "2" }]);
    expect(environmentsService.activeEnvironment()?.vars).toEqual([{ key: "counter", value: "2", enabled: true }]);
  });

  describe("with scripts disabled (P0.2, #58)", () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          RequestExecutor,
          AssertionRunner,
          { provide: TransportRouter, useValue: transport },
          { provide: ResponseInspector, useValue: responseInspector },
          { provide: EnvironmentsStore, useValue: environmentsService },
          { provide: ScriptSandbox, useValue: scriptSandbox },
          { provide: SCRIPTS_ENABLED, useValue: false },
        ],
      });
      service = TestBed.inject(RequestExecutor);
    });

    it("never calls the sandbox, but still sends and runs Tests-tab assertions", async () => {
      const result = await service.execute({ template: TEMPLATE,
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
  });

  const form = (...parts: [string, string | File][]): FormData => {
    const data = new FormData();
    for (const [name, value] of parts) data.append(name, value);
    return data;
  };

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
          service.execute({ template: TEMPLATE,
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
      await service.execute({ template: TEMPLATE,
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

    const result = await service.execute({ template: TEMPLATE,
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

    await service.execute({ template: TEMPLATE, preRequestScript: "", postRequestScript: "", tests: [], buildRequest: () => builtRequest(), signal: controller.signal });

    expect(transport.options).toEqual({ signal: controller.signal, timeoutMs: 1500 });
  });

  it("measures the duration around the transport call only, not the pre-request script (F11)", async () => {
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    scriptSandbox.execute.mockImplementation(async () => {
      clock += 5000;
      return { logs: [], envMutations: {}, testResults: [] };
    });
    const send = transport.send.bind(transport);
    transport.send = (request, options) => {
      clock += 120;
      return send(request, options);
    };

    const result = await service.execute({ template: TEMPLATE,
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
      const result = await service.execute({ template: TEMPLATE, preRequestScript: "", postRequestScript: "", tests: [], buildRequest: () => builtRequest() });

      expect(result.response).toEqual(
        expect.objectContaining({ isError: true, statusCode: undefined, errorText: failure.message, dataText: "" })
      );
      expect(result.history.response?.status).toBeUndefined();
      expect(result.history.error).toBe(failure.message);
    }
  });

  it("shows the Local Bridge's own failure with the status it answered", async () => {
    transport.setResponse(new TransportError("bridge", "invalid or missing bridge token", 401));

    const result = await service.execute({ template: TEMPLATE, preRequestScript: "", postRequestScript: "", tests: [], buildRequest: () => builtRequest() });

    expect(result.response).toEqual(
      expect.objectContaining({ isError: true, statusCode: 401, errorText: "invalid or missing bridge token" })
    );
  });

  it("reports the final URL of a redirected request, and an error status with no body by its status line", async () => {
    transport.setResponse({ ...envelope(200, "OK", { ok: true }), redirected: true, finalUrl: "https://example.com/end" });
    const redirected = await service.execute({ template: TEMPLATE, preRequestScript: "", postRequestScript: "", tests: [], buildRequest: () => builtRequest() });
    expect(redirected.response.redirectedTo).toBe("https://example.com/end");

    transport.setResponse(envelope(404, "Not Found"));
    const missing = await service.execute({ template: TEMPLATE, preRequestScript: "", postRequestScript: "", tests: [], buildRequest: () => builtRequest() });
    expect(missing.response.redirectedTo).toBeUndefined();
    expect(missing.response.errorText).toBe("Http failure response for https://example.com/data: 404 Not Found");
    expect(missing.history.error).toBe("Http failure response for https://example.com/data: 404 Not Found");
  });

  describe("history (P2.9): what is stored of an exchange", () => {
    const run = (request: Partial<BuiltRequest>, template = TEMPLATE) =>
      service.execute({ template, preRequestScript: "", postRequestScript: "", tests: [], buildRequest: () => builtRequest(request) });

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
      service.execute({ template: TEMPLATE, preRequestScript: "", postRequestScript: "", tests: [], buildRequest: () => builtRequest() })
    ).rejects.toThrow(RangeError);
  });
});
