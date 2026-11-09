import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonWorkerClient } from "./json-worker-client";

describe("JsonWorkerClient", () => {
  let service: JsonWorkerClient;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(JsonWorkerClient);
  });

  afterEach(() => {
    service.ngOnDestroy();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("pretty-prints with the requested indent", async () => {
    expect(await service.parsePretty('{"a":[1,2]}')).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}');
    expect(await service.parsePretty('{"a":1}', 4)).toBe('{\n    "a": 1\n}');
  });

  it("rejects text that is not JSON, and runs nothing in its place on the main thread", async () => {
    const parse = vi.spyOn(JSON, "parse");
    await expect(service.parsePretty("{nope")).rejects.toThrow();
    expect(parse.mock.calls.filter(([text]) => text === "{nope")).toHaveLength(0);
    parse.mockRestore();
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

  it("ends a worker that does not answer in time, rejects its job, and gives the next job a new one", async () => {
    let made = 0;
    let ended = 0;
    // A worker still busy with a job too large for it: it never answers.
    class Stuck {
      onmessage: unknown = null;
      onerror: unknown = null;
      constructor() {
        made++;
      }
      postMessage(): void {}
      terminate(): void {
        ended++;
      }
    }
    vi.stubGlobal("Worker", Stuck);
    vi.useFakeTimers();
    const job = service.parsePretty("[1]");
    const settled = expect(job).rejects.toThrow("Worker timed out");
    await vi.advanceTimersByTimeAsync(10_000);
    await settled;
    expect(ended).toBe(1);

    const next = service.parsePretty("[2]");
    expect(made).toBe(2);
    service.ngOnDestroy();
    await expect(next).rejects.toThrow("JsonWorkerClient destroyed");
  });

  it("fails the jobs still pending when the service is destroyed, and a later call starts a fresh worker", async () => {
    const pending = service.parsePretty('{ "a": 1 }');
    service.ngOnDestroy();
    await expect(pending).rejects.toThrow("JsonWorkerClient destroyed");
    expect(await service.parsePretty("[ 1 ]")).toBe("[\n  1\n]");
  });
});
