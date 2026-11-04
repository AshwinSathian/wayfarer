import { describe, expect, it } from "vitest";
import { statusTone } from "./status-tone";

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
