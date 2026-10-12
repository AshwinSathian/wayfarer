import type { RunReport, RunResult } from "./runner";

const RUN_REPORT_FORMAT = "wayfarer/run/1";

/** What a report says of the run besides its results. */
export interface RunInfo {
  /** The collection, or the collection and the folder. */
  name: string;
  /** ISO 8601. */
  startedAt: string;
}

const counts = (results: RunResult[]) => ({
  requests: results.filter((result) => !result.skipped).length,
  skipped: results.filter((result) => result.skipped).length,
  tests: results.reduce((sum, result) => sum + result.tests.length, 0),
  failedTests: results.reduce((sum, result) => sum + result.tests.filter((test) => !test.passed).length, 0),
  errors: results.filter((result) => result.error !== undefined).length,
});

/** A run as a JSON document: what the table showed, and its totals. */
export function runReportJson(report: RunReport, info: RunInfo): Record<string, unknown> {
  return { $id: RUN_REPORT_FORMAT, ...info, iterations: report.iterations, ended: report.ended, ...(report.reason !== undefined && { reason: report.reason }), totals: counts(report.results), results: report.results };
}

/**
 * Text as XML holds it, in an attribute or between tags. A character XML 1.0
 * has no way to write (a control character, half of a surrogate pair) becomes
 * U+FFFD: a test's name is the user's text and an error may be a server's.
 */
function xml(text: string): string {
  return text
    .replace(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, "�")
    .replace(/[&<>"\t\n\r]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\t": "&#9;", "\n": "&#10;", "\r": "&#13;" })[char] ?? char);
}

const seconds = (ms: number | undefined) => ((ms ?? 0) / 1000).toFixed(3);

/**
 * A run as JUnit XML, as CI servers read it (Jenkins' `junit-10.xsd`; a test
 * validates against it). A suite is one request of one iteration and a case
 * one of its tests. A request with no response, or whose script ended in an
 * error, has a case of its own with an `<error>`; a skipped one a `<skipped>`.
 */
export function junitXml(report: RunReport, info: RunInfo): string {
  const suites = report.results.map((result) => {
    const classname = xml(result.name);
    const cases = result.tests.map((test) =>
      test.passed ? `    <testcase name="${xml(test.name)}" classname="${classname}"/>` : `    <testcase name="${xml(test.name)}" classname="${classname}">\n      <failure type="AssertionFailure" message="${xml(test.error ?? "")}"/>\n    </testcase>`
    );
    if (result.error !== undefined) cases.push(`    <testcase name="${classname}" classname="${classname}">\n      <error type="Error" message="${xml(result.error)}"/>\n    </testcase>`);
    if (result.skipped) cases.push(`    <testcase name="${classname}" classname="${classname}">\n      <skipped message="pm.execution.skipRequest()"/>\n    </testcase>`);
    const totals = counts([result]);
    const name = xml(report.iterations > 1 ? `${result.name} (iteration ${result.iteration + 1})` : result.name);
    const open = `  <testsuite name="${name}" id="${xml(result.id)}" tests="${cases.length}" failures="${totals.failedTests}" errors="${totals.errors}" skipped="${totals.skipped}" time="${seconds(result.durationMs)}"`;
    return cases.length ? `${open}>\n${cases.join("\n")}\n  </testsuite>` : `${open}/>`;
  });
  const totals = counts(report.results);
  const time = seconds(report.results.reduce((sum, result) => sum + (result.durationMs ?? 0), 0));
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuites name="${xml(info.name)}" tests="${totals.tests + totals.errors + totals.skipped}" failures="${totals.failedTests}" errors="${totals.errors}" time="${time}">`,
    ...suites,
    `</testsuites>`,
    "",
  ].join("\n");
}
