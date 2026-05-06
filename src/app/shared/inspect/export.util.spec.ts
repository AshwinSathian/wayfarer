import { toHar, InspectorExportEntry } from "./export.util";

describe("export.util", () => {
  function createEntry(partial?: Partial<InspectorExportEntry>): InspectorExportEntry {
    return {
      id: "req-1",
      startedDateTime: "2024-01-01T00:00:00.000Z",
      time: 120,
      req: {
        method: "GET",
        url: "https://example.com/resource",
        headers: {},
        ...partial?.req,
      },
      res: {
        status: 200,
        statusText: "OK",
        headers: {},
        ...partial?.res,
      },
      phases: partial?.phases,
      ...partial,
    };
  }

  it("builds a minimal HAR entry with JSON bodies", () => {
    const entry = createEntry({
      req: {
        method: "POST",
        url: "https://example.com/api?foo=bar&baz=2",
        headers: { "Content-Type": "application/json", "X-Custom": "value" },
        body: { message: "hello" },
      },
      res: {
        status: 201,
        statusText: "Created",
        headers: { "Content-Type": "application/json" },
        body: { ok: true },
        sizes: {
          transferSize: 1024,
          encodedBodySize: 512,
          decodedBodySize: 2048,
        },
      },
      phases: {
        dns: 5,
        tcp: 10,
        tls: 15,
        request: 20,
        ttfb: 25,
        content: 30,
      },
    });

    const har = toHar(entry);
    expect(har.log.version).toBe("1.2");
    expect(har.log.entries.length).toBe(1);

    const harEntry = har.log.entries[0];
    expect(harEntry.request.method).toBe("POST");
    expect(harEntry.request.url).toBe("https://example.com/api?foo=bar&baz=2");
    expect(harEntry.request.postData?.mimeType).toBe("application/json");
    expect(harEntry.request.postData?.text).toContain('"message": "hello"');
    expect(harEntry.request.queryString).toEqual([
      { name: "foo", value: "bar" },
      { name: "baz", value: "2" },
    ]);

    expect(harEntry.response.status).toBe(201);
    expect(harEntry.response.content.mimeType).toBe("application/json");
    expect(harEntry.response.content.text).toContain('"ok": true');
    expect(harEntry.response.bodySize).toBe(512);

    expect(harEntry.timings.dns).toBe(5);
    expect(harEntry.timings.connect).toBe(10);
    expect(harEntry.timings.ssl).toBe(15);
    expect(harEntry.timings.wait).toBe(25);
    expect(harEntry.timings.receive).toBe(30);
  });

  it("omits non-JSON bodies and annotates with a comment", () => {
    const entry = createEntry({
      req: {
        method: "PUT",
        url: "https://example.com/upload",
        headers: { "Content-Type": "text/plain" },
        body: "plain text payload",
      },
      res: {
        status: 204,
        statusText: "No Content",
        headers: { "Content-Type": "text/plain" },
        body: "plain response",
      },
    });

    const har = toHar(entry);
    const harEntry = har.log.entries[0];

    expect(harEntry.request.postData).toBeUndefined();
    expect(harEntry.request.comment).toBe("omitted (size or type)");
    expect(harEntry.response.content.text).toBeUndefined();
    expect(harEntry.response.content.comment).toBe("omitted (size or type)");
  });

});
