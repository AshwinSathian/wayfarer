import { HTTP_METHODS } from "@wayfarer/core";

export { HTTP_METHODS };

/** A request as it was sent. History v2 (template, redacted request and response) arrives with P2.9. */
export interface PastRequest {
  id?: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  createdAt: number;
  status?: number;
  durationMs?: number;
  error?: string;
}

export type PastRequestKey = number;
