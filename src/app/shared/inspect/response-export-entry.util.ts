import { InspectorExportEntry } from "./export.util";
import { ResponseInspection } from "./response-inspector.service";

/**
 * Snapshot of the just-sent request, captured by `ApiParamsComponent` right
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
  body?: unknown;
}

function normalizeHeaderRecord(record: Record<string, string>): Record<string, string> {
  return Object.entries(record ?? {}).reduce<Record<string, string>>((acc, [key, value]) => {
    if (!key) {
      return acc;
    }
    acc[key] = value ?? "";
    return acc;
  }, {});
}

function createFallbackId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `export-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

  const responseHeadersRecord = input.responseHeaders.reduce<Record<string, string>>(
    (acc, header) => {
      if (!header?.name) {
        return acc;
      }
      acc[header.name] = header.value ?? "";
      return acc;
    },
    {}
  );

  return {
    id: inspection?.id ?? context.id ?? createFallbackId(),
    startedDateTime,
    time: duration,
    req: {
      method: context.method,
      url,
      headers: normalizeHeaderRecord(context.headers),
      body: context.body,
    },
    res: {
      status: statusCode,
      statusText: input.statusText ?? "",
      headers: responseHeadersRecord,
      body: input.isError ? input.responseError : input.responseData,
      sizes: inspection?.sizes,
    },
    phases: inspection?.phases,
  };
}
