import { parseJson } from "@wayfarer/core";
import { vi } from "vitest";

interface Pending {
  url: string;
  init: RequestInit;
  resolve(response: Response): void;
  reject(error: unknown): void;
  settled: boolean;
}

/** One captured `fetch` call, read and answered the way specs used HttpTestingController's TestRequest. */
export class MockRequest {
  constructor(private readonly pending: Pending) {}

  get request() {
    const { url, init } = this.pending;
    // A text body as its JSON value, as the specs have always compared it; text that is not JSON as it is.
    const parsed = typeof init.body === "string" ? parseJson(init.body) : null;
    const body = parsed ? (parsed.ok ? parsed.value : init.body) : init.body ?? null;
    return { method: init.method, url, urlWithParams: url, headers: new Headers(init.headers), body, init };
  }

  flush(body: BodyInit | null, init: { status: number; statusText?: string; headers?: Record<string, string> }): void {
    this.pending.settled = true;
    // A Response with status 204 or 304 may not carry a body, not even an empty one.
    const empty = init.status === 204 || init.status === 304 || (body instanceof ArrayBuffer && body.byteLength === 0);
    this.pending.resolve(new Response(empty ? null : body, init));
  }

  /** Answers with a response built by the spec. */
  respond(response: Response): void {
    this.pending.settled = true;
    this.pending.resolve(response);
  }
}

/**
 * Replaces `fetch` for a spec. Each call waits until the spec answers it, and
 * rejects when its signal aborts, as `fetch` does. `verify()` puts the real
 * `fetch` back.
 */
export class FetchMock {
  private readonly calls: Pending[] = [];

  private readonly spy = vi.spyOn(globalThis, "fetch");

  constructor() {
    this.spy.mockImplementation((input, init = {}) => {
      return new Promise<Response>((resolve, reject) => {
        const pending: Pending = { url: String(input), init, resolve, reject, settled: false };
        init.signal?.addEventListener("abort", () => {
          pending.settled = true;
          reject(init.signal?.reason);
        });
        this.calls.push(pending);
      });
    });
  }

  /** The one unanswered call to `url` (or matching the predicate). */
  expectOne(match: string | ((request: { url: string }) => boolean)): MockRequest {
    const found = this.calls.filter((call) => !call.settled && (typeof match === "string" ? call.url === match : match(call)));
    if (found.length !== 1) {
      throw new Error(`Expected one request for ${String(match)}, found ${found.length}: ${this.calls.map((c) => c.url).join(", ")}`);
    }
    return new MockRequest(found[0]);
  }

  /** Fails when a call was left unanswered. */
  verify(): void {
    this.spy.mockRestore();
    const open = this.calls.filter((call) => !call.settled);
    if (open.length) {
      throw new Error(`Expected no open requests, found ${open.length}: ${open.map((c) => c.url).join(", ")}`);
    }
  }
}
