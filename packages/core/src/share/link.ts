import { ImportError } from "../import/import-error";
import { COLLECTION_FORMAT } from "../model/collection";
import { MAX_IMPORT_BYTES, parseJson } from "../safe-json";
import { fromBase64Url, toBase64Url } from "../vault/vault-crypto";

/**
 * A collection as a link (T1.1, `docs/design/teams/share.md`): the collection
 * file, compressed and encrypted with AES-GCM-256 under a random key, after
 * the `#` of the app's address, which a browser never sends to a server. The
 * key is a separate code (TQ2), or `&key=` in the fragment when the sender
 * chooses so. One shape, with no version field.
 */

const PREFIX = "#share=";
const KEY_PARAM = "key=";
const IV_BYTES = 12;
/** AES-GCM's tag: a ciphertext is never shorter. */
const TAG_BYTES = 16;
export const SHARE_CODE_BYTES = 32;
const BASE64URL = /^[\w-]+$/;

export const LINK_WRONG_CODE = "This code does not open the link. Check it with the person who sent it.";
export const LINK_DAMAGED =
  "This link is incomplete: it ends before the collection does. Ask for the whole link, or for a file.";
export const LINK_NOT_COLLECTION = "This link does not hold a Wayfarer collection.";

/** A link's two parts: what goes after `#share=`, and the code that opens it. */
export interface ShareLink {
  data: string;
  code: string;
}

/** What a link's fragment holds: the IV and the ciphertext, and the code when the sender put it in the link. */
export interface ShareFragment {
  sealed: Uint8Array<ArrayBuffer>;
  code: string | null;
}

/** The fragment of a link: `#share=<data>`, with `&key=<code>` when the code goes in the link. */
export function shareFragment({ data, code }: ShareLink, withCode: boolean): string {
  return `${PREFIX}${data}${withCode ? `&${KEY_PARAM}${code}` : ""}`;
}

/** Whether an address's fragment is a link's: anything else after `#` is not read as one. */
export const isShareFragment = (hash: string): boolean => hash.startsWith(PREFIX);

/** A code as typed: the spaces it is shown with (and any a person adds) are not part of it. */
export const typedCode = (text: string): string => text.replace(/\s+/g, "");

/** A code grouped in fours, for reading aloud. Copy gives it without the spaces. */
export const groupedCode = (code: string): string => code.replace(/(.{4})(?=.)/g, "$1 ");

/** Seals a collection file's text into a link. */
export async function encodeShareLink(text: string): Promise<ShareLink> {
  const raw = crypto.getRandomValues(new Uint8Array(SHARE_CODE_BYTES));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const compressed = await through(new TextEncoder().encode(text), new CompressionStream("deflate-raw"));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, compressed));
  return { data: toBase64Url(new Uint8Array([...iv, ...sealed])), code: toBase64Url(raw) };
}

/**
 * A link's fragment, read. A fragment from an address is untrusted: anything but `#share=<data>` with an optional
 * `&key=<code>` is refused, as is data too short to hold an IV and a tag, or a code that is not 32 bytes.
 */
export function parseShareFragment(hash: string): ShareFragment {
  if (!isShareFragment(hash)) throw new ImportError(LINK_NOT_COLLECTION);
  const [data, key, ...rest] = hash.slice(PREFIX.length).split("&");
  if (rest.length || (key !== undefined && !key.startsWith(KEY_PARAM))) throw new ImportError(LINK_NOT_COLLECTION);
  if (data.length > MAX_IMPORT_BYTES || !BASE64URL.test(data)) throw new ImportError(LINK_DAMAGED);
  const sealed = decoded(data);
  if (!sealed || sealed.length < IV_BYTES + TAG_BYTES + 1) throw new ImportError(LINK_DAMAGED);
  if (key === undefined) return { sealed, code: null };
  const code = key.slice(KEY_PARAM.length);
  if (!codeBytes(code)) throw new ImportError(LINK_DAMAGED);
  return { sealed, code };
}

/**
 * The collection file a link holds, as text for `importText`. The code is the fragment's, or the one the person typed;
 * a wrong code and a changed byte both fail AES-GCM's check, and nothing of the content is read then.
 */
export async function openShareLink({ sealed, code: inLink }: ShareFragment, typed = ""): Promise<string> {
  const code = inLink ?? typedCode(typed);
  // A code of the link that fails is the link's fault; a typed one, the code's.
  const failed = inLink ? LINK_DAMAGED : LINK_WRONG_CODE;
  const raw = codeBytes(code);
  if (!raw) throw new ImportError(failed);
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  let compressed: Uint8Array<ArrayBuffer>;
  try {
    compressed = new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.slice(0, IV_BYTES) }, key, sealed.slice(IV_BYTES)),
    );
  } catch (error) {
    throw new ImportError(failed, [], error);
  }
  let text: string;
  try {
    // Decompressed, a link may not hold more than a file to import may.
    const bytes = await through(compressed, new DecompressionStream("deflate-raw"), MAX_IMPORT_BYTES);
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new ImportError(LINK_NOT_COLLECTION, [], error);
  }
  // A link holds a Wayfarer collection and nothing else: not a cURL command or a Postman file, which `importText` reads.
  const json = parseJson(text);
  const value: unknown = json.ok ? json.value : null;
  if (typeof value !== "object" || value === null || !Object.hasOwn(value, "$id"))
    throw new ImportError(LINK_NOT_COLLECTION);
  if ((value as { $id: unknown }).$id !== COLLECTION_FORMAT) throw new ImportError(LINK_NOT_COLLECTION);
  return text;
}

/** The 32 bytes of a code, or null: base64url of exactly that length, written as `toBase64Url` writes it. */
function codeBytes(code: string): Uint8Array<ArrayBuffer> | null {
  if (!BASE64URL.test(code)) return null;
  const bytes = decoded(code);
  return bytes && bytes.length === SHARE_CODE_BYTES && toBase64Url(bytes) === code ? bytes : null;
}

function decoded(text: string): Uint8Array<ArrayBuffer> | null {
  // One character over a whole byte cannot come from `toBase64Url`; `atob` throws on it.
  if (text.length % 4 === 1) return null;
  return fromBase64Url(text);
}

/** Bytes through a (de)compression stream, stopped once the output passes `limit`. */
async function through(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
  limit = Infinity,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw new RangeError("over the limit");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
