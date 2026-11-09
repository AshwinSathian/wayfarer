import { InspectorExportEntry } from "./export";
import { ResponseInspection } from "./response-inspector";
import { newId, type ExportBody } from "@wayfarer/core";

/**
 * Snapshot of the just-sent request, captured by `WorkspaceStore` right
 * before dispatch, so the response viewer's export actions (Copy as
 * cURL/HAR) have the exact method/url/headers/body that went out even
 * though the composer's own signals may have changed since (the user
 * started editing the next request before this response finished
 * rendering).
 */
export interface ResponseExportContext {
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  /** The body when it is text: what the HAR holds. */
  body?: unknown;
  /** The body in every mode, a file by its name: what the cURL command says (P4.6 a). */
  exportBody: ExportBody;
  /** The plaintext of the vault secrets placed into the request: masked in every export. */
  secrets: string[];
  /** The credentials of its Auth tab: masked unless an export asks for them. */
  credentials: string[];
}

export interface BuildExportEntryInput {
  context: ResponseExportContext | null;
  inspection: ResponseInspection | null;
  statusCode: number | undefined;
  statusText: string | undefined;
  responseHeaders: { name: string; value: string }[];
  isError: boolean;
  responseData: string;
  responseError: string;
}

/**
 * Assembles the HAR-ish `InspectorExportEntry` the "Copy as HAR" action
 * serializes, reconciling the request-time `ResponseExportContext` (built
 * before the request was sent) with whatever the browser's Resource Timing
 * API actually reported (`ResponseInspection`, which may be null/partial in
 * environments that don't expose it). Returns null when there isn't enough
 * to build a meaningful entry (no context, or no status code yet).
 */
export function buildExportEntry(input: BuildExportEntryInput): InspectorExportEntry | null {
  const { context, inspection } = input;
  if (!context) {
    return null;
  }

  const url = context.url || inspection?.url || "";
  const statusCode = input.statusCode !== undefined ? input.statusCode : null;
  if (!url || statusCode === null) {
    return null;
  }

  const startedDateTime = inspection?.startEpoch
    ? new Date(inspection.startEpoch).toISOString()
    : new Date().toISOString();

  const duration =
    typeof inspection?.duration === "number" && Number.isFinite(inspection.duration)
      ? inspection.duration
      : Math.max(0, (inspection?.endTime ?? 0) - (inspection?.startTime ?? 0));

  return {
    id: inspection?.id ?? context.id ?? newId(),
    startedDateTime,
    time: duration,
    res: {
      status: statusCode,
      statusText: input.statusText ?? "",
      // A list, not a record: a repeated header (Set-Cookie) and one named `__proto__` are kept.
      headers: input.responseHeaders.filter(({ name }) => name).map(({ name, value }) => [name, value ?? ""]),
      body: input.isError ? input.responseError : input.responseData,
      sizes: inspection?.sizes,
    },
    phases: inspection?.phases,
  };
}
