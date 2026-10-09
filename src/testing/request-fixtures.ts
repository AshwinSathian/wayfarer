import { emptyRequest, type RequestBody, type RequestContent, type Row } from "@wayfarer/core";

/** Name and value pairs as enabled rows, in the order written. */
export function rowsOf(record: Record<string, string>): Row[] {
  return Object.entries(record).map(([key, value]) => ({ key, value, enabled: true }));
}

/** A JSON value as a request body: the text the composer would hold for it. */
export function jsonBody(value: unknown): RequestBody {
  return { mode: "raw", raw: { language: "json", text: JSON.stringify(value, null, 2) } };
}

/** A request with the given fields and nothing else set. */
export function requestContent(fields: Partial<RequestContent> = {}): RequestContent {
  return { ...emptyRequest(), ...fields };
}
