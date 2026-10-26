import { formatMs } from "../../shared/inspect/timing-bars";

/** What the response pane says of the exchange in one line: what a screen reader hears when a send ends (D4.11). */
export interface ExchangeSummary {
  statusCode?: number;
  statusText?: string;
  isError: boolean;
  /** What the app says when no response arrived (a network failure, a timeout, a stop). */
  errorText?: string;
  durationMs?: number;
  route?: "direct" | "bridge" | null;
}

/**
 * "200 OK, 16.3 ms, Direct", or the failure's first sentence when no
 * response arrived. Empty when nothing was sent. D4.12's exchange record
 * will speak the same first line.
 */
export function statusLine(summary: ExchangeSummary): string {
  const { statusCode, statusText, isError, errorText, durationMs, route } = summary;
  if (!statusCode) {
    if (!isError || !errorText) return "";
    return firstSentence(errorText);
  }
  const parts = [[statusCode, statusText].filter(Boolean).join(" ")];
  if (durationMs && durationMs > 0) parts.push(formatMs(durationMs));
  if (route) parts.push(route === "bridge" ? "Local Bridge" : "Direct");
  return parts.join(", ");
}

function firstSentence(text: string): string {
  const match = /^.*?[.!?](?=\s|$)/s.exec(text.trim());
  return (match ? match[0] : text).trim();
}
