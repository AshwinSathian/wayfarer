import { describe, expect, it } from "vitest";
import type { PastRequest } from "@wayfarer/core";
import { requestContent } from "../../../testing/request-fixtures";
import { exportRedactor } from "./export";
import { harText, historyExchange } from "./har-export";

// The HAR builder and its tests are in core since P4.6 (c):
// `packages/core/src/export/har.spec.ts`, which has the C-035 tests.

describe("exportRedactor (D5)", () => {
  const sent = { secrets: ["vault-plaintext"], credentials: ["typed-api-key"] };

  it("masks vault secrets and credentials by default, and keeps credentials when the export asks for them", () => {
    expect(exportRedactor(sent).text("typed-api-key vault-plaintext")).toBe("*** ***");
    expect(exportRedactor(sent, { credentials: true }).text("typed-api-key vault-plaintext")).toBe("typed-api-key ***");
  });
});

describe("a history entry as a HAR exchange (P4.6 c)", () => {
  const entry = (patch: Partial<PastRequest> = {}): PastRequest => ({
    id: 1,
    createdAt: Date.UTC(2026, 9, 11, 10, 0, 0),
    template: requestContent({
      method: "POST",
      url: "{{base}}/pets",
      body: { mode: "raw", raw: { language: "json", text: '{"name":"{{name}}"}' } },
    }),
    sent: {
      method: "POST",
      url: "https://api.test/pets",
      headers: [
        ["Authorization", "***"],
        ["Content-Type", "application/json"],
      ],
      bodyPreview: '{"name":"Rex"}',
    },
    response: {
      status: 201,
      statusText: "Created",
      headers: [["content-type", "application/json"]],
      body: { text: '{"id":7}', truncated: false },
    },
    durationMs: 42,
    route: "direct",
    ...patch,
  });

  it("is the request as it was sent, not as it was composed, with the response and the time it took", () => {
    expect(historyExchange(entry())).toEqual({
      startedAt: "2026-10-11T10:00:00.000Z",
      timeMs: 42,
      request: {
        method: "POST",
        url: "https://api.test/pets",
        headers: [
          ["Authorization", "***"],
          ["Content-Type", "application/json"],
        ],
        body: { mode: "raw", text: '{"name":"Rex"}' },
      },
      response: {
        status: 201,
        statusText: "Created",
        headers: [["content-type", "application/json"]],
        text: '{"id":7}',
      },
    });
  });

  it("a form's text is kept; a multipart form and a file are not in history, and the entry says so", () => {
    const form = entry({
      template: requestContent({ body: { mode: "urlencoded", urlencoded: [{ key: "q", value: "1", enabled: true }] } }),
      sent: { method: "POST", url: "https://api.test/", headers: [], bodyPreview: "q=1" },
    });
    expect(historyExchange(form).request.body).toEqual({ mode: "raw", text: "q=1" });
    const multipart = entry({
      template: requestContent({ body: { mode: "multipart", multipart: [] } }),
      sent: { method: "POST", url: "https://api.test/", headers: [], bodyPreview: "note (text), upload: a.bin (12 B)" },
    });
    expect(historyExchange(multipart).request.body).toEqual({ mode: "none" });
    expect(historyExchange(multipart).comment).toBe(
      "The request's body (a multipart form) is not in history and is left out.",
    );
    const file = entry({
      template: requestContent({ body: { mode: "binary", binary: { fileId: "f", fileName: "a.bin" } } }),
    });
    expect(historyExchange(file).comment).toBe("The request's body (a file) is not in history and is left out.");
    expect(
      historyExchange(
        entry({
          template: requestContent({ method: "GET" }),
          sent: { method: "GET", url: "https://api.test/", headers: [] },
        }),
      ).request.body,
    ).toEqual({ mode: "none" });
  });

  it("an entry with no response says why, and one whose body was not kept has none", () => {
    const failed = historyExchange(
      entry({ response: undefined, durationMs: undefined, error: "The request timed out." }),
    );
    expect(failed.response).toBeUndefined();
    expect([failed.timeMs, failed.comment]).toEqual([-1, "No response: The request timed out."]);
    expect(historyExchange(entry({ response: undefined })).comment).toBe("No response.");
    const binary = historyExchange(
      entry({ response: { status: 200, statusText: "OK", headers: [["content-type", "image/png"]] } }),
    );
    expect(binary.response?.text).toBeUndefined();
  });

  it("the file is a HAR 1.2 log made by this version of the app, an entry per exchange in the order given", async () => {
    const har = JSON.parse(
      await harText([
        historyExchange(entry()),
        historyExchange(
          entry({
            sent: { method: "GET", url: "https://api.test/second", headers: [] },
            template: requestContent({ method: "GET" }),
          }),
        ),
      ]),
    ) as {
      log: {
        version: string;
        creator: { name: string; version: string };
        entries: { request: { url: string; postData?: { text: string } } }[];
      };
    };
    expect(har.log.version).toBe("1.2");
    expect(har.log.creator.name).toBe("Wayfarer");
    expect(har.log.creator.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(har.log.entries.map((exchange) => exchange.request.url)).toEqual([
      "https://api.test/pets",
      "https://api.test/second",
    ]);
    expect(har.log.entries[0].request.postData?.text).toBe('{"name":"Rex"}');
  });
});
