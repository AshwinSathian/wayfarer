import { describe, expect, it } from "vitest";
import { runReportHtml } from "./report";
import type { RunReport } from "./runner";

const report: RunReport = {
  iterations: 1,
  ended: "completed",
  results: [
    {
      id: "1",
      name: "Fine",
      iteration: 0,
      status: 200,
      statusText: "OK",
      durationMs: 12,
      tests: [{ name: "is 200", passed: true }],
    },
    { id: "2", name: '<img src=x onerror="alert(1)">', iteration: 0, error: "Refused <b>", tests: [] },
    {
      id: "3",
      name: "Gone",
      iteration: 0,
      error: "Refused <b>",
      tests: [{ name: "has a body", passed: false, error: "no body" }],
    },
  ],
};

describe("runReportHtml (D4.9)", () => {
  const page = runReportHtml(report, { name: "Shop & co", startedAt: "2026-11-03T10:00:00.000Z" });

  it("says what the run view says: the ending, the counts and a shared error once", () => {
    expect(page).toContain("<title>Run Shop &amp; co</title>");
    expect(page).toContain("The run is complete. 3 results in 1 iteration; 2 failed; 1 of 2 tests passed.");
    expect(page).toContain("<b>2 requests failed with the same error.</b> Refused &lt;b&gt;");
    expect(page.match(/Same error as above/g)).toHaveLength(2);
    expect(page).toContain('<p class="problem">has a body: no body</p>');
    expect(page).toContain("<td>200 OK</td>");
    expect(page).toContain("<td>No response</td>");
  });

  it("holds no script and nothing it does not escape: a name or an error is text", () => {
    expect(page).not.toMatch(/<script|<img|onerror="/i);
    expect(page).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(page).toContain(`content="default-src 'none'; style-src 'unsafe-inline'"`);
  });
});
