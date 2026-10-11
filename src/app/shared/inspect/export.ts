import { Redactor, type RedactOptions } from "@wayfarer/core";

/** A request as it was sent, with what a redactor must look for in it. */
export interface SentRequest {
  /** The plaintext of the vault secrets placed into the request. */
  secrets: string[];
  /** The credentials of its Auth tab. */
  credentials: string[];
}

/**
 * The redactor for an export of this request (plan D5). Vault secrets are
 * masked in every export. Credentials are masked unless the user asked for
 * this export to carry them.
 */
export function exportRedactor(request: SentRequest, options: RedactOptions = {}): Redactor {
  return new Redactor(options.credentials ? request.secrets : [...request.secrets, ...request.credentials]);
}

export interface InspectorExportEntry {
  id: string;
  startedDateTime: string;
  time: number;
  req: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  };
  res: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body?: unknown;
    sizes?: {
      transferSize?: number;
      encodedBodySize?: number;
      decodedBodySize?: number;
    };
  };
  phases?: {
    redirect?: number;
    dns?: number;
    tcp?: number;
    tls?: number;
    request?: number;
    ttfb?: number;
    content?: number;
  };
}
