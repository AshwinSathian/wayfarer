import { describe, expect, it } from "vitest";
import { scriptDigest, scriptsApproved, scriptsOf } from "./trust";

describe("script trust", () => {
  it("a digest is the SHA-256 of the text, in hex", async () => {
    // The published test vector for "abc".
    expect(await scriptDigest("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await scriptDigest("pm.test('é', () => {});")).toHaveLength(64);
  });

  it("the digest changes when any character of a script changes", async () => {
    const digests = await Promise.all(["pm.test('a')", "pm.test('a') ", "pm.test('b')", "PM.test('a')"].map(scriptDigest));
    expect(new Set(digests).size).toBe(4);
  });

  it("only scripts that are not blank count", () => {
    expect(scriptsOf({ scripts: { pre: "", post: "  \n" } })).toEqual([]);
    expect(scriptsOf({ scripts: { pre: "a()", post: " b() " } })).toEqual(["a()", " b() "]);
  });

  it("a request with no script needs no approval, in any collection", async () => {
    expect(await scriptsApproved(undefined, [])).toBe(true);
    expect(await scriptsApproved({ trusted: false }, [])).toBe(true);
  });

  it("a script runs only when the collection is trusted and holds that script's digest", async () => {
    const reviewed = "pm.test('reviewed', () => {});";
    const approved = [await scriptDigest(reviewed)];
    expect(await scriptsApproved({ trusted: true, approved }, [reviewed])).toBe(true);
    // Another script in the same request, or the same one changed, is not covered.
    expect(await scriptsApproved({ trusted: true, approved }, [reviewed, "other()"])).toBe(false);
    expect(await scriptsApproved({ trusted: true, approved }, [`${reviewed} fetchSecrets();`])).toBe(false);
    // The list alone is not trust: an import clears `trusted`.
    expect(await scriptsApproved({ trusted: false, approved }, [reviewed])).toBe(false);
    // A collection stored before P3.8 has no list, and no collection at all approves nothing.
    expect(await scriptsApproved({ trusted: true }, [reviewed])).toBe(false);
    expect(await scriptsApproved(undefined, [reviewed])).toBe(false);
  });
});
