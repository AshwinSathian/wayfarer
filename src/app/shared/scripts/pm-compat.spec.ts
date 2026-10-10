import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { CASES } from "@wayfarer/core/pm-compat/cases";
import { contextOf, echo, scriptOf, verdict } from "@wayfarer/core/pm-compat/harness";
import { ScriptSandbox } from "./script-sandbox";

// P3.3: every row of the compatibility matrix, run in the app's worker in a
// browser. Core runs the same rows in Node
// (packages/core/test/pm-compat/pm-compat.test.ts).
describe("Postman compatibility, in the worker", () => {
  it.each(CASES.map((row) => [row.api, row] as const))("%s", async (_api, row) => {
    const { environment, response, ...extras } = contextOf(row);
    const result = await TestBed.inject(ScriptSandbox).execute(
      scriptOf(row),
      Object.fromEntries(environment),
      response && { statusCode: response.code, statusText: response.status, body: response.body, headers: response.headers, durationMs: response.responseTime, sizeBytes: response.responseSize },
      undefined,
      { ...extras, send: echo }
    );
    expect(verdict(row, result)).toBeUndefined();
    if (row.result) expect(result).toMatchObject(row.result);
  });
});
