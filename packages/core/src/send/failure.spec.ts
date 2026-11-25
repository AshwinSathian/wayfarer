import { describe, expect, it } from "vitest";
import { BRIDGE_MISMATCH } from "../transport/bridge";
import { failureClass, failurePanel } from "./failure";
import type { ExchangeRecord } from "./record";

const record = (
  failure: NonNullable<ExchangeRecord["failure"]>,
  over: Partial<ExchangeRecord> = {},
): ExchangeRecord => ({
  durationMs: 1500,
  route: "direct",
  host: "api.example.com",
  secrets: [],
  masked: { headers: [], responseHeaders: [] },
  kept: { response: false, body: false },
  failure,
  ...over,
});
const bridge = (reported: string) => record({ kind: "bridge", reported, summary: reported }, { route: "bridge" });

describe("failureClass", () => {
  it("@claim:C-104 tells apart what a page and the Local Bridge can tell apart", () => {
    const cases: [ExchangeRecord, string][] = [
      [
        record({ kind: "network", reported: "Failed to fetch", summary: "The request got no response." }),
        "unreachable",
      ],
      [
        record({
          kind: "network",
          reported: "Failed to fetch",
          summary: "The request got no response: this browser is offline.",
        }),
        "offline",
      ],
      [record({ kind: "timeout", reported: "timed out", summary: "No answer." }), "timeout"],
      [record({ kind: "aborted", reported: "aborted", summary: "Stopped." }), "stopped"],
      [record({ kind: "network", reported: "Failed to fetch", summary: "x" }, { route: "bridge" }), "bridgeDown"],
      [bridge("invalid or missing bridge token"), "bridgeToken"],
      [bridge(BRIDGE_MISMATCH), "bridgeVersion"],
      [bridge("connect ECONNREFUSED 127.0.0.1:9"), "refused"],
      [bridge("getaddrinfo ENOTFOUND nope.invalid"), "notFound"],
      [bridge("self-signed certificate"), "certificate"],
      [bridge("relay request timed out"), "timeout"],
      [bridge("response body too large"), "bridgeOther"],
    ];
    for (const [rec, cls] of cases) expect(failureClass(rec), rec.failure?.reported).toBe(cls);
  });

  it("is none for a record with a response", () => {
    expect(
      failurePanel({ ...record({ kind: "network", reported: "", summary: "" }), failure: undefined }),
    ).toBeUndefined();
  });
});

describe("failurePanel", () => {
  it("gives a headline, a cause and one action each, naming the host and how long it waited", () => {
    const timeout = failurePanel(record({ kind: "timeout", reported: "timed out", summary: "No answer." }));
    expect(timeout).toMatchObject({
      headline: "No answer in 1.5 s.",
      cause: "api.example.com did not respond before the timeout.",
      action: "timeout",
    });
    const refused = failurePanel(bridge("connect ECONNREFUSED 127.0.0.1:9"));
    expect(refused).toMatchObject({
      headline: "api.example.com refused the connection.",
      action: "retry",
      reporter: "bridge",
    });
  });

  it("asks to start the Local Bridge when none is paired", () => {
    const failure = { kind: "network", reported: "Failed to fetch", summary: "x" } as const;
    expect(failurePanel(record(failure))?.next).toBe("Send through the Local Bridge");
    expect(failurePanel(record(failure, { unpaired: true }))?.next).toBe(
      "Start the Local Bridge to see the real reason:",
    );
  });
});
