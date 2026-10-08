import { describe, expect, it } from "vitest";
import { buildAuthHeaders } from "./request-auth.util";

describe("buildAuthHeaders", () => {
  it("encodes Basic credentials as UTF-8 (RFC 7617), so non-Latin-1 text does not throw", () => {
    const { Authorization } = buildAuthHeaders({ type: "basic", basic: { username: "jos\u00e9", password: "p\u00e4ss\u20ac" } });

    const bytes = Uint8Array.from(atob(Authorization.slice("Basic ".length)), (c) => c.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe("jos\u00e9:p\u00e4ss\u20ac");
  });

  it("keeps ASCII credentials byte-for-byte", () => {
    expect(buildAuthHeaders({ type: "basic", basic: { username: "user", password: "pass" } })).toEqual({
      Authorization: `Basic ${btoa("user:pass")}`,
    });
  });
});
