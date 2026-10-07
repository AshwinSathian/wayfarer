import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiagnosticsService } from "../../services/diagnostics.service";
import { JsonWorkerService } from "./json-worker.service";

describe("JsonWorkerService", () => {
  let service: JsonWorkerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(JsonWorkerService);
  });

  afterEach(() => {
    service.ngOnDestroy();
    vi.unstubAllGlobals();
  });

  // Both paths must give the same answers: the worker is an optimisation,
  // and the inline fallback is what runs wherever a worker is unavailable or
  // fails to load. "worker when it loads" does not prove the worker ran: on
  // CI it fails to load and the service falls back (see #109).
  for (const mode of ["worker when it loads", "inline fallback"] as const) {
    describe(mode, () => {
      beforeEach(() => {
        if (mode === "inline fallback") vi.stubGlobal("Worker", undefined);
      });

      it("pretty-prints with the requested indent", async () => {
        expect(await service.parsePretty('{"a":[1,2]}')).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}');
        expect(await service.parsePretty('{"a":1}', 4)).toBe('{\n    "a": 1\n}');
      });

      it("minifies", async () => {
        expect(await service.minify('{\n  "a": [1, 2],\n  "b": "x y"\n}')).toBe('{"a":[1,2],"b":"x y"}');
      });

      it("rejects text that is not JSON", async () => {
        await expect(service.parsePretty("{nope")).rejects.toThrow();
        await expect(service.minify("")).rejects.toThrow();
      });

      it("searches case-insensitively and reports each match with its context", async () => {
        const input = 'alpha "Token": 1, beta "token": 2';
        const result = await service.search(input, "  TOKEN ");
        expect(result.count).toBe(2);
        expect(result.excerpts.map((e) => e.index)).toEqual([input.indexOf("Token"), input.indexOf("token")]);
        expect(result.excerpts[0].context).toContain("Token");
      });

      it("finds nothing for a blank or absent query, and stops at 50 matches", async () => {
        expect(await service.search("abc", "   ")).toEqual({ count: 0, excerpts: [] });
        expect(await service.search("abc", "zzz")).toEqual({ count: 0, excerpts: [] });
        expect((await service.search("x ".repeat(80), "x")).count).toBe(50);
      });
    });
  }

  it("records a failed worker job and still answers inline", async () => {
    const record = vi.spyOn(TestBed.inject(DiagnosticsService), "record");
    // The worker rejects invalid JSON (or fails to load); the service then
    // retries inline, which throws the parse error the caller sees.
    await expect(service.parsePretty("{nope")).rejects.toThrow(SyntaxError);
    expect(record).toHaveBeenCalledWith(expect.any(Error), "json worker: job failed, running it inline");
  });

  it("fails jobs that are still pending when the service is destroyed, then answers them inline", async () => {
    const pending = service.minify('{ "a": 1 }');
    service.ngOnDestroy();
    expect(await pending).toBe('{"a":1}');
    // A later call starts a fresh worker.
    expect(await service.minify("[ 1 ]")).toBe("[1]");
  });
});
