import { describe, expect, it } from "vitest";
import { formatMs, lineText, recordHeadline, recordLines, recordRoute, type ExchangeRecord } from "./record";

const record = (fields: Partial<ExchangeRecord> = {}): ExchangeRecord => ({
  status: { code: 200, text: "OK" },
  durationMs: 16.25,
  route: "direct",
  host: "api.example.com",
  secrets: [],
  masked: { headers: [], responseHeaders: [] },
  kept: { response: true, body: true },
  ...fields,
});

const texts = (value: ExchangeRecord, keeper?: "history" | "run") =>
  Object.fromEntries(recordLines(value, keeper).map((line) => [line.field, lineText(line)]));

describe("formatMs", () => {
  it("formats durations with more precision the smaller they are", () => {
    expect([undefined, null, 0, -3].map(formatMs)).toEqual(["—", "—", "—", "—"]);
    expect(formatMs(0.256)).toBe("0.26 ms");
    expect(formatMs(12.34)).toBe("12.3 ms");
    expect(formatMs(99.96)).toBe("100.0 ms");
    expect(formatMs(100)).toBe("100 ms");
    expect(formatMs(1234.6)).toBe("1235 ms");
  });
});

describe("the record's first line", () => {
  it("is the status, the time and the route to the host", () => {
    expect(recordHeadline(record())).toBe("200 OK, 16.3 ms, Direct to api.example.com");
    expect(recordHeadline(record({ route: "bridge", durationMs: 0, status: { code: 204, text: "" } }))).toBe(
      "204, Local Bridge to api.example.com",
    );
    expect(recordRoute(record({ route: "bridge" }))).toBe("Local Bridge to api.example.com");
  });

  it("with no response, is the app's first sentence and the route", () => {
    expect(
      recordHeadline(
        record({
          status: undefined,
          failure: { kind: "network", reported: "Failed to fetch", summary: "The request got no response." },
        }),
      ),
    ).toBe("The request got no response. Direct to api.example.com.");
    expect(recordHeadline(record({ status: undefined }))).toBe("No response. Direct to api.example.com.");
    expect(recordHeadline(record({ status: undefined, unpaired: true }))).toBe(
      "No response. Direct to api.example.com, no bridge paired.",
    );
  });
});

describe("the record's sentences", () => {
  it("say where it went, that no secret was filled, nothing masked, and what history kept", () => {
    expect(texts(record())).toEqual({
      route: "Sent from this page to api.example.com.",
      secrets: "No vault secret was filled.",
      masked: "Nothing was masked.",
      kept: "History kept the request and the response.",
    });
  });

  it("name each secret and where it is set, and list every masked part", () => {
    const lines = texts(
      record({
        route: "bridge",
        secrets: [
          { name: "token", scope: "environment", holder: 'environment "Local"' },
          { name: "key", scope: "folder" },
          { name: "{{$secret.x}}" },
        ],
        masked: {
          address: true,
          headers: ["Authorization"],
          body: true,
          responseHeaders: ["x-echo"],
          responseBody: true,
        },
        kept: { response: true, body: false },
      }),
      "run",
    );
    expect(lines).toEqual({
      route: "Sent through the Local Bridge to api.example.com.",
      secrets:
        'Filled from the vault: token, from environment "Local", key, from the folder and {{$secret.x}}. Each is *** in what is kept.',
      masked:
        "Masked with *** in what is kept: the address, Authorization, the body, x-echo of the response and the response body.",
      kept: "The run kept the request and the response's status and headers, not its body.",
    });
  });

  it("say what was reported when no response came, with the wire's words apart", () => {
    const failed = record({
      status: undefined,
      kept: { response: false, body: false },
      secrets: [{ name: "token" }, { name: "key" }],
      failure: { kind: "network", reported: "Load failed", summary: "The request got no response." },
    });
    const lines = recordLines(failed);
    expect(texts(failed)).toMatchObject({
      secrets: "Filled from the vault: token and key. Each is *** in what is kept.",
      kept: "History kept the request. No response came.",
      failure: "What was reported: Load failed",
    });
    expect(lines.find((line) => line.field === "failure")?.parts).toEqual([
      "What was reported: ",
      { wire: "Load failed" },
    ]);
    expect(lines[0].parts).toEqual(["Sent from this page to ", { wire: "api.example.com" }, "."]);
    expect(texts({ ...failed, unpaired: true })["route"]).toBe(
      "Sent from this page to api.example.com. No Local Bridge is paired.",
    );
  });
});
