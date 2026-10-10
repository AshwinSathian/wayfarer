import { emptyRequest, type Folder, type RequestBody, type RequestContent, type Row } from "@wayfarer/core";
import type { PastRequest } from "../app/models/history";

/** Name and value pairs as enabled rows, in the order written. */
export function rowsOf(record: Record<string, string>): Row[] {
  return Object.entries(record).map(([key, value]) => ({ key, value, enabled: true }));
}

/** A JSON value as a request body: the text the composer would hold for it. */
export function jsonBody(value: unknown): RequestBody & { raw: { text: string } } {
  return { mode: "raw", raw: { language: "json", text: JSON.stringify(value, null, 2) } };
}

/** A request with the given fields and nothing else set. */
export function requestContent(fields: Partial<RequestContent> = {}): RequestContent {
  return { ...emptyRequest(), ...fields };
}

/** A history entry as the executor writes one: `url` and `method` are those of the template and of what was sent. */
export function historyEntry(
  fields: { method?: string; url?: string; createdAt?: number; status?: number; error?: string; template?: Partial<RequestContent> } = {}
): PastRequest {
  const method = fields.method ?? "GET";
  const url = fields.url ?? "https://example.com/api";
  return {
    createdAt: fields.createdAt ?? Date.now(),
    template: requestContent({ method, url, ...fields.template }),
    sent: { method, url, headers: [] },
    ...(fields.status !== undefined && { response: { status: fields.status, statusText: "", headers: [] } }),
    ...(fields.error !== undefined && { error: fields.error }),
    route: "direct",
  };
}

/** What a new collection holds for its requests besides variables (P4.9): no auth and no scripts. */
export const inCollection = { auth: { type: "none" }, scripts: { pre: "", post: "" } } as const;

/** What a new folder holds for its requests: it inherits its auth, and has no variables and no scripts. */
export const inFolder = { variables: [] as Row[], auth: { type: "inherit" }, scripts: { pre: "", post: "" } } as const satisfies Pick<Folder, "variables" | "auth" | "scripts">;
