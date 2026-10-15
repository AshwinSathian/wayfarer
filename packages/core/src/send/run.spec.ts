import { describe, expect, it } from "vitest";
import { VariableNestingError } from "../variables/resolver";
import { PreRequestScriptError, RequestSkipped, SendBlockedError, SendDeclinedError, type ExchangeResult } from "./exchange";
import { runOutcome } from "./run";

const result = (fields: Partial<ExchangeResult> = {}): ExchangeResult => ({
  durationMs: 12,
  timings: {},
  testResults: [{ label: "ok", passed: true, source: "script" }, { label: "bad", passed: false, error: "no", source: "assertion" }],
  scriptLogs: [],
  response: { isError: false, statusCode: 201, statusText: "Created", bodyIsJson: false, dataText: "", errorText: "", headersView: [] },
  history: { createdAt: 1, template: {} as ExchangeResult["history"]["template"], sent: { method: "GET", url: "u", headers: [] }, route: "direct" },
  cookieValues: [],
  ...fields,
});

describe("runOutcome", () => {
  it("says a response in the run's words, with the exchange as history would keep it", async () => {
    const sent = result({ nextRequest: "Next" });
    expect(await runOutcome(() => Promise.resolve(sent), "declined")).toEqual({
      outcome: { status: 201, statusText: "Created", durationMs: 12, tests: [{ name: "ok", passed: true }, { name: "bad", passed: false, error: "no" }], nextRequest: "Next" },
      exchange: sent.history,
    });
  });

  it("no response: the reason is the error", async () => {
    const failed = result({ response: { isError: true, statusCode: 0, statusText: "Unknown Error", bodyIsJson: false, dataText: "", errorText: "Network error", headersView: [] }, testResults: [] });
    expect((await runOutcome(() => Promise.resolve(failed), "declined")).outcome).toMatchObject({ status: 0, error: "Network error" });
  });

  it("each refusal of a send is said, and only a refusal", async () => {
    const say = (error: Error) => runOutcome(() => Promise.reject(error), "You said no.");
    expect((await say(new RequestSkipped([{ label: "t", passed: true, source: "script" }], [], "Later"))).outcome).toEqual({ skipped: true, tests: [{ name: "t", passed: true }], nextRequest: "Later" });
    expect((await say(new SendDeclinedError("not sent"))).outcome).toEqual({ error: "not sent", tests: [], end: "You said no." });
    expect((await say(new PreRequestScriptError([], [], {}))).outcome).toEqual({ error: "The pre-request script failed, so the request was not sent.", tests: [] });
    expect((await say(new SendBlockedError("blocked"))).outcome).toEqual({ error: "blocked", tests: [] });
    expect((await say(new VariableNestingError(["a", "a"]))).outcome.error).toBeTypeOf("string");
    const other = new Error("boom");
    await expect(say(other)).rejects.toBe(other);
  });
});
