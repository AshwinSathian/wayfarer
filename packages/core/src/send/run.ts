import type { RunOutcome } from "../run/runner";
import { VariableNestingError } from "../variables/resolver";
import type { TestResult } from "./assertions";
import {
  PreRequestScriptError,
  RequestSkipped,
  SendBlockedError,
  SendDeclinedError,
  type ExchangeResult,
  type PastRequest,
} from "./exchange";

const tests = (rows: TestResult[]): RunOutcome["tests"] =>
  rows.map((row) => ({ name: row.label, passed: row.passed, ...(row.error !== undefined && { error: row.error }) }));

/**
 * One request of a collection run (P5.2), sent by `send` (an `exchange`),
 * said in the run's words, with the exchange as history would have kept it
 * (masked), for the run's HAR. A send that was refused is said too;
 * `declined` is why the run ends when C-053's question was answered no.
 * Anything else that `send` throws is thrown.
 */
export async function runOutcome(
  send: () => Promise<ExchangeResult>,
  declined: string,
): Promise<{ outcome: RunOutcome; exchange?: PastRequest }> {
  try {
    const result = await send();
    const { response } = result;
    // No status, or the browser's 0: no response arrived, and the text says why.
    const failed = !response.statusCode;
    return {
      outcome: {
        ...(response.statusCode !== undefined && { status: response.statusCode }),
        ...(response.statusText && { statusText: response.statusText }),
        durationMs: result.durationMs,
        ...(failed && { error: response.errorText }),
        tests: tests(result.testResults),
        ...(result.nextRequest !== undefined && { nextRequest: result.nextRequest }),
      },
      exchange: result.history,
    };
  } catch (error) {
    if (error instanceof RequestSkipped)
      return {
        outcome: {
          skipped: true,
          tests: tests(error.testResults),
          ...(error.nextRequest !== undefined && { nextRequest: error.nextRequest }),
        },
      };
    if (error instanceof SendDeclinedError) return { outcome: { error: error.message, tests: [], end: declined } };
    if (error instanceof PreRequestScriptError)
      return { outcome: { error: error.message, tests: tests(error.testResults) } };
    if (error instanceof SendBlockedError || error instanceof VariableNestingError)
      return { outcome: { error: error.message, tests: [] } };
    throw error;
  }
}
