import { describe, expect, it } from "vitest";
import { appendEnabledParams } from "./request-url.util";

const row = (key: string, value: string, enabled = true) => ({ key, value, enabled });

describe("appendEnabledParams", () => {
  it("doesn't re-append params the URL already carries (the Params tab mirrors the URL's query)", () => {
    expect(appendEnabledParams("https://api.test/a?x=1&y=2", [row("x", "1"), row("y", "2")])).toBe("https://api.test/a?x=1&y=2");
  });

  it("appends enabled rows the URL doesn't carry, e.g. after a {{baseUrl}} template resolved", () => {
    expect(appendEnabledParams("https://api.test/users", [row("page", "2"), row("off", "1", false), row("", "x")])).toBe(
      "https://api.test/users?page=2"
    );
  });

  it("keeps a repeated key when the values differ, and a deliberate duplicate pair once per row beyond the URL", () => {
    expect(appendEnabledParams("https://api.test/a?tag=x", [row("tag", "x"), row("tag", "y")])).toBe("https://api.test/a?tag=x&tag=y");
    expect(appendEnabledParams("https://api.test/a?tag=x", [row("tag", "x"), row("tag", "x")])).toBe("https://api.test/a?tag=x&tag=x");
  });
});
