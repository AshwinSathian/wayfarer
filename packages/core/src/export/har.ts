import type { ExportBody } from "./request";

/** A body of text longer than this is left out of a HAR, with a comment: the file is for reading and for tools. */
export const HAR_MAX_BODY_CHARS = 256 * 1024;

/**
 * One exchange for a HAR: the request as it was sent and what came back,
 * already masked by whoever holds its secrets (`Redactor`). Nothing here is
 * read from a file or from the page: a file body is named, not included.
 */
export interface HarExchange {
  /** When the request left, as ISO 8601. */
  startedAt: string;
  /** How long it took, in milliseconds. */
  timeMs: number;
  request: { method: string; url: string; headers: [string, string][]; body: ExportBody };
  /** Absent when no response arrived. */
  response?: {
    status: number;
    statusText: string;
    headers: [string, string][];
    /** The body when it is text. Absent for a binary one, which a HAR of text does not hold. */
    text?: string;
    /** The bytes on the wire, when the browser said. */
    size?: number;
  };
  /** The parts of `timeMs` that are known, in milliseconds. */
  timings?: { dns?: number; connect?: number; ssl?: number; send?: number; wait?: number; receive?: number };
  /** Why there is no response, or anything else to say of the exchange. */
  comment?: string;
}

interface Pair {
  name: string;
  value: string;
}

const pairs = (entries: [string, string][]): Pair[] => entries.map(([name, value]) => ({ name, value }));
const headerOf = (headers: [string, string][], name: string): string | undefined => headers.find(([key]) => key.toLowerCase() === name)?.[1];
const known = (value: number | undefined): number => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : -1);

/** The query of an address as HAR lists it. An address that is not a URL has none to list. */
function queryOf(url: string): Pair[] {
  return URL.canParse(url) ? [...new URL(url).searchParams].map(([name, value]) => ({ name, value })) : [];
}

/** HAR's `postData`: text as text, a form and a multipart form as `params`, a file by its name. */
function postData(body: ExportBody, headers: [string, string][]): Record<string, unknown> | undefined {
  const type = headerOf(headers, "content-type");
  switch (body.mode) {
    case "none":
      return undefined;
    case "raw":
      if (body.text.length > HAR_MAX_BODY_CHARS) return { mimeType: type ?? "text/plain", text: "", comment: `The body is left out: it is longer than ${HAR_MAX_BODY_CHARS / 1024} KB.` };
      return { mimeType: type ?? "text/plain", text: body.text };
    case "urlencoded":
      return { mimeType: type ?? "application/x-www-form-urlencoded", params: body.fields.map(([name, value]) => ({ name, value })), text: new URLSearchParams(body.fields).toString() };
    case "multipart":
      return { mimeType: type ?? "multipart/form-data", params: body.parts.map((part) => ("fileName" in part ? { name: part.name, fileName: part.fileName } : { name: part.name, value: part.value })), text: "", comment: "A file part is named, not included." };
    case "binary":
      return { mimeType: type ?? "application/octet-stream", text: "", comment: `The body is the file "${body.fileName}", which is named, not included.` };
  }
}

/**
 * A HAR 1.2 log of `exchanges`, in their order, with every field the
 * format requires. What is not known is `-1`, as the format says. Cookies
 * are not listed apart: one that was sent is in the `Cookie` header.
 */
export function buildHar(exchanges: HarExchange[], creator: { name: string; version: string }): { log: Record<string, unknown> } {
  return {
    log: {
      version: "1.2",
      creator,
      entries: exchanges.map((exchange) => {
        const { request, response, timings } = exchange;
        const body = postData(request.body, request.headers);
        const tooLong = (response?.text?.length ?? 0) > HAR_MAX_BODY_CHARS;
        const left = !response
          ? undefined
          : response.text === undefined
            ? "The body is left out: it is not text."
            : tooLong
              ? `The body is left out: it is longer than ${HAR_MAX_BODY_CHARS / 1024} KB.`
              : undefined;
        return {
          startedDateTime: exchange.startedAt,
          time: known(exchange.timeMs),
          request: {
            method: request.method,
            url: request.url,
            httpVersion: "HTTP/1.1",
            cookies: [],
            headers: pairs(request.headers),
            queryString: queryOf(request.url),
            ...(body && { postData: body }),
            headersSize: -1,
            bodySize: -1,
          },
          response: {
            status: response?.status ?? 0,
            statusText: response?.statusText ?? "",
            httpVersion: "HTTP/1.1",
            cookies: [],
            headers: pairs(response?.headers ?? []),
            content: {
              size: known(response?.size),
              mimeType: (response && headerOf(response.headers, "content-type")) ?? "",
              ...(response?.text !== undefined && !tooLong && { text: response.text }),
              ...(left && { comment: left }),
            },
            redirectURL: (response && headerOf(response.headers, "location")) ?? "",
            headersSize: -1,
            bodySize: known(response?.size),
          },
          cache: {},
          timings: { blocked: -1, dns: known(timings?.dns), connect: known(timings?.connect), send: known(timings?.send), wait: known(timings?.wait), receive: known(timings?.receive), ssl: known(timings?.ssl) },
          ...(exchange.comment && { comment: exchange.comment }),
        };
      }),
    },
  };
}
