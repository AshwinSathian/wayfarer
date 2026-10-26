import { describe, expect, it } from "vitest";
import { statusLine } from "./status-line";

describe("statusLine", () => {
  it("says the status, the time and the route of a response", () => {
    expect(statusLine({ statusCode: 200, statusText: "OK", isError: false, durationMs: 16.25, route: "direct" })).toBe(
      "200 OK, 16.3 ms, Direct",
    );
    expect(statusLine({ statusCode: 404, statusText: "Not Found", isError: true, route: "bridge" })).toBe(
      "404 Not Found, Local Bridge",
    );
    expect(statusLine({ statusCode: 204, isError: false })).toBe("204");
  });

  it("says the failure's first sentence when no response arrived", () => {
    expect(
      statusLine({ statusCode: 0, isError: true, errorText: "No response arrived. The browser does not say why." }),
    ).toBe("No response arrived.");
    expect(statusLine({ isError: true, errorText: "The request timed out after 30 s" })).toBe(
      "The request timed out after 30 s",
    );
  });

  it("is empty when nothing was sent", () => {
    expect(statusLine({ isError: false })).toBe("");
  });
});
