import { hmac } from "@noble/hashes/hmac.js";
import { md5, sha1 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";

/**
 * The hashes, HMACs and encodings of crypto-js that run here, natively,
 * and not in the script engine, which is an interpreter (plan R3).
 *
 * Bytes cross the boundary as text: either the text itself (`utf8`) or a
 * crypto-js WordArray written as JSON, `[sigBytes, word, word, ...]`
 * (`words`). JSON is parsed and written by the engine's own native code.
 */
const HASHES = { MD5: md5, SHA1: sha1, SHA256: sha256 };

export type VmHash = keyof typeof HASHES;
export const isVmHash = (name: string): name is VmHash => Object.hasOwn(HASHES, name);

export const VM_ENCODINGS = ["utf8", "hex", "base64"] as const;
export type VmEncoding = (typeof VM_ENCODINGS)[number];

function fromWords(json: string): Uint8Array {
  const list: unknown = JSON.parse(json);
  if (!Array.isArray(list) || !list.every((entry) => typeof entry === "number")) throw new TypeError("Expected a WordArray.");
  const [length, ...words] = list as number[];
  const bytes = new Uint8Array(Math.max(0, Math.min(length, words.length * 4)));
  for (let i = 0; i < bytes.length; i++) bytes[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  return bytes;
}

function toWords(bytes: Uint8Array): string {
  const words = new Array<number>(Math.ceil(bytes.length / 4)).fill(0);
  bytes.forEach((byte, i) => (words[i >>> 2] |= byte << (24 - (i % 4) * 8)));
  return JSON.stringify([bytes.length, ...words]);
}

/** The bytes a script handed over: text as UTF-8, or a WordArray. */
function bytesOf(format: string, payload: string): Uint8Array {
  if (format === "utf8") return new TextEncoder().encode(payload);
  if (format === "words") return fromWords(payload);
  throw new TypeError("Expected utf8 or words.");
}

export function vmHash(name: VmHash, format: string, payload: string): string {
  return toWords(HASHES[name](bytesOf(format, payload)));
}

export function vmHmac(name: VmHash, keyFormat: string, key: string, format: string, payload: string): string {
  return toWords(hmac(HASHES[name], bytesOf(keyFormat, key), bytesOf(format, payload)));
}

/** `enc.<X>.parse`: text to a WordArray. As lenient as crypto-js: what is not a hex digit counts as 0, base64 may lack its padding. */
export function vmEncode(encoding: VmEncoding, text: string): string {
  if (encoding === "utf8") return toWords(new TextEncoder().encode(text));
  if (encoding === "hex") return toWords(Uint8Array.from({ length: text.length >>> 1 }, (_, i) => parseInt(text.slice(i * 2, i * 2 + 2), 16) || 0));
  return toWords(Uint8Array.from(atob(text.replace(/=+$/, "")), (char) => char.charCodeAt(0)));
}

/** `enc.<X>.stringify`: a WordArray to text. */
export function vmDecode(encoding: VmEncoding, words: string): string {
  const bytes = fromWords(words);
  if (encoding === "hex") return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (encoding === "base64") return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    // The message crypto-js gives, which scripts test for.
    throw new Error("Malformed UTF-8 data");
  }
}

/** Random bytes for the libraries that need them (uuid, crypto-js salts), as hex. */
export function vmRandom(count: number): string {
  if (!Number.isInteger(count) || count < 0 || count > 65536) throw new RangeError("Expected up to 65536 bytes.");
  return Array.from(crypto.getRandomValues(new Uint8Array(count)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
