import type { ExportBody, ExportPart, ExportRequest } from "../export/request";
import { ImportError } from "./import-error";

type Fields = Record<string, unknown>;
const isObject = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value);
/** An own field: a file's "constructor" key must not read `Object.prototype.constructor`. */
const own = (object: Fields, key: string): unknown => (Object.hasOwn(object, key) ? object[key] : undefined);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const list = (value: unknown): Fields[] => (Array.isArray(value) ? value.filter(isObject) : []);

/** True when a parsed file is a HAR: it has `log.entries`. */
export function isHar(value: unknown): boolean {
  if (!isObject(value)) return false;
  const log = own(value, "log");
  return isObject(log) && Array.isArray(own(log, "entries"));
}

export interface HarRequest {
  /** What the request is called in the collection: its method and path. */
  name: string;
  request: ExportRequest;
  warnings: string[];
}

/** The body of one entry: its `postData`, as fields when the HAR has them and as text otherwise. */
function bodyOf(postData: unknown, warnings: string[]): ExportBody {
  if (!isObject(postData)) return { mode: "none" };
  const type = text(own(postData, "mimeType")).toLowerCase();
  const params = list(own(postData, "params"));
  if (type.startsWith("multipart/form-data")) {
    if (!params.length) {
      warnings.push("Its multipart body is in the file as text only, with a boundary of that one send. It is kept as text.");
      return { mode: "raw", text: text(own(postData, "text")) };
    }
    return {
      mode: "multipart",
      parts: params.map((param): ExportPart => (typeof own(param, "fileName") === "string" ? { name: text(own(param, "name")), fileName: text(own(param, "fileName")) } : { name: text(own(param, "name")), value: text(own(param, "value")) })),
    };
  }
  if (type.startsWith("application/x-www-form-urlencoded")) {
    return { mode: "urlencoded", fields: params.length ? params.map((param) => [text(own(param, "name")), text(own(param, "value"))]) : [...new URLSearchParams(text(own(postData, "text")))] };
  }
  const body = text(own(postData, "text"));
  if (own(postData, "encoding") === "base64") {
    warnings.push("Its body is binary (base64 in the file) and was left out.");
    return { mode: "none" };
  }
  return body ? { mode: "raw", text: body } : { mode: "none" };
}

/**
 * The requests of a HAR 1.2 file, one per entry, in the file's order. The
 * responses, the timings and the cookies' own list are not read: a cookie
 * that was sent is in the request's `Cookie` header. Throws `ImportError`.
 */
export function parseHar(value: unknown): HarRequest[] {
  if (!isHar(value)) throw new ImportError("The file is not a HAR: it has no log.entries.");
  const entries = (own(own(value as Fields, "log") as Fields, "entries") as unknown[]).filter(isObject);
  return entries.flatMap((entry, index): HarRequest[] => {
    const request = own(entry, "request");
    const [method, url] = isObject(request) ? [text(own(request, "method")).toUpperCase(), text(own(request, "url"))] : ["", ""];
    if (!isObject(request) || !method || !url) throw new ImportError(`The HAR's entry ${index + 1} has no request with a method and a URL.`);
    const warnings: string[] = [];
    // HTTP/2's pseudo-headers (":authority", ":path") are how the request was framed, not headers to send.
    const headers = list(own(request, "headers"))
      .map((header): [string, string] => [text(own(header, "name")), text(own(header, "value"))])
      .filter(([name]) => name && !name.startsWith(":"));
    const path = URL.canParse(url) ? new URL(url).pathname : url;
    return [{ name: `${method} ${path}`, request: { method, url, headers, body: bodyOf(own(request, "postData"), warnings) }, warnings }];
  });
}
