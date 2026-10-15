import { afterEach, describe, expect, it, vi } from "vitest";
import { diagnosticEntries, diagnosticsReport, recordDiagnostic, redactMessage } from "./diagnostics";

describe("diagnostics (P7.3)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps no address, no quoted text and no long token of an error's message", () => {
    expect(redactMessage('Failed to fetch https://api.test/users?key=abc123 from "Bearer s3cr3t"')).toBe("Failed to fetch <address> from \"…\"");
    expect(redactMessage("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0 was refused")).toBe("token <redacted> was refused");
    expect(redactMessage("ws://127.0.0.1:7717/relay and 'x'")).toBe("<address> and \"…\"");
    expect(redactMessage("x".repeat(500)).length).toBeLessThanOrEqual(300);
    expect(redactMessage("IDB: add operation failed.")).toBe("IDB: add operation failed.");
  });

  it("records an entry with its message redacted, and keeps the last 200", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    recordDiagnostic(new TypeError("Failed to fetch https://secret.test/x"), "send");
    expect(diagnosticEntries().at(-1)).toMatchObject({ context: "send", message: "TypeError: Failed to fetch <address>" });
    for (let index = 0; index < 250; index++) recordDiagnostic(new Error(`n${index}`), "flood");
    expect(diagnosticEntries()).toHaveLength(200);
    expect(diagnosticEntries().at(-1)?.message).toBe("Error: n249");
  });

  it("writes a report as markdown: the facts, the self-tests, the errors and the CSP violations apart", () => {
    const report = diagnosticsReport(
      [["Version", "2.5.0"], ["Commit", "abc1234"]],
      [{ name: "QuickJS", ok: true, detail: "1 + 1 = 2" }, { name: "IndexedDB", ok: false, detail: "UnknownError" }],
      [
        { at: Date.UTC(2026, 9, 14, 12, 0, 0), context: "idb: open", message: "UnknownError: forced" },
        { at: Date.UTC(2026, 9, 14, 12, 0, 1), context: "csp", message: "script-src blocked <address>" },
      ]
    );
    expect(report).toContain("| Version | 2.5.0 |");
    expect(report).toContain("- [x] QuickJS: 1 + 1 = 2");
    expect(report).toContain("- [ ] IndexedDB: UnknownError");
    expect(report).toContain("2026-10-14T12:00:00.000Z idb: open: UnknownError: forced");
    expect(report.split("## Content-Security-Policy violations")[1]).toContain("script-src blocked <address>");
    expect(report.split("## Content-Security-Policy violations")[0]).not.toContain("script-src");
  });
});
