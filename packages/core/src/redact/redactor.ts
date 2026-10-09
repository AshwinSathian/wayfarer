import type { AuthConfig, RequestBody, RequestContent, Row } from "../model/request";

/** What stands where a secret or a credential was. */
export const MASK = "***";

/** A secret shorter than this is not looked for: masking every "1234" would mask ordinary text (plan R5). */
export const MIN_SECRET_LENGTH = 6;

const CREDENTIAL_HEADERS = new Set(["authorization", "proxy-authorization", "cookie", "set-cookie", "x-api-key"]);

/** A header whose whole value is a credential: the named ones, and any name that says token, secret, key or pass. */
export function isCredentialHeader(name: string): boolean {
  return CREDENTIAL_HEADERS.has(name.toLowerCase()) || /token|secret|key|pass/i.test(name);
}

export interface RedactOptions {
  /** The user asked for this export to carry credentials. Vault secrets are masked all the same. */
  credentials?: boolean;
}

function base64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")).replace(/=+$/, "");
}

/**
 * The base64 text a value gives when it stands inside longer encoded data.
 * base64 turns three bytes into four characters, so where the value starts
 * (0, 1 or 2 bytes into a group) decides its characters: three forms. The
 * characters at either end that also carry bits of the bytes around the
 * value are left out; what remains is the same whatever surrounds it.
 */
function base64Forms(text: string): string[] {
  const bytes = new TextEncoder().encode(text);
  return [0, 1, 2].map((offset) => {
    const encoded = base64(new Uint8Array([...new Uint8Array(offset), ...bytes]));
    const sharedStart = [0, 2, 3][offset];
    const sharedEnd = (offset + bytes.length) % 3 === 0 ? 0 : 1;
    return encoded.slice(sharedStart, encoded.length - sharedEnd);
  });
}

/** `value` with every character `escaped` matches percent-encoded. Half of a surrogate pair cannot be, and stays. */
function percentEncode(value: string, escaped: RegExp): string {
  return value.replace(escaped, (char) => {
    // `encodeURIComponent` leaves a few ASCII characters alone that a URL does escape in places.
    const code = char.charCodeAt(0);
    if (code < 0x80) return `%${code.toString(16).toUpperCase().padStart(2, "0")}`;
    try {
      return encodeURIComponent(char);
    } catch (error) {
      if (!(error instanceof URIError)) throw error;
      return char;
    }
  });
}

/** Every text a value can take on its way into a request or back in a response. */
function formsOf(value: string): string[] {
  const component = percentEncode(value, /[^A-Za-z0-9\-_.!~*'()]/gu);
  const json = JSON.stringify(value).slice(1, -1);
  const b64 = base64Forms(value);
  return [
    value,
    component,
    component.replace(/%[0-9A-F]{2}/g, (hex) => hex.toLowerCase()),
    // As a browser writes a value into the query and into the path of a URL
    // it sends: only what a URL cannot hold there is escaped. A server that
    // reports the URL it received reports this.
    percentEncode(value, /[^\x21\x24-\x26\x28-\x3b\x3d\x3f-\x7e]/gu),
    percentEncode(value, /[^\x21\x24-\x3b\x3d\x40-\x5f\x61-\x7a\x7c\x7e]/gu),
    // A form field: a space is "+", and a few more characters are escaped.
    new URLSearchParams({ k: value }).toString().slice(2),
    json,
    json.replace(/[\u0080-￿]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`),
    ...b64,
    ...b64.map((form) => form.replace(/\+/g, "-").replace(/\//g, "_")),
  ];
}

/**
 * Masks secrets in what is about to be stored, exported or copied (plan D5).
 *
 * It works on the output, not on where a value came from: every secret it
 * is given is looked for as text, percent-encoded, JSON-escaped and inside
 * base64, so a value that went through `btoa("user:" + secret)` or came
 * back in a response is found too. A credential header is masked whole,
 * whatever it holds.
 */
export class Redactor {
  /** Longest first: a form that holds another is masked before the shorter one can cut it. */
  private readonly needles: string[];

  /** `secrets` are the plaintexts to look for: vault values that went into the request, and its credentials. */
  constructor(secrets: Iterable<string>) {
    const forms = [...secrets].filter((secret) => secret.length >= MIN_SECRET_LENGTH).flatMap(formsOf);
    this.needles = [...new Set(forms)].filter((form) => form.length >= MIN_SECRET_LENGTH - 1).sort((a, b) => b.length - a.length);
  }

  text(text: string): string {
    return this.needles.reduce((masked, needle) => masked.replaceAll(needle, MASK), text);
  }

  /** Headers as sent or received: a credential header's value is masked whole. */
  headers(headers: [string, string][], options: RedactOptions = {}): [string, string][] {
    return headers.map(([name, value]) => [this.text(name), !options.credentials && isCredentialHeader(name) ? MASK : this.text(value)]);
  }

  /**
   * Rows of a template (headers, or variables by name): a value typed in for
   * a credential name is masked. One that holds a `{{variable}}` is not a
   * credential but a reference to one, and is kept.
   */
  rows(rows: Row[], options: RedactOptions = {}): Row[] {
    return rows.map((row) => ({ ...row, value: isCredentialHeader(row.key) ? this.credential(row.value, options) : this.text(row.value) }));
  }

  auth(auth: AuthConfig, options: RedactOptions = {}): AuthConfig {
    switch (auth.type) {
      case "bearer":
        return { ...auth, token: this.credential(auth.token, options) };
      case "basic":
        return { ...auth, password: this.credential(auth.password, options) };
      case "apikey":
        return { ...auth, value: this.credential(auth.value, options) };
      case "none":
        return auth;
    }
  }

  /** A request as the user composed it, safe to store or to write to a file. */
  template(request: RequestContent, options: RedactOptions = {}): RequestContent {
    return {
      ...request,
      url: this.text(request.url),
      params: request.params.map((row) => ({ ...row, value: this.text(row.value) })),
      headers: this.rows(request.headers, options),
      body: this.body(request.body),
      auth: this.auth(request.auth, options),
    };
  }

  private body(body: RequestBody): RequestBody {
    return {
      ...body,
      ...(body.raw && { raw: { ...body.raw, text: this.text(body.raw.text) } }),
      ...(body.urlencoded && { urlencoded: body.urlencoded.map((row) => ({ ...row, value: this.text(row.value) })) }),
      ...(body.multipart && { multipart: body.multipart.map((part) => (part.kind === "text" ? { ...part, value: this.text(part.value) } : part)) }),
    };
  }

  private credential(value: string, options: RedactOptions): string {
    if (!value || value.includes("{{")) return this.text(value);
    return options.credentials ? this.text(value) : MASK;
  }
}
