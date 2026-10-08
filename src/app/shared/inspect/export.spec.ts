import { buildCurlCommand, toHar, InspectorExportEntry } from "./export";
import { describe, it, expect } from "vitest";

describe("export", () => {
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

  it("@claim:C-035 builds a minimal HAR 1.2 entry with JSON bodies", () => {
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

  it("@claim:C-035 omits non-JSON bodies and annotates with a comment", () => {
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

  it("@claim:C-035 omits a JSON body over 256 KB instead of inlining it", () => {
    const big = { data: "x".repeat(300 * 1024) };
    const small = { data: "x".repeat(1024) };
    const harFor = (body: unknown) =>
      toHar(createEntry({ res: { status: 200, statusText: "OK", headers: { "Content-Type": "application/json" }, body } })).log.entries[0];

    expect(harFor(big).response.content.text).toBeUndefined();
    expect(harFor(big).response.content.comment).toBe("omitted (size or type)");
    expect(harFor(small).response.content.text).toContain('"data"');
  });

  describe("buildCurlCommand", () => {
    it("writes a GET as the bare URL plus its headers, one argument per line", () => {
      expect(buildCurlCommand({ method: "GET", url: "https://api.test/items?a=1", headers: { Accept: "application/json", "": "skipped" } })).toBe(
        "curl \\\n  'https://api.test/items?a=1' \\\n  -H 'Accept: application/json'"
      );
    });

    it("adds the method and a JSON body for other methods", () => {
      expect(buildCurlCommand({ method: "POST", url: "https://api.test/items", headers: {}, body: { name: "a" } })).toBe(
        "curl \\\n  -X POST \\\n  'https://api.test/items' \\\n  --data-raw '{\"name\":\"a\"}'"
      );
    });

    it("escapes single quotes so a value cannot end the shell string early", () => {
      const command = buildCurlCommand({
        method: "PUT",
        url: "https://api.test/o'brien",
        headers: { "X-Note": "it's" },
        body: "name='x'; rm -rf /",
      });

      expect(command).toContain("'https://api.test/o'\\''brien'");
      expect(command).toContain("-H 'X-Note: it'\\''s'");
      expect(command).toContain("--data-raw 'name='\\''x'\\''; rm -rf /'");
    });

    it("quotes a method that is not a plain token and sends an @-body as data, not a file", () => {
      const command = buildCurlCommand({ method: "GET; touch /tmp/x", url: "https://api.test/", headers: {}, body: "@/etc/passwd" });

      expect(command).toContain("-X 'GET; touch /tmp/x'");
      expect(command).toContain("--data-raw '@/etc/passwd'");
    });

    it("leaves out an empty or absent body", () => {
      expect(buildCurlCommand({ method: "DELETE", url: "https://api.test/1", headers: {}, body: "" })).not.toContain("--data-raw");
      expect(buildCurlCommand({ method: "DELETE", url: "https://api.test/1", headers: {}, body: null })).not.toContain("--data-raw");
    });
  });
});
