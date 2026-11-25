import type { PastRequest } from "@wayfarer/core";
import { describe, expect, it } from "vitest";
import { liveExchange, recordedExchange } from "./exchange-view";

const entry = (over: Partial<PastRequest> = {}): PastRequest =>
  ({
    createdAt: 1,
    template: {},
    sent: { method: "GET", url: "http://h/x", headers: [] },
    route: "bridge",
    response: {
      status: 200,
      statusText: "OK",
      headers: [["Content-Type", "application/json"]],
      body: { text: '{"a":1}', truncated: false },
    },
    ...over,
  }) as PastRequest;

describe("ExchangeView", () => {
  it("a live view holds what it was given, with nothing missing from it", () => {
    const view = liveExchange({
      statusCode: 201,
      data: "x",
      testResults: [{ label: "t", passed: true, source: "script" }],
    });
    expect(view.kind).toBe("live");
    expect(view.statusCode).toBe(201);
    expect(view.data).toBe("x");
    expect(view.notRecorded).toEqual({ body: false, timings: false, tests: false });
    expect(view.headers).toEqual([]);
  });

  it("a recorded view is the entry as stored, and says what is not recorded", () => {
    const view = recordedExchange(entry());
    expect(view).toMatchObject({
      kind: "recorded",
      statusCode: 200,
      isError: false,
      data: '{"a":1}',
      bodyIsJson: true,
      contentType: "application/json",
      route: "bridge",
      headers: [{ name: "Content-Type", value: "application/json" }],
    });
    expect(view.notRecorded).toEqual({ body: false, timings: true, tests: true });
  });

  it("a recorded response whose body was not kept says the body is not recorded", () => {
    const view = recordedExchange(entry({ response: { status: 200, statusText: "OK", headers: [] } }));
    expect(view.notRecorded.body).toBe(true);
    expect(view.data).toBe("");
  });

  it("a recorded error status or no response puts the text in the error, not the body", () => {
    expect(
      recordedExchange(
        entry({
          response: { status: 404, statusText: "Not Found", headers: [], body: { text: "nope", truncated: false } },
        }),
      ),
    ).toMatchObject({ isError: true, data: "", error: "nope" });
    const none = recordedExchange(entry({ response: undefined, error: "refused" }));
    expect(none).toMatchObject({ isError: true, statusCode: undefined, error: "refused" });
    expect(none.notRecorded.body).toBe(false);
  });

  it("a recorded view's Sent part is the entry's sent request and the record's secrets, and says when there is no record", () => {
    const view = recordedExchange(
      entry({
        sent: { method: "POST", url: "http://h/x?k=***", headers: [["Authorization", "***"]], bodyPreview: "a=***" },
        record: {
          durationMs: 1,
          route: "bridge",
          host: "h",
          secrets: [{ name: "API key" }],
          masked: { headers: ["Authorization"], responseHeaders: [] },
          kept: { response: true, body: true },
        },
      }),
    );
    expect(view.sent).toEqual({
      method: "POST",
      address: "http://h/x?k=***",
      headers: [{ name: "Authorization", value: "***" }],
      body: { text: "a=***", shown: 5, of: 5 },
      route: "bridge",
      secrets: [{ name: "API key" }],
    });
    expect(recordedExchange(entry()).sent?.secrets).toBeNull();
    expect(liveExchange({}).sent).toBeNull();
  });
});
