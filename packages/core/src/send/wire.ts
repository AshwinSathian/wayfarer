/** What a request puts on the wire, as far as the check below reads it. A file's own bytes are the user's and are not read. */
export interface WireRequest {
  url: string;
  headers: [string, string][];
  body?: string | ArrayBuffer | Blob | FormData;
}

const SECRET_PLACEHOLDER = /\{\{\s*\$secret\./;

/**
 * True when a built request still carries a literal `{{$secret.<id>}}`
 * placeholder anywhere it would go on the wire (F03, claim C-007). The URL
 * is also checked form-decoded, since URL normalisation may have encoded
 * the braces, and Basic credentials base64-decoded, and those
 * form-decoded too.
 */
export function containsSecretPlaceholder(request: WireRequest): boolean {
  const wire = [
    request.url,
    formDecoded(request.url),
    JSON.stringify(request.headers),
    ...request.headers.map(([, value]) => decodeBasicCredentials(value)),
    // An OAuth 2.0 token request names its client in Basic credentials that are form-encoded first (RFC 6749, 2.3.1).
    ...request.headers.map(([, value]) => formDecoded(decodeBasicCredentials(value))),
    ...bodyTexts(request.body),
  ];
  return wire.some((text) => SECRET_PLACEHOLDER.test(text));
}

/**
 * `+` as a space and each ASCII escape decoded, one at a time: the marker is
 * ASCII, and a malformed escape elsewhere (`%zz`) must not hide the others.
 */
function formDecoded(text: string): string {
  return text
    .replaceAll("+", " ")
    .replace(/%([0-7][0-9a-f])/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * The text a body puts on the wire: itself, also form-decoded (a form
 * body encodes the braces), and every name, value and file name of a
 * multipart form. A file's own bytes are the user's and are not read.
 */
function bodyTexts(body: WireRequest["body"]): string[] {
  if (typeof body === "string") {
    return [body, formDecoded(body)];
  }
  if (body instanceof FormData) {
    return [...body].flatMap(([name, value]) => [name, typeof value === "string" ? value : value.name]);
  }
  return [];
}

/** The `user:password` inside a `Basic` header value, where base64 would hide a placeholder; "" otherwise. */
function decodeBasicCredentials(headerValue: string): string {
  const encoded = /^\s*Basic\s+(\S+)/i.exec(headerValue)?.[1];
  if (!encoded) return "";
  try {
    return atob(encoded);
  } catch (error) {
    // Not base64 (atob throws InvalidCharacterError): nothing hidden in it.
    if (!(error instanceof DOMException)) throw error;
    return "";
  }
}
