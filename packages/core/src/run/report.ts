import { runFailed, type RunReport, type RunResult } from "./runner";
import { runCounts, runEnding, sharedErrorHeading, sharedErrors } from "./words";

const RUN_REPORT_FORMAT = "wayfarer/run";

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
  return {
    $id: RUN_REPORT_FORMAT,
    ...info,
    iterations: report.iterations,
    ended: report.ended,
    ...(report.reason !== undefined && { reason: report.reason }),
    totals: counts(report.results),
    results: report.results,
  };
}

/**
 * Text as XML holds it, in an attribute or between tags. A character XML 1.0
 * has no way to write (a control character, half of a surrogate pair) becomes
 * U+FFFD: a test's name is the user's text and an error may be a server's.
 */
function xml(text: string): string {
  return text
    .replace(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, "�")
    .replace(
      /[&<>"\t\n\r]/g,
      (char) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\t": "&#9;", "\n": "&#10;", "\r": "&#13;" })[char] ??
        char,
    );
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
      test.passed
        ? `    <testcase name="${xml(test.name)}" classname="${classname}"/>`
        : `    <testcase name="${xml(test.name)}" classname="${classname}">\n      <failure type="AssertionFailure" message="${xml(test.error ?? "")}"/>\n    </testcase>`,
    );
    if (result.error !== undefined)
      cases.push(
        `    <testcase name="${classname}" classname="${classname}">\n      <error type="Error" message="${xml(result.error)}"/>\n    </testcase>`,
      );
    if (result.skipped)
      cases.push(
        `    <testcase name="${classname}" classname="${classname}">\n      <skipped message="pm.execution.skipRequest()"/>\n    </testcase>`,
      );
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

/**
 * The app's colours for the report (D4.9): its canvas, its labels and its status texts, light and dark. They are the
 * tokens' values as `src/design-system/tokens.ts` has them; `scripts/run-report.test.mjs` holds them equal. The core
 * reads no stylesheet of the app.
 */
const REPORT_COLOURS = {
  light: {
    canvas: "#FBFAF8",
    panel: "#F6F5F2",
    primary: "#26231E",
    secondary: "#55524D",
    tertiary: "#726F69",
    line: "#DEDAD3",
    error: "#A51F1E",
  },
  dark: {
    canvas: "#161513",
    panel: "#22211E",
    primary: "#EBE9E4",
    secondary: "#C0BDB6",
    tertiary: "#9A9790",
    line: "#423F39",
    error: "#F7958A",
  },
} as const;

/** Text as HTML holds it, between tags or in an attribute: a name is the user's and an error may be a server's. */
function html(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}

const palette = (colours: Record<string, string>) =>
  Object.entries(colours)
    .map(([name, value]) => `--${name}: ${value};`)
    .join(" ");

/**
 * A run as one HTML page, in the app's words and colours (D4.9): how it ended, its counts, each error several requests
 * shared said once, and the run view's table. It holds no script and loads nothing: every value is escaped text, and
 * its style is in the page.
 */
export function runReportHtml(report: RunReport, info: RunInfo): string {
  const shared = sharedErrors(report.results);
  const sharedNote = (error: string) => {
    const index = shared.findIndex((entry) => entry.error === error);
    return index < 0 ? error : shared.length === 1 ? "Same error as above" : `Same error as ${index + 1} above`;
  };
  const rows = report.results
    .map((result, index) => {
      const failed = result.tests.filter((test) => !test.passed);
      const problems = [
        ...(result.error === undefined ? [] : [sharedNote(result.error)]),
        ...failed.map((test) => (test.error ? `${test.name}: ${test.error}` : test.name)),
      ];
      const status = result.skipped
        ? "Skipped"
        : result.status
          ? `${result.status} ${result.statusText ?? ""}`.trim()
          : "No response";
      return `<tr${runFailed(result) ? ' class="failed"' : ""}>
<td>${index + 1}</td><td>${result.iteration + 1}</td>
<td>${html(result.name)}${problems.map((problem) => `<p class="problem">${html(problem)}</p>`).join("")}</td>
<td>${html(status)}</td><td>${result.durationMs === undefined ? "—" : `${result.durationMs} ms`}</td>
<td>${result.tests.length ? `${result.tests.length - failed.length} of ${result.tests.length} passed` : "—"}</td>
</tr>`;
    })
    .join("\n");
  const sharedBlocks = shared
    .map(
      ({ error, count }, index) =>
        `<p class="shared">${shared.length > 1 ? `<b>${index + 1}.</b> ` : ""}<b>${html(sharedErrorHeading(count))}</b> ${html(error)}</p>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Run ${html(info.name)}</title>
<style>
:root { color-scheme: light dark; ${palette(REPORT_COLOURS.light)} }
@media (prefers-color-scheme: dark) { :root { ${palette(REPORT_COLOURS.dark)} } }
body { margin: 0; padding: 24px 16px; background: var(--canvas); color: var(--primary);
  font: 14px/1.5 "Atkinson Hyperlegible Next", system-ui, sans-serif; }
main { max-width: 1100px; margin: 0 auto; }
h1 { margin: 0 0 4px; font-size: 1.375rem; font-weight: 600; }
.meta, .counts { margin: 0 0 16px; color: var(--secondary); }
.shared { margin: 0 0 12px; padding: 10px 14px; border: 1px solid var(--error); border-radius: 8px; color: var(--error); }
table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
th { text-align: start; font-weight: 500; color: var(--tertiary); }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; overflow-wrap: anywhere; }
td:nth-child(4), td:nth-child(5) { font-family: "JetBrains Mono", ui-monospace, monospace; }
.problem { margin: 4px 0 0; color: var(--error); font-size: 0.75rem; }
tr.failed td:first-child { box-shadow: inset 2px 0 0 var(--error); }
</style>
</head>
<body>
<main>
<h1>Run ${html(info.name)}</h1>
<p class="meta">Started ${html(info.startedAt)}</p>
<p class="counts">${html(runEnding(report))} ${html(runCounts(report))}</p>
${sharedBlocks}
<table>
<thead><tr><th scope="col">#</th><th scope="col">Iteration</th><th scope="col">Request</th><th scope="col">Status</th><th scope="col">Time</th><th scope="col">Tests</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</main>
</body>
</html>
`;
}
