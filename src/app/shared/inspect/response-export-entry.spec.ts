import { describe, expect, it } from "vitest";
import { buildExportEntry, BuildExportEntryInput } from "./response-export-entry";
import { ResponseInspection } from "./response-inspector";

const base: BuildExportEntryInput = {
  context: { id: "ctx-1", method: "POST", url: "https://api.test/items", headers: { Accept: "*/*", "": "dropped" }, body: { a: 1 }, exportBody: { mode: "none" }, secrets: [], credentials: [] },
  inspection: null,
  statusCode: 201,
  statusText: "Created",
  responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "", value: "dropped" }],
  isError: false,
  responseData: '{"ok":true}',
  responseError: "boom",
};

describe("buildExportEntry", () => {
  it("returns nothing without a request snapshot, a URL or a status", () => {
    expect(buildExportEntry({ ...base, context: null })).toBeNull();
    expect(buildExportEntry({ ...base, statusCode: undefined })).toBeNull();
    expect(buildExportEntry({ ...base, context: { ...base.context!, url: "" } })).toBeNull();
  });

  it("builds the entry from the request snapshot when the browser reported no timing", () => {
    const entry = buildExportEntry(base)!;

    expect(entry.id).toBe("ctx-1");
    expect(entry.time).toBe(0);
    expect(Number.isNaN(Date.parse(entry.startedDateTime))).toBe(false);
    expect(entry.req).toEqual({ method: "POST", url: "https://api.test/items", headers: { Accept: "*/*" }, body: { a: 1 } });
    expect(entry.res).toMatchObject({ status: 201, statusText: "Created", headers: { "Content-Type": "application/json" }, body: '{"ok":true}' });
  });

  it("prefers the browser's timing, and exports the error text for a failed response", () => {
    const inspection = {
      id: "insp-9",
      url: "https://api.test/from-timing",
      startEpoch: Date.UTC(2026, 0, 2, 3, 4, 5),
      duration: 42.5,
      startTime: 10,
      endTime: 60,
      sizes: { transferSize: 300, encodedBodySize: 200, decodedBodySize: 250 },
      phases: { dns: 1 },
    } as unknown as ResponseInspection;

    const entry = buildExportEntry({ ...base, inspection, isError: true, statusText: undefined })!;

    expect(entry.id).toBe("insp-9");
    expect(entry.startedDateTime).toBe("2026-01-02T03:04:05.000Z");
    expect(entry.time).toBe(42.5);
    expect(entry.res.body).toBe("boom");
    expect(entry.res.statusText).toBe("");
    expect(entry.res.sizes).toEqual(inspection.sizes);
    expect(entry.phases).toEqual(inspection.phases);

    // Without a usable duration, the time is the span between start and end.
    const spanned = buildExportEntry({ ...base, inspection: { ...inspection, duration: Number.NaN } as ResponseInspection })!;
    expect(spanned.time).toBe(50);
    // The snapshot's URL is empty: the URL the browser timed is used.
    expect(buildExportEntry({ ...base, inspection, context: { ...base.context!, url: "" } })!.req.url).toBe("https://api.test/from-timing");
  });
});
