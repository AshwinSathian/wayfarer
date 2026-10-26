import { ResponseInspection } from "./response-inspector";

export interface TimingBar {
  key?: string;
  label: string;
  duration: number;
  percent: number;
  tooltip?: string;
}

export const TIMING_SUMMARY_TOOLTIPS = {
  duration: "This is the time from the request leaving to the response's last byte.",
  transferSize: "These bytes came over the network: the headers and the body, as the server sent them.",
  encodedBodySize: "This is the body as it came, before the browser decompressed it.",
  decodedBodySize: "This is the body after the browser decompressed it.",
};

export const WATERFALL_TOOLTIP = "Each bar is one part of the request's time, drawn against the whole.";

export const TIMING_PHASE_ORDER: {
  key: keyof NonNullable<ResponseInspection["phases"]>;
  label: string;
  description: string;
}[] = [
  {
    key: "redirect",
    label: "Redirect",
    description: "The browser followed redirects before the last request.",
  },
  {
    key: "dns",
    label: "DNS",
    description: "The browser looked up the host's address.",
  },
  {
    key: "tcp",
    label: "TCP",
    description: "The browser opened the connection.",
  },
  {
    key: "tls",
    label: "TLS",
    description: "The browser set up the encrypted connection, for an https:// address.",
  },
  {
    key: "request",
    label: "Request",
    description: "The request went out once the connection was ready.",
  },
  {
    key: "ttfb",
    label: "TTFB",
    description: "The server worked, and the first byte of the response came back: the time to first byte.",
  },
  {
    key: "content",
    label: "Content",
    description: "The rest of the response arrived after its first byte.",
  },
];

const PHASE_DESCRIPTION_MAP = new Map(TIMING_PHASE_ORDER.map((phase) => [phase.key, phase.description]));

/** Per-phase waterfall bars (redirect/dns/tcp/tls/request/ttfb/content), each with a percent-of-total width. Empty if the inspection has no phase breakdown. */
export function getTimingBars(inspection: ResponseInspection | null): TimingBar[] {
  if (!inspection?.phases || !inspection.duration) {
    return [];
  }
  return TIMING_PHASE_ORDER.map((phase) => {
    const duration = inspection.phases?.[phase.key] ?? 0;
    const percent = inspection.duration > 0 ? Math.min(100, Math.max((duration / inspection.duration) * 100, 0)) : 0;
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
