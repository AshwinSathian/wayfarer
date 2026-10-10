import type { RequestBody } from "../model/request";
import { Redactor, type RedactOptions } from "../redact/redactor";

/** One part of a multipart form: text, or a file by the name it was picked under. */
export type ExportPart = { name: string } & ({ value: string } | { fileName: string });

/**
 * The body of a request as an export writes it: text and fields as they
 * are sent, a file by its name. A file's bytes are not read for an export:
 * a command names the file, and the person who runs it has it.
 */
export type ExportBody =
  | { mode: "none" }
  | { mode: "raw"; text: string }
  | { mode: "urlencoded"; fields: [string, string][] }
  | { mode: "multipart"; parts: ExportPart[] }
  /** `fileName` is "" while no file is chosen. */
  | { mode: "binary"; fileName: string };

/** A request as built: what a cURL command or generated code says. */
export interface ExportRequest {
  method: string;
  url: string;
  /** In the order they are sent. */
  headers: [string, string][];
  body: ExportBody;
}

/** A request as built, with what a redactor must look for in it. */
export interface ExportSource extends ExportRequest {
  /** The plaintext of the vault secrets placed into the request. */
  secrets: string[];
  /** The credentials of its auth. */
  credentials: string[];
}

/** GET and HEAD carry no body: `fetch` refuses one, and the app sends none. */
const sendsBody = (method: string) => method !== "GET" && method !== "HEAD";

/** The body a request with `method` is sent with, its `{{variables}}` replaced by `resolve`. */
export function exportBody(body: RequestBody, method: string, resolve: (text: string) => string): ExportBody {
  if (!sendsBody(method)) return { mode: "none" };
  switch (body.mode) {
    case "none":
      return { mode: "none" };
    case "raw":
      return { mode: "raw", text: resolve(body.raw?.text ?? "") };
    case "urlencoded":
      return { mode: "urlencoded", fields: (body.urlencoded ?? []).filter((row) => row.enabled).map((row) => [resolve(row.key), resolve(row.value)]) };
    case "multipart":
      return {
        mode: "multipart",
        parts: (body.multipart ?? []).filter((part) => part.enabled).map((part) => (part.kind === "text" ? { name: resolve(part.key), value: resolve(part.value) } : { name: resolve(part.key), fileName: part.fileName })),
      };
    case "binary":
      return { mode: "binary", fileName: body.binary?.fileName ?? "" };
  }
}

/**
 * The request as it may be written into a command, code or a file (plan
 * D5). Vault secrets are masked in every export; credentials are masked
 * unless the user asked for this export to carry them.
 */
export function redactExport(source: ExportSource, options: RedactOptions = {}): ExportRequest {
  const redactor = new Redactor(options.credentials ? source.secrets : [...source.secrets, ...source.credentials]);
  const text = (value: string) => redactor.text(value);
  const { body } = source;
  return {
    method: source.method,
    url: text(source.url),
    headers: redactor.headers(source.headers, options),
    body:
      body.mode === "raw"
        ? { mode: "raw", text: text(body.text) }
        : body.mode === "urlencoded"
          ? { mode: "urlencoded", fields: body.fields.map(([name, value]) => [text(name), text(value)]) }
          : body.mode === "multipart"
            ? { mode: "multipart", parts: body.parts.map((part) => ("value" in part ? { name: text(part.name), value: text(part.value) } : { name: text(part.name), fileName: text(part.fileName) })) }
            : body.mode === "binary"
              ? { mode: "binary", fileName: text(body.fileName) }
              : body,
  };
}
