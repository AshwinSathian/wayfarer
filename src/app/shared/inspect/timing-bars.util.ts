import { ResponseInspection } from "./response-inspector.service";

export interface TimingBar {
  key?: string;
  label: string;
  duration: number;
  percent: number;
  tooltip?: string;
}

export const TIMING_SUMMARY_TOOLTIPS = {
  duration:
    "Overall time between sending the request and receiving the last byte of the response.",
  transferSize:
    "Total bytes transferred over the network for this response, including headers if available.",
  encodedBodySize:
    "Size of the compressed response body as delivered over the network.",
  decodedBodySize: "Size of the response body after decompression in the browser.",
};

export const WATERFALL_TOOLTIP =
  "Each bar shows how much time was spent in a network phase relative to the total response duration.";

export const TIMING_PHASE_ORDER: {
  key: keyof NonNullable<ResponseInspection["phases"]>;
  label: string;
  description: string;
}[] = [
  {
    key: "redirect",
    label: "Redirect",
    description: "Time spent following HTTP redirects before the final request.",
  },
  {
    key: "dns",
    label: "DNS",
    description: "Lookup time to resolve the host name to an IP address.",
  },
  {
    key: "tcp",
    label: "TCP",
    description: "TCP handshake duration, including establishing the socket.",
  },
  {
    key: "tls",
    label: "TLS",
    description: "Secure connection setup (TLS/SSL) if HTTPS is used.",
  },
  {
    key: "request",
    label: "Request",
    description:
      "Time from finishing the connection to sending the first byte of the request body.",
  },
  {
    key: "ttfb",
    label: "TTFB",
    description: "Time to first byte—server processing plus initial network latency.",
  },
  {
    key: "content",
    label: "Content",
    description: "Time to receive the full response body after the first byte arrives.",
  },
];

const PHASE_DESCRIPTION_MAP = new Map(
  TIMING_PHASE_ORDER.map((phase) => [phase.key, phase.description])
);

/** Per-phase waterfall bars (redirect/dns/tcp/tls/request/ttfb/content), each with a percent-of-total width. Empty if the inspection has no phase breakdown. */
export function getTimingBars(inspection: ResponseInspection | null): TimingBar[] {
  if (!inspection?.phases || !inspection.duration) {
    return [];
  }
  return TIMING_PHASE_ORDER.map((phase) => {
    const duration = inspection.phases?.[phase.key] ?? 0;
    const percent =
      inspection.duration > 0
        ? Math.min(100, Math.max((duration / inspection.duration) * 100, 0))
        : 0;
    return {
      key: phase.key,
      label: phase.label,
      duration,
      percent,
      tooltip: PHASE_DESCRIPTION_MAP.get(phase.key),
    };
  }).filter((phase) => phase.duration > 0);
}

/** A single "Total" bar for when the inspection has an overall duration but no per-phase breakdown (e.g. environments that don't expose the Resource Timing API's phase detail). */
export function getFallbackBars(inspection: ResponseInspection | null): TimingBar[] {
  if (!inspection?.duration) {
    return [];
  }
  return [
    {
      label: "Total",
      duration: inspection.duration,
      percent: 100,
      tooltip: TIMING_SUMMARY_TOOLTIPS.duration,
    },
  ];
}

export function formatMs(value: number | undefined | null): string {
  if (!value || value <= 0) {
    return "—";
  }
  if (value < 1) {
    return `${value.toFixed(2)} ms`;
  }
  if (value < 100) {
    return `${value.toFixed(1)} ms`;
  }
  return `${Math.round(value)} ms`;
}

export function formatBytes(value: number | undefined): string {
  if (!value || value <= 0) {
    return "—";
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}
