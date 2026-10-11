import type { ExportBody, HarExchange, RedactOptions } from "@wayfarer/core";
import { version } from "../../../../package.json";
import type { PastRequest } from "../../models/history";

/** What a HAR is made from, for the export dialog: the exchanges, masked as `options` say, and the file's name. */
export interface HarSource {
  /** The file is `<name>.har`. */
  name: string;
  exchanges: (options: RedactOptions) => HarExchange[];
  /** The exchanges can be written with their credentials. History cannot: it is stored masked. */
  credentials: boolean;
}

/**
 * The HAR 1.2 file of `exchanges`, as text. The builder is fetched the first
 * time a HAR is asked for. The exchanges are masked by whoever made them.
 */
export async function harText(exchanges: HarExchange[]): Promise<string> {
  const { buildHar } = await import("@wayfarer/core/har");
  return JSON.stringify(buildHar(exchanges, { name: "Wayfarer", version }), null, 2);
}

/**
 * A history entry as an exchange. History is stored masked (D5), so nothing
 * here needs a redactor, and nothing here can be written "with credentials".
 * Of a request's body history keeps the text of a text body and of a form;
 * of a multipart form or a file it keeps a description, which is not a body.
 * A response body history cut short (at 1 MB) is longer than a HAR holds
 * anyway, and is left out by the builder like any other long one.
 */
export function historyExchange(entry: PastRequest): HarExchange {
  const mode = entry.template.body.mode;
  const kept = mode === "raw" || mode === "urlencoded";
  const body: ExportBody = kept && entry.sent.bodyPreview ? { mode: "raw", text: entry.sent.bodyPreview } : { mode: "none" };
  const notes = [
    ...(!kept && mode !== "none" ? [`The request's body (${mode === "multipart" ? "a multipart form" : "a file"}) is not in history and is left out.`] : []),
    ...(entry.response ? [] : [`No response${entry.error ? `: ${entry.error}` : "."}`]),
  ];
  return {
    startedAt: new Date(entry.createdAt).toISOString(),
    timeMs: entry.durationMs ?? -1,
    request: { method: entry.sent.method, url: entry.sent.url, headers: entry.sent.headers, body },
    ...(entry.response && {
      response: { status: entry.response.status, statusText: entry.response.statusText, headers: entry.response.headers, text: entry.response.body?.text },
    }),
    ...(notes.length && { comment: notes.join(" ") }),
  };
}
