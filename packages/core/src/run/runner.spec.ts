import { describe, expect, it, vi } from "vitest";
import type { Folder, RequestDoc } from "../model/collection";
import type { Row } from "../model/request";
import { requestsInOrder, runFailed, runRequests, type RunIteration, type RunOutcome, type RunRequest } from "./runner";

const requests: RunRequest[] = ["A", "B", "C"].map((name) => ({ id: `id-${name}`, name }));
const ok: RunOutcome = { status: 200, tests: [] };
const row = (key: string, value: string): Row => ({ key, value, enabled: true });
/** A sender that answers by request name, and the names it was asked for, with their iteration. */
function sender(answers: Record<string, RunOutcome | ((iteration: RunIteration) => RunOutcome)> = {}) {
  const sent: string[] = [];
  const send = vi.fn((request: RunRequest, iteration: RunIteration): Promise<RunOutcome> => {
    sent.push(`${iteration.index}:${request.name}`);
    const answer = Object.hasOwn(answers, request.name) ? answers[request.name] : ok;
    return Promise.resolve(typeof answer === "function" ? answer(iteration) : answer);
  });
  return { send, sent };
}

describe("runRequests", () => {
  it("sends every request once, in order, and reports each result as it is there", async () => {
    const { send, sent } = sender({ B: { status: 404, statusText: "Not Found", durationMs: 12, tests: [{ name: "found", passed: false, error: "404" }] } });
    const seen: string[] = [];

    const report = await runRequests(requests, send, { onResult: (result) => seen.push(result.name) });

    expect(sent).toEqual(["0:A", "0:B", "0:C"]);
    expect(seen).toEqual(["A", "B", "C"]);
    expect(report).toEqual({
      iterations: 1,
      ended: "completed",
      results: [
        { id: "id-A", name: "A", iteration: 0, status: 200, tests: [] },
        { id: "id-B", name: "B", iteration: 0, status: 404, statusText: "Not Found", durationMs: 12, tests: [{ name: "found", passed: false, error: "404" }] },
        { id: "id-C", name: "C", iteration: 0, status: 200, tests: [] },
      ],
    });
  });

  it("runs once for each row of the data file, and gives each iteration its row", async () => {
    const rows = [[row("user", "ann")], [row("user", "bob")]];
    const { send } = sender();
    const report = await runRequests(requests.slice(0, 1), send, { data: rows });
    expect(report.iterations).toBe(2);
    expect(send.mock.calls.map(([, iteration]) => iteration)).toEqual([{ index: 0, count: 2, data: rows[0] }, { index: 1, count: 2, data: rows[1] }]);
  });

  it("with fewer iterations than rows the rest are not used, and with more the last row is used again", async () => {
    const rows = [[row("user", "ann")], [row("user", "bob")]];
    const users = async (iterations: number) => {
      const { send } = sender();
      await runRequests(requests.slice(0, 1), send, { data: rows, iterations });
      return send.mock.calls.map(([, iteration]) => iteration.data[0]?.value);
    };
    expect(await users(1)).toEqual(["ann"]);
    expect(await users(4)).toEqual(["ann", "bob", "bob", "bob"]);
  });

  it("without a data file an iteration has no data, and zero iterations send nothing", async () => {
    const { send } = sender();
    await runRequests(requests.slice(0, 1), send, { iterations: 2 });
    expect(send.mock.calls.map(([, iteration]) => iteration.data)).toEqual([[], []]);
    const none = sender();
    expect(await runRequests(requests, none.send, { iterations: 0 })).toEqual({ iterations: 0, results: [], ended: "completed" });
    expect(none.sent).toEqual([]);
  });

  it("setNextRequest names the next request by name or by id, in that iteration only", async () => {
    const byName = sender({ A: (iteration) => (iteration.index === 0 ? { ...ok, nextRequest: "C" } : ok) });
    await runRequests(requests, byName.send, { iterations: 2 });
    expect(byName.sent).toEqual(["0:A", "0:C", "1:A", "1:B", "1:C"]);

    const byId = sender({ A: { ...ok, nextRequest: "id-C" } });
    await runRequests(requests, byId.send);
    expect(byId.sent).toEqual(["0:A", "0:C"]);
  });

  it("setNextRequest may go back, and to the request itself", async () => {
    let times = 0;
    const { send, sent } = sender({ B: () => (++times < 3 ? { ...ok, nextRequest: "B" } : times === 3 ? { ...ok, nextRequest: "A" } : ok) });
    await runRequests(requests, send);
    expect(sent).toEqual(["0:A", "0:B", "0:B", "0:B", "0:A", "0:B", "0:C"]);
  });

  it("of several requests of one name the last is meant", async () => {
    const twice: RunRequest[] = [{ id: "1", name: "A" }, { id: "2", name: "X" }, { id: "3", name: "X" }, { id: "4", name: "Z" }];
    const { send } = sender({ A: { ...ok, nextRequest: "X" } });
    await runRequests(twice, send);
    expect(send.mock.calls.map(([request]) => request.id)).toEqual(["1", "3", "4"]);
  });

  it("null, and a name no request has, end the iteration and not the run", async () => {
    for (const nextRequest of [null, "Nobody"]) {
      const { send, sent } = sender({ A: (iteration) => (iteration.index === 0 ? { ...ok, nextRequest } : ok) });
      const report = await runRequests(requests, send, { iterations: 2 });
      expect(sent).toEqual(["0:A", "1:A", "1:B", "1:C"]);
      expect(report.ended).toBe("completed");
    }
  });

  it("a skipped request is in the results as skipped, and the run goes on", async () => {
    const { send } = sender({ B: { skipped: true, tests: [] } });
    const report = await runRequests(requests, send);
    expect(report.results.map((result) => [result.name, result.skipped ?? false])).toEqual([["A", false], ["B", true], ["C", false]]);
  });

  it("stop on first failure ends the run at a failed test or at a request without a response, not at a status", async () => {
    const failedTest = sender({ B: { status: 200, tests: [{ name: "t", passed: false }] } });
    expect(await runRequests(requests, failedTest.send, { stopOnFailure: true, iterations: 2 })).toMatchObject({ ended: "failed", results: [{ name: "A" }, { name: "B" }] });
    const noResponse = sender({ A: { error: "Network error", tests: [] } });
    expect((await runRequests(requests, noResponse.send, { stopOnFailure: true })).results).toHaveLength(1);
    const status = sender({ A: { status: 500, tests: [] } });
    expect((await runRequests(requests, status.send, { stopOnFailure: true })).ended).toBe("completed");
    // Without the option a failure is a result like another.
    expect((await runRequests(requests, sender({ B: { status: 200, tests: [{ name: "t", passed: false }] } }).send)).results).toHaveLength(3);
  });

  it("the sender may end the run, and the report says why", async () => {
    const { send, sent } = sender({ B: { tests: [], error: "not sent", end: "You chose not to send to other.test." } });
    expect(await runRequests(requests, send, { iterations: 3 })).toMatchObject({ ended: "ended", reason: "You chose not to send to other.test.", results: [{ name: "A" }, { name: "B", error: "not sent" }] });
    expect(sent).toEqual(["0:A", "0:B"]);
  });

  it("Cancel stops within one request: the request it met is the last, and its sender is told", async () => {
    const controller = new AbortController();
    const signals: AbortSignal[] = [];
    const send = vi.fn((request: RunRequest, _iteration: RunIteration, signal: AbortSignal): Promise<RunOutcome> => {
      signals.push(signal);
      if (request.name !== "B") return Promise.resolve(ok);
      // As a transport does: the request ends when its signal aborts.
      return new Promise((done) => signal.addEventListener("abort", () => done({ error: "The request was cancelled.", tests: [] })));
    });
    const running = runRequests(requests, send, { iterations: 5, signal: controller.signal });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    controller.abort();

    const report = await running;
    expect(report.ended).toBe("cancelled");
    expect(report.results.map((result) => result.name)).toEqual(["A", "B"]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(signals.every((signal) => signal === controller.signal)).toBe(true);
  });

  it("a run cancelled before it starts sends nothing", async () => {
    const controller = new AbortController();
    controller.abort();
    const { send, sent } = sender();
    expect(await runRequests(requests, send, { signal: controller.signal })).toEqual({ iterations: 1, results: [], ended: "cancelled" });
    expect(sent).toEqual([]);
  });

  it("waits between two requests, not before the first, and a cancel ends the wait", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const { send, sent } = sender();
      const running = runRequests(requests, send, { delayMs: 1000, signal: controller.signal });
      await vi.advanceTimersByTimeAsync(0);
      expect(sent).toEqual(["0:A"]);
      await vi.advanceTimersByTimeAsync(999);
      expect(sent).toEqual(["0:A"]);
      await vi.advanceTimersByTimeAsync(1);
      expect(sent).toEqual(["0:A", "0:B"]);
      controller.abort();
      expect((await running).ended).toBe("cancelled");
      expect(sent).toEqual(["0:A", "0:B"]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("runFailed", () => {
  it("a failed test or an error, and nothing else", () => {
    expect(runFailed({ tests: [] })).toBe(false);
    expect(runFailed({ tests: [{ name: "t", passed: true }] })).toBe(false);
    expect(runFailed({ tests: [{ name: "t", passed: true }, { name: "u", passed: false }] })).toBe(true);
    expect(runFailed({ tests: [], error: "" })).toBe(true);
  });
});

describe("requestsInOrder", () => {
  const folder = (id: string, order: number, parentFolderId?: string) => ({ id, order, parentFolderId }) as Folder;
  const request = (id: string, order: number, folderId?: string) => ({ id, name: id, order, folderId }) as RequestDoc;
  // One order for a parent's folders and requests together, as a Postman file has its items.
  const tree = {
    folders: [folder("f2", 4), folder("f1", 2), folder("f1a", 2, "f1")],
    requests: [request("top-b", 3), request("top-a", 1), request("top-c", 5), request("in-f1-b", 3, "f1"), request("in-f1-a", 1, "f1"), request("in-f1a-2", 2, "f1a"), request("in-f1a-1", 1, "f1a"), request("in-f2", 1, "f2")],
  };

  it("a collection's requests in the order of the list: a request before a folder is sent before that folder's", () => {
    expect(requestsInOrder(tree).map((doc) => doc.id)).toEqual(["top-a", "in-f1-a", "in-f1a-1", "in-f1a-2", "in-f1-b", "top-b", "in-f2", "top-c"]);
  });

  it("a folder's requests, those of its folders among them", () => {
    expect(requestsInOrder(tree, "f1").map((doc) => doc.id)).toEqual(["in-f1-a", "in-f1a-1", "in-f1a-2", "in-f1-b"]);
    expect(requestsInOrder(tree, "nowhere")).toEqual([]);
  });

  it("a folder and a request of one place: the folder first", () => {
    expect(requestsInOrder({ folders: [folder("z", 1)], requests: [request("a", 1), request("in-z", 1, "z")] }).map((doc) => doc.id)).toEqual(["in-z", "a"]);
  });

  it("two of one place are in the order of their ids", () => {
    expect(requestsInOrder({ folders: [], requests: [request("b", 1), request("a", 1)] }).map((doc) => doc.id)).toEqual(["a", "b"]);
  });
});
