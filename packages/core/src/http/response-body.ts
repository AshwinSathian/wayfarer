import { parseJson } from "../safe-json";
import type { ResponseEnvelope } from "../transport/transport";

/**
 * A response body that isn't text (image, PDF, archive, ...). Kept as raw
 * bytes so the viewer can offer a lossless download instead of rendering
 * mojibake (F05).
 */
export class BinaryBody {
  constructor(
    /** A `Blob` when the body was over the display cap and never held as one buffer. */
    readonly bytes: ArrayBuffer | Blob,
    readonly contentType: string
  ) {}

  get byteLength(): number {
    return this.bytes instanceof Blob ? this.bytes.size : this.bytes.byteLength;
  }
}

const JSON_TYPE = /json|\+json/i;
const TEXT_WORDS = ["javascript", "ecmascript", "x-www-form-urlencoded", "graphql", "yaml", "csv"];

/**
 * Whether a media type is text. XML is a subtype named xml (or xml-dtd and
 * its kind) or ending in +xml (RFC 7303), not any name with those letters
 * in it: a .docx is application/vnd.openxmlformats-officedocument…, and is
 * a zip (F72). Written without a pattern: the type is the server's text,
 * and a pattern with two open ends takes time that grows with its square.
 */
function isTextType(mediaType: string): boolean {
  const type = mediaType.toLowerCase();
  const subtype = type.slice(type.indexOf("/") + 1);
  return type.startsWith("text/") || subtype === "xml" || subtype.startsWith("xml-") || subtype.endsWith("+xml") || TEXT_WORDS.some((word) => type.includes(word));
}

/**
 * Turns raw response bytes into what the viewer shows: parsed JSON, text
 * (decoded with the content-type's charset, UTF-8 by default), a
 * `BinaryBody`, or `null` for an empty body (F04, F05).
 *
 * JSON is parsed when the content-type says JSON, or when a text body parses
 * to an object or array. A JSON content-type with an invalid body stays text,
 * never Angular's `{error, text}` parse-failure wrapper.
 */
export function decodeResponseBody(
  bytes: ArrayBuffer | null | undefined,
  contentType: string | null | undefined
): unknown {
  if (!bytes || bytes.byteLength === 0) {
    return null;
  }
  const type = (contentType ?? "").trim();
  const mediaType = type.split(";")[0].trim();

  let text: string;
  if (!mediaType) {
    // No content-type: text only if the bytes are valid UTF-8.
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (error) {
      // A fatal decoder throws TypeError on invalid UTF-8: that means binary.
      if (!(error instanceof TypeError)) throw error;
      return new BinaryBody(bytes, "");
    }
  } else if (JSON_TYPE.test(mediaType) || isTextType(mediaType)) {
    text = decodeText(bytes, charsetOf(type));
  } else {
    return new BinaryBody(bytes, mediaType);
  }

  const trimmed = text.trim();
  if (JSON_TYPE.test(mediaType) || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    // Not valid JSON: show it as the text it is.
    const parsed = parseJson(text);
    // A JSON `null` stays the text "null", so the viewer doesn't report an empty body.
    if (parsed.ok && parsed.value !== null && (JSON_TYPE.test(mediaType) || typeof parsed.value === "object")) {
      return parsed.value;
    }
  }
  return text;
}

function charsetOf(contentType: string): string {
  const match = /;\s*charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType);
  return match?.[1] ?? "utf-8";
}

function decodeText(bytes: ArrayBuffer, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch (error) {
    // Unknown charset label (TextDecoder throws RangeError): fall back to UTF-8.
    if (!(error instanceof RangeError)) throw error;
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** What the viewer shows of a transport's answer. A body over the display cap is a download, whatever its type. */
export function decodeEnvelope(envelope: ResponseEnvelope): unknown {
  const contentType = envelope.headers.find(([name]) => name.toLowerCase() === "content-type")?.[1];
  if (envelope.body instanceof Blob) {
    return new BinaryBody(envelope.body, (contentType ?? "").split(";")[0].trim());
  }
  return decodeResponseBody(envelope.body, contentType);
}
