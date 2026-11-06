import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportError } from "../import/import-error";
import { MAX_IMPORT_BYTES } from "../safe-json";
import { toBase64Url, fromBase64Url } from "../vault/vault-crypto";
import {
  LINK_DAMAGED,
  LINK_NOT_COLLECTION,
  LINK_WRONG_CODE,
  SHARE_LINK_MAX_BYTES,
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

  it("opens a link that decompresses to the import limit, and stops reading one a byte past it", async () => {
    // No link of SHARE_LINK_MAX_BYTES decompresses past the limit (deflate's best is about 1,000 to 1): these are
    // built past parseShareFragment, to hold openShareLink's own limit.
    const padded = (bytes: number) => {
      const head = `{"$id":"wayfarer/collection","collection":{"name":"x","description":"`;
      return `${head}${"a".repeat(bytes - head.length - 3)}"}}`;
    };
    const under = padded(MAX_IMPORT_BYTES);
    expect(under).toHaveLength(MAX_IMPORT_BYTES);
    const link = await encodeShareLink(under);
    expect(await openShareLink({ sealed: fromBase64Url(link.data), code: null }, link.code)).toBe(under);

    const over = await encodeShareLink(padded(MAX_IMPORT_BYTES + 1));
    expect(await refusal(openShareLink({ sealed: fromBase64Url(over.data), code: null }, over.code))).toBe(
      LINK_NOT_COLLECTION,
    );

    // A bomb of 64 MB is read no further than the limit and the stream's buffer, then cancelled.
    let read = 0;
    const Original = globalThis.DecompressionStream;
    vi.stubGlobal(
      "DecompressionStream",
      class {
        private readonly inner = new Original("deflate-raw");
        readonly writable = this.inner.writable;
        readonly readable = this.inner.readable.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              read += chunk.length;
              controller.enqueue(chunk);
            },
          }),
        );
      },
    );
    const bomb = await encodeShareLink(" ".repeat(64 * 1024 * 1024));
    expect(await refusal(openShareLink({ sealed: fromBase64Url(bomb.data), code: null }, bomb.code))).toBe(
      LINK_NOT_COLLECTION,
    );
    expect(read).toBeGreaterThan(MAX_IMPORT_BYTES);
    expect(read).toBeLessThan(MAX_IMPORT_BYTES + 1024 * 1024);
  }, 30_000);

  describe("a hostile fragment", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it("throws nothing but an ImportError, for any text", () => {
      const b64 = fc.string({ unit: fc.constantFrom(..."ABCabc019-_"), maxLength: 80 });
      const piece = fc.oneof(
        b64,
        fc.constantFrom("&", "key=", "&key=", "=", "%41", "%", "%zz", "+", "/", "#share=", "\u0000"),
        fc.string({ unit: "binary", maxLength: 8 }),
      );
      const grammar = fc.array(piece, { maxLength: 12 }).map((parts) => parts.join(""));
      const anything = fc.oneof(fc.string({ unit: "binary" }), fc.string({ unit: "grapheme" }), grammar);
      const onlyImportError = (hash: string) => {
        try {
          parseShareFragment(hash);
        } catch (error) {
          expect(error).toBeInstanceOf(ImportError);
        }
      };
      fc.assert(
        fc.property(anything, (s) => {
          onlyImportError(`#share=${s}`);
          onlyImportError(s);
        }),
        { numRuns: 2_000 },
      );
    });

    it("is refused before anything is decrypted or decompressed, each in under a second", async () => {
      const link = await encodeShareLink(collection("Shop API"));
      const decrypt = vi.spyOn(crypto.subtle, "decrypt");
      let decompressors = 0;
      const Original = globalThis.DecompressionStream;
      vi.stubGlobal(
        "DecompressionStream",
        class extends Original {
          constructor(format: ConstructorParameters<typeof Original>[0]) {
            super(format);
            decompressors++;
          }
        },
      );
      const hostile = {
        "10 MB of A": `#share=${"A".repeat(MAX_IMPORT_BYTES)}`,
        "a link one byte over the longest made": `#share=${"A".repeat(SHARE_LINK_MAX_BYTES - 6)}`,
        "a million &": `#share=${link.data}${"&".repeat(1_000_000)}`,
        "a %-encoded key": `#share=${link.data}&key=${"%41".repeat(43)}`,
        "a key of 31 bytes": `#share=${link.data}&key=${toBase64Url(new Uint8Array(31))}`,
        "a key of 33 bytes": `#share=${link.data}&key=${toBase64Url(new Uint8Array(33))}`,
        "data of 4n + 1 characters": `#share=${"A".repeat(4 * 100 + 1)}`,
      };
      for (const [name, hash] of Object.entries(hostile)) {
        const start = performance.now();
        expect(() => parseShareFragment(hash), name).toThrow(ImportError);
        expect(performance.now() - start, name).toBeLessThan(1_000);
      }
      expect(decrypt).not.toHaveBeenCalled();
      expect(decompressors).toBe(0);
    });

    it("still reads a link as long as the longest one made", () => {
      const hash = `#share=${"A".repeat(SHARE_LINK_MAX_BYTES - 8)}`;
      expect(hash.length).toBeLessThanOrEqual(SHARE_LINK_MAX_BYTES);
      expect(parseShareFragment(hash).sealed.length).toBeGreaterThan(9_000);
    });
  });

  it("shows a code in fours and reads one typed with spaces", () => {
    expect(groupedCode("abcdefghij")).toBe("abcd efgh ij");
    expect(typedCode(" abcd efgh\tij ")).toBe("abcdefghij");
  });
});
