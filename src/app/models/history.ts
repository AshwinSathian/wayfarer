import { V4_METHODS } from "@wayfarer/core";

export const HTTP_METHODS = V4_METHODS;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface PastRequest {
  id?: number;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  createdAt: number;
  status?: number;
  durationMs?: number;
  error?: string;
}

export type PastRequestKey = number;
