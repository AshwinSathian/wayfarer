import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { describe, it, beforeEach, expect, vi } from "vitest";
import type {
  Cookie,
  ResolvedRequest,
  ResponseEnvelope,
  Route,
  RoutePolicy,
  Row,
  ScriptResult,
  TransportOptions,
} from "@wayfarer/core";
import { requestContent, rowsOf } from "../../testing/request-fixtures";
import { RequestExecutor } from "./request-executor";
import { CookieJar } from "./cookie-jar";
import { TransportRouter } from "./transport-router";
import { EnvironmentsStore } from "./environments-store";
import { ResponseInspector } from "../shared/inspect/response-inspector";
import { ScriptSandbox } from "../shared/scripts/script-sandbox";
import type { EnvironmentDoc } from "@wayfarer/core";

// The order of a send, its scripts, the wire check and history are `exchange`'s, and its spec is in core
// (`packages/core/src/send/exchange.spec.ts`). This one holds the app's ports to it.

function envelope(fields: Partial<ResponseEnvelope> = {}): ResponseEnvelope {
  return {
    status: 200,
    statusText: "OK",
    headers: [],
    body: new ArrayBuffer(0),
    redirected: false,
    finalUrl: "",
    route: "direct",
    sizes: { decoded: 0 },
    ...fields,
  };
}

describe("RequestExecutor", () => {
  const result: ScriptResult = {
    logs: [],
    changes: { environment: [{ key: "n", value: "2" }], collection: [], global: [{ key: "g", value: "1" }] },
    testResults: [],
  };
  const scriptSandbox = { execute: vi.fn(async () => result) };
  const cookieJar = { for: vi.fn((_url: string): Cookie[] => []), store: vi.fn() };
  const inspector = {
    markRequest: vi.fn(),
    markResponse: vi.fn((id: string, url: string) => ({
      id,
      url,
      startTime: 0,
      startEpoch: 0,
      endTime: 1,
      duration: 1,
    })),
  };
  const active = signal<EnvironmentDoc | null>(null);
  const environments = {
    activeEnvironment: active,
    globals: signal<Row[]>([]),
    changeEnvironment: vi.fn(),
    changeGlobals: vi.fn(),
  };
  let answer: ResponseEnvelope;
  let given: TransportOptions | undefined;
  const transport = {
    route: (): Route => "direct",
    first: (): "direct" => "direct",
    send: vi.fn(async (_request: ResolvedRequest, options: TransportOptions, _policy: RoutePolicy) => {
      given = options;
      options.cookies?.for("https://api.test/");
      return answer;
    }),
  };
  let service: RequestExecutor;
  const send = () =>
    service.execute({
      template: requestContent(),
      runScripts: true,
      preRequestScript: "",
      postRequestScript: "pm.test()",
      tests: [],
      buildRequest: () => ({ method: "GET", url: "https://api.test/", headers: [], secrets: [], credentials: [] }),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    answer = envelope();
    active.set({
      id: "env-1",
      meta: { id: "env-1", createdAt: 1, updatedAt: 1 },
      name: "Env",
      order: 1,
      vars: rowsOf({ n: "1" }),
    } as EnvironmentDoc);
    TestBed.configureTestingModule({
      providers: [
        { provide: TransportRouter, useValue: transport },
        { provide: ResponseInspector, useValue: inspector },
        { provide: EnvironmentsStore, useValue: environments },
        { provide: ScriptSandbox, useValue: scriptSandbox },
        { provide: CookieJar, useValue: cookieJar },
      ],
    });
    service = TestBed.inject(RequestExecutor);
  });

  it("marks the request and its response under one id, and gives the browser's timings", async () => {
    const { inspection } = await send();
    const [id, url] = inspector.markRequest.mock.calls[0] as [string, string];
    expect(url).toBe("https://api.test/");
    expect(inspector.markResponse).toHaveBeenCalledExactlyOnceWith(id, "https://api.test/");
    expect(inspection).toMatchObject({ id, url: "https://api.test/" });
  });

  it("through the Local Bridge the timings are the bridge's: the connection was its own", async () => {
    answer = envelope({ route: "bridge", timings: { dns: 1, tcp: 2, tls: 3, ttfb: 40, content: 5 } });
    const { inspection } = await send();
    expect(inspection.phases).toEqual({ dns: 1, tcp: 2, tls: 3, ttfb: 40, content: 5 });
    expect(inspection.limitedByCors).toBe(false);
  });

  it("runs a script in the worker with the default limit, and stores what it set in the active environment and the globals", async () => {
    await send();
    expect(scriptSandbox.execute).toHaveBeenCalledWith(
      "pm.test()",
      [["n", "1"]],
      expect.objectContaining({ statusCode: 200 }),
      undefined,
      expect.objectContaining({ environmentName: "Env" }),
    );
    expect(environments.changeEnvironment).toHaveBeenCalledWith("env-1", [{ key: "n", value: "2", keepSecret: true }]);
    expect(environments.changeGlobals).toHaveBeenCalledWith([{ key: "g", value: "1", keepSecret: true }]);
  });

  it("hands the route the cookie jar", async () => {
    await send();
    expect(given?.cookies).toBeDefined();
    expect(cookieJar.for).toHaveBeenCalledWith("https://api.test/");
  });

  it("a direct answer from another origin says the browser withheld headers", async () => {
    answer = envelope({ finalUrl: "https://api.test/" });
    expect((await send()).response.headersLimited).toBe(true);
    answer = envelope({ finalUrl: location.href });
    expect((await send()).response.headersLimited).toBe(false);
  });
});
