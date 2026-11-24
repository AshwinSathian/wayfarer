import { describe, expect, it } from "vitest";
import { methodGlyph } from "./method-glyph";

describe("methodGlyph", () => {
  it("is a ring for the safe methods", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) expect(methodGlyph(method)).toBe("ring");
  });

  it("is a bar for DELETE and a dot for every other token", () => {
    expect(methodGlyph("DELETE")).toBe("bar");
    for (const method of ["POST", "PUT", "PATCH", "PURGE", "X-CUSTOM"]) expect(methodGlyph(method)).toBe("dot");
  });

  it("reads a method in any case", () => {
    expect(methodGlyph("get")).toBe("ring");
    expect(methodGlyph("Delete")).toBe("bar");
    expect(methodGlyph("patch")).toBe("dot");
  });
});
