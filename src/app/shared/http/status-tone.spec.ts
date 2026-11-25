import { describe, expect, it } from "vitest";
import { statusMark, statusTone } from "./status-tone";

describe("statusTone", () => {
  it("gives each class of status its colour: an error to no status, the secondary label to a 1xx", () => {
    expect([200, 204, 301, 304, 404, 429, 500, 503, 0, 101].map(statusTone)).toEqual([
      "status-2xx",
      "status-2xx",
      "status-3xx",
      "status-3xx",
      "status-4xx",
      "status-4xx",
      "status-5xx",
      "status-5xx",
      "status-5xx",
      "status-1xx",
    ]);
  });
});

describe("statusMark", () => {
  it("gives each class a glyph of its own shape and a word, so that a code is told apart without its hue", () => {
    const marks = [200, 301, 404, 500, 101].map(statusMark);
    expect(marks.map((mark) => mark.icon)).toEqual(["check_circle", "chevron_right", "error", "cancel", "info"]);
    expect(new Set(marks.map((mark) => mark.icon)).size).toBe(marks.length);
    expect(marks.map((mark) => mark.label)).toEqual([
      "Success",
      "Redirect",
      "Client error",
      "Server error",
      "Informational",
    ]);
    expect(statusMark(0).icon).toBe("cancel");
  });
});
