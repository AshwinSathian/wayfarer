import { describe, expect, it } from "vitest";
import { copyNote } from "./copy-note";
import { buildCurl } from "./curl";
import type { ExportSource } from "./request";

const request = (patch: Partial<ExportSource> = {}): ExportSource => ({
  method: "GET",
  url: "https://api.example.test/items",
  headers: [],
  body: { mode: "none" },
  secrets: [],
  credentials: [],
  ...patch,
});

describe("copyNote (U-050)", () => {
  it("says only what it was copied as when nothing was masked", () => {
    expect(copyNote("cURL", request(), {}, buildCurl)).toBe("Copied as cURL.");
    expect(copyNote("cURL", request(), { credentials: true }, buildCurl)).toBe("Copied as cURL, with credentials.");
  });

  it("says credentials were masked only when the copy masked some", () => {
    const bearer = request({ headers: [["Authorization", "Bearer abcdef123"]], credentials: ["abcdef123"] });
    expect(copyNote("cURL", bearer, {}, buildCurl)).toBe("Copied as cURL. Its credentials are replaced by ***.");
    expect(copyNote("cURL", bearer, { credentials: true }, buildCurl)).toBe("Copied as cURL, with credentials.");
  });

  it("says vault secrets were masked, with credentials asked for too", () => {
    const secret = request({ url: "https://api.example.test/items?key=s3cr3t-value", secrets: ["s3cr3t-value"] });
    expect(copyNote("cURL", secret, { credentials: true }, buildCurl)).toBe(
      "Copied as cURL, with credentials. Its vault secrets are replaced by ***.",
    );
    const both = request({
      ...secret,
      headers: [["Authorization", "Basic dXNlcjpwYXNz"]],
      credentials: ["dXNlcjpwYXNz"],
    });
    expect(copyNote("cURL", both, {}, buildCurl)).toBe(
      "Copied as cURL. Its credentials and vault secrets are replaced by ***.",
    );
  });

  it("says a vault secret's reference is copied as it is", () => {
    const reference = request({ headers: [["X-Trace", "{{$secret.abc}}"]] });
    expect(copyNote("JavaScript (fetch)", reference, {}, buildCurl)).toBe(
      "Copied as JavaScript (fetch). A vault secret is copied as its reference, not its value.",
    );
  });
});
