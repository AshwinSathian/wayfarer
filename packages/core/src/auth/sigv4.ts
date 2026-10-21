/** What AWS Signature Version 4 signs with. A session token is empty when there is none. */
export interface SigV4Credentials {
  accessKey: string;
  secretKey: string;
  sessionToken: string;
  region: string;
  service: string;
}

/** The request as it will be sent: the address as the browser sends it, the headers to sign besides Host, and the body's bytes. */
export interface SigV4Request {
  method: string;
  url: string;
  headers: readonly (readonly [string, string])[];
  body?: string | Uint8Array;
}

export interface SigV4Signed {
  /** The headers to add to the request: the date, the token, the body's hash for S3, and `Authorization`. */
  headers: [string, string][];
  canonicalRequest: string;
  stringToSign: string;
  signature: string;
}

const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
// WebCrypto, which a browser and Node both have: the page then carries no SHA-256 of its own.
const sha256 = async (data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", data));
const hmac = async (key: Uint8Array<ArrayBuffer>, data: string): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
      utf8(data),
    ),
  );
const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
/** RFC 3986: everything but letters, digits, `-`, `.`, `_` and `~` is percent-encoded. `encodeURIComponent` leaves five more. */
const encode = (text: string): string =>
  encodeURIComponent(text).replace(/[!'()*]/g, (mark) => `%${mark.charCodeAt(0).toString(16).toUpperCase()}`);
/** Percent-encoded text as the text it stands for. What is not percent-encoded text is read as written. */
const decode = (text: string): string => {
  try {
    return decodeURIComponent(text);
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    return text;
  }
};

/**
 * AWS Signature Version 4, in a request's headers. It signs the request as
 * a browser sends it: the address as `URL` writes it, `Host` as the browser
 * will set it, and the body's bytes.
 *
 * The path is encoded once more, as AWS does with the path it receives, and
 * empty segments are dropped; for S3 it is the path as sent, and the body's
 * hash is a header too, as S3 asks. The query is sorted by name and value,
 * each encoded strictly.
 */
export async function signV4(request: SigV4Request, credentials: SigV4Credentials, at: Date): Promise<SigV4Signed> {
  const url = new URL(request.url);
  // ponytail: S3 by its one name. Another service that wants its path as sent or the body's hash as a header (`s3express`, `s3-outposts`) needs its name here.
  const s3 = credentials.service === "s3";
  const segments = url.pathname.split("/");
  const kept = segments.filter(Boolean);
  const path = s3
    ? segments.map((segment) => encode(decode(segment))).join("/")
    : `/${kept.map(encode).join("/")}${kept.length && url.pathname.endsWith("/") ? "/" : ""}`;
  const query = url.search
    .slice(1)
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const cut = pair.indexOf("=");
      return [
        encode(decode(cut === -1 ? pair : pair.slice(0, cut))),
        encode(decode(cut === -1 ? "" : pair.slice(cut + 1))),
      ];
    })
    .sort(([keyA, valueA], [keyB, valueB]) =>
      keyA === keyB ? (valueA < valueB ? -1 : valueA > valueB ? 1 : 0) : keyA < keyB ? -1 : 1,
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const date = at.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const day = date.slice(0, 8);
  const body = typeof request.body === "string" ? utf8(request.body) : new Uint8Array(request.body ?? []);
  const bodyHash = hex(await sha256(body));
  const added: [string, string][] = [
    ["X-Amz-Date", date],
    ...(credentials.sessionToken ? [["X-Amz-Security-Token", credentials.sessionToken] as [string, string]] : []),
    ...(s3 ? [["X-Amz-Content-Sha256", bodyHash] as [string, string]] : []),
  ];

  // One line per name, in the order of the names: a name given twice has its values in the order given, with commas.
  const byName = new Map<string, string[]>();
  // A header of the request that the signer writes itself is replaced, not signed beside the signer's.
  const own = request.headers.filter(
    ([name]) =>
      !added.some(([written]) => written.toLowerCase() === name.toLowerCase()) && name.toLowerCase() !== "host",
  );
  for (const [name, value] of [["Host", url.host] as const, ...own, ...added]) {
    const key = name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), value.trim().replace(/\s+/g, " ")]);
  }
  const names = [...byName.keys()].sort();
  const signedHeaders = names.join(";");
  const canonicalRequest = [
    request.method,
    path,
    query,
    ...names.map((name) => `${name}:${(byName.get(name) ?? []).join(",")}`),
    "",
    signedHeaders,
    bodyHash,
  ].join("\n");

  const scope = `${day}/${credentials.region}/${credentials.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", date, scope, hex(await sha256(utf8(canonicalRequest)))].join("\n");
  let key = utf8(`AWS4${credentials.secretKey}`);
  for (const part of [day, credentials.region, credentials.service, "aws4_request"]) key = await hmac(key, part);
  const signature = hex(await hmac(key, stringToSign));
  return {
    headers: [
      ...added,
      [
        "Authorization",
        `AWS4-HMAC-SHA256 Credential=${credentials.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      ],
    ],
    canonicalRequest,
    stringToSign,
    signature,
  };
}
