import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ImportError } from "../import/import-error";
import { toBase64Url, fromBase64Url } from "../vault/vault-crypto";
import {
  LINK_DAMAGED,
  LINK_NOT_COLLECTION,
  LINK_WRONG_CODE,
  encodeShareLink,
  groupedCode,
  isShareFragment,
  openShareLink,
  parseShareFragment,
  shareFragment,
  typedCode,
} from "./link";

const collection = (name: string) => JSON.stringify({ $id: "wayfarer/collection", collection: { name } });

/** The same text with one byte of a base64url value flipped. */
function flipped(text: string, at: number): string {
  const bytes = fromBase64Url(text);
  bytes[at] ^= 0x01;
  return toBase64Url(bytes);
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  const error: unknown = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ImportError);
  return (error as ImportError).message;
}

describe("share link", () => {
  it("decode(encode(c)) is c, through the fragment, with the code in the link or typed", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ unit: "grapheme", maxLength: 400 }), fc.boolean(), async (name, withCode) => {
        const text = collection(name);
        const link = await encodeShareLink(text);
        const parsed = parseShareFragment(shareFragment(link, withCode));
        expect(parsed.code).toBe(withCode ? link.code : null);
        expect(await openShareLink(parsed, withCode ? "" : groupedCode(link.code))).toBe(text);
      }),
      { numRuns: 40 },
    );
  });

  it("makes a 12-byte IV and a 32-byte code of their own for each link", async () => {
    const [a, b] = await Promise.all([encodeShareLink(collection("x")), encodeShareLink(collection("x"))]);
    expect(fromBase64Url(a.code)).toHaveLength(32);
    expect(a.code).not.toBe(b.code);
    expect(a.data.slice(0, 16)).not.toBe(b.data.slice(0, 16));
    // The content is compressed before it is sealed: a repetitive file makes a short link.
    const long = await encodeShareLink(collection("a".repeat(20_000)));
    expect(long.data.length).toBeLessThan(1_000);
  });

  it("refuses a byte flipped in the IV, the ciphertext or the code", async () => {
    const link = await encodeShareLink(collection("Shop API"));
    const iv = { ...link, data: flipped(link.data, 3) };
    const ciphertext = { ...link, data: flipped(link.data, 20) };
    const code = { ...link, code: flipped(link.code, 5) };
    for (const changed of [iv, ciphertext]) {
      expect(await refusal(openShareLink(parseShareFragment(shareFragment(changed, false)), link.code))).toBe(
        LINK_WRONG_CODE,
      );
      expect(await refusal(openShareLink(parseShareFragment(shareFragment(changed, true))))).toBe(LINK_DAMAGED);
    }
    expect(await refusal(openShareLink(parseShareFragment(shareFragment(link, false)), code.code))).toBe(
      LINK_WRONG_CODE,
    );
    expect(await refusal(openShareLink(parseShareFragment(shareFragment(code, true))))).toBe(LINK_DAMAGED);
  });

  it("refuses a link cut short", async () => {
    const link = await encodeShareLink(collection("Shop API"));
    const parsed = parseShareFragment(shareFragment({ ...link, data: link.data.slice(0, -8) }, false));
    expect(await refusal(openShareLink(parsed, link.code))).toBe(LINK_WRONG_CODE);
    expect(() => parseShareFragment(`#share=${link.data.slice(0, 20)}`)).toThrow(LINK_DAMAGED);
  });

  it("refuses a fragment that is not exactly #share=<data> and an optional &key=<code>", async () => {
    const link = await encodeShareLink(collection("Shop API"));
    const refused = [
      "#other=abc",
      `#share=${link.data}&key=${link.code}&x=1`,
      `#share=${link.data}&code=${link.code}`,
      `#share=${link.data}&key=`,
      `#share=${link.data}&key=${link.code}A`,
      `#share=${link.data}&key=${link.code.slice(0, -1)}`,
      `#share=${link.data}&key=${link.code.slice(0, -1)}+`,
      `#share=${link.data}=`,
      "#share=",
      `#share=${"A".repeat(10 * 1024 * 1024 + 4)}`,
    ];
    for (const hash of refused) expect(() => parseShareFragment(hash), hash).toThrow(ImportError);
    expect(isShareFragment("#share=")).toBe(true);
    expect(isShareFragment("#/share=")).toBe(false);
  });

  it("refuses a typed code that is not 32 bytes of base64url", async () => {
    const link = await encodeShareLink(collection("Shop API"));
    const parsed = parseShareFragment(shareFragment(link, false));
    for (const typed of ["", "abc", `${link.code}A`, link.code.replace(/^./, "+")])
      expect(await refusal(openShareLink(parsed, typed)), typed).toBe(LINK_WRONG_CODE);
  });

  it("opens only a Wayfarer collection: not another file importText reads", async () => {
    for (const text of ["curl https://example.com", JSON.stringify({ $id: "wayfarer/workspace" }), "[1]", "null"]) {
      const link = await encodeShareLink(text);
      expect(await refusal(openShareLink(parseShareFragment(shareFragment(link, true)))), text).toBe(
        LINK_NOT_COLLECTION,
      );
    }
  });

  it("stops reading a link that decompresses past the import limit", async () => {
    const link = await encodeShareLink(`${collection("x")}${" ".repeat(10 * 1024 * 1024)}`);
    expect(link.data.length).toBeLessThan(40_000);
    expect(await refusal(openShareLink(parseShareFragment(shareFragment(link, true))))).toBe(LINK_NOT_COLLECTION);
  });

  it("shows a code in fours and reads one typed with spaces", () => {
    expect(groupedCode("abcdefghij")).toBe("abcd efgh ij");
    expect(typedCode(" abcd efgh\tij ")).toBe("abcdefghij");
  });
});
