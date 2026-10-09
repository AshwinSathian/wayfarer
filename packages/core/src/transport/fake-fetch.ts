import type { FetchFn } from "./transport";

export interface FakeCall {
  url: string;
  init: RequestInit;
}

/** A `fetch` for specs: records each call and answers with what `reply` returns. A reply that never settles rejects when the call is aborted, as `fetch` does. */
export function fakeFetch(reply: (call: FakeCall) => Response | Promise<Response>): { fetch: FetchFn; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  return {
    calls,
    fetch: (url, init) => {
      const call = { url, init };
      calls.push(call);
      return Promise.race([
        Promise.resolve(reply(call)),
        new Promise<Response>((_, reject) => {
          const signal = init.signal;
          const abort = () => reject(signal?.reason ?? new Error("aborted"));
          if (signal?.aborted) abort();
          signal?.addEventListener("abort", abort);
        }),
      ]);
    },
  };
}

export const never = (): Promise<Response> => new Promise<Response>(() => undefined);
