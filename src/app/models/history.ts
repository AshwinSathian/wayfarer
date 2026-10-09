import { HTTP_METHODS, type RequestContent } from "@wayfarer/core";

export { HTTP_METHODS };

/** A response body as history keeps it: text, masked, at most 1 MB of it. */
export interface HistoryBody {
  text: string;
  /** More was received than is kept here. */
  truncated: boolean;
}

/**
 * One exchange as history keeps it (history v2, plan section 4.4). Nothing
 * here holds a credential or a vault secret: `sent` and `response` are
 * stored masked, and so is a credential typed into the template (D5).
 */
export interface PastRequest {
  id?: number;
  createdAt: number;
  /** The request as it was composed: `{{variables}}` are not resolved. */
  template: RequestContent;
  /** What went on the wire. `bodyPreview` is the text of a text body; of a form or a file, its field names, file names and sizes. */
  sent: { method: string; url: string; headers: [string, string][]; bodyPreview?: string };
  /** Absent when no response arrived. A binary body is not kept: bytes cannot be searched for a secret. */
  response?: { status: number; statusText: string; headers: [string, string][]; body?: HistoryBody };
  durationMs?: number;
  route: "direct" | "bridge";
  error?: string;
}

export type PastRequestKey = number;
