/**
 * A response body that isn't text (image, PDF, archive, ...). Kept as raw
 * bytes so the viewer can offer a lossless download instead of rendering
 * mojibake (F05).
 */
export class BinaryBody {
  constructor(
    readonly bytes: ArrayBuffer,
    readonly contentType: string
  ) {}

  get byteLength(): number {
    return this.bytes.byteLength;
  }
}

const JSON_TYPE = /json|\+json/i;
const TEXT_TYPE = /^text\/|xml|javascript|ecmascript|x-www-form-urlencoded|graphql|yaml|csv/i;

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
    } catch {
      return new BinaryBody(bytes, "");
    }
  } else if (JSON_TYPE.test(mediaType) || TEXT_TYPE.test(mediaType)) {
    text = decodeText(bytes, charsetOf(type));
  } else {
    return new BinaryBody(bytes, mediaType);
  }

  const trimmed = text.trim();
  if (JSON_TYPE.test(mediaType) || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(text);
      // A JSON `null` stays the text "null", so the viewer doesn't report an empty body.
      if (parsed !== null && (JSON_TYPE.test(mediaType) || typeof parsed === "object")) {
        return parsed;
      }
    } catch {
      // Not valid JSON: show it as the text it is.
    }
  }
  return text;
}

function charsetOf(contentType: string): string {
  const match = /;\s*charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType);
  return match?.[1] ?? "utf-8";
}

function decodeText(bytes: ArrayBuffer, charset: string): string {
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset);
  } catch {
    // Unknown charset label (TextDecoder throws RangeError): fall back to UTF-8.
    decoder = new TextDecoder("utf-8");
  }
  return decoder.decode(bytes);
}
