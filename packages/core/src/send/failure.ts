import { failures } from "../strings";
import { BRIDGE_MISMATCH } from "../transport/bridge";
import { formatDuration, type ExchangeRecord } from "./record";

/** In the app's words when the page knows the device is offline: `exchange` writes it, `isOffline` reads it. */
export const OFFLINE_MARK = "this browser is offline";

/**
 * What a page can tell apart about a send that got no response (U-051). A browser reports one `TypeError` for a name
 * that does not resolve, a refused connection and a server that does not allow the page, so those are one class; the
 * Local Bridge says more, and its words are read here. The record keeps the kind, what was reported and the app's first
 * sentence, and nothing else: this reads them back, so it adds nothing to what history stores.
 */
export type FailureClass =
  | "offline"
  | "unreachable"
  | "timeout"
  | "stopped"
  | "refused"
  | "notFound"
  | "certificate"
  | "bridgeDown"
  | "bridgeToken"
  | "bridgeVersion"
  | "bridgeOther";

/** The one thing a failure panel offers; the app maps each to what it opens or does. */
export type FailureAction = "retry" | "bridge" | "bridge-settings" | "timeout" | "request-settings";

export interface FailurePanel {
  cls: FailureClass;
  headline: string;
  cause: string;
  next: string;
  action: FailureAction;
  /** The button's label. */
  actionLabel: string;
  /** What the browser or the bridge said, as it said it. */
  reported: string;
  /** Who said it: names the details. */
  reporter: "browser" | "bridge";
}

/** The class of a failed send's record; undefined when the record holds no failure. */
export function failureClass(record: ExchangeRecord): FailureClass | undefined {
  const failure = record.failure;
  if (!failure) return undefined;
  const said = failure.reported;
  switch (failure.kind) {
    case "aborted":
      return "stopped";
    case "timeout":
      return "timeout";
    case "network":
      if (record.route === "bridge") return "bridgeDown";
      return failure.summary.includes(OFFLINE_MARK) ? "offline" : "unreachable";
    case "bridge":
      if (/invalid or missing bridge token/i.test(said)) return "bridgeToken";
      if (said === BRIDGE_MISMATCH) return "bridgeVersion";
      if (/timed out/i.test(said)) return "timeout";
      if (/ECONNREFUSED/.test(said)) return "refused";
      if (/ENOTFOUND|EAI_AGAIN/.test(said)) return "notFound";
      if (/cert|self[- ]signed|\btls\b|\bssl\b/i.test(said)) return "certificate";
      return "bridgeOther";
  }
}

/** The panel for a failed send: a cause line and one next action. Undefined when the record holds no failure. */
export function failurePanel(record: ExchangeRecord): FailurePanel | undefined {
  const cls = failureClass(record);
  if (!cls || !record.failure) return undefined;
  const { host } = record;
  const reporter = record.route === "bridge" && cls !== "bridgeDown" ? "bridge" : "browser";
  const base = { cls, reported: record.failure.reported, reporter } as const;
  const f = failures;
  switch (cls) {
    case "offline":
      return {
        ...base,
        headline: f.offline.headline,
        cause: f.offline.cause,
        next: f.offline.next,
        action: "retry",
        actionLabel: f.offline.action,
      };
    case "unreachable":
      return {
        ...base,
        headline: f.unreachable.headline(host),
        cause: f.unreachable.cause,
        next: record.unpaired ? f.unreachable.nextWithoutBridge : f.unreachable.nextWithBridge,
        action: "bridge",
        actionLabel: f.unreachable.nextWithBridge,
      };
    case "timeout":
      return {
        ...base,
        headline: f.timeout.headline(formatDuration(record.durationMs)),
        cause: f.timeout.cause(host),
        next: f.timeout.next,
        action: "timeout",
        actionLabel: f.timeout.action,
      };
    case "stopped":
      return {
        ...base,
        headline: f.stopped.headline,
        cause: f.stopped.cause,
        next: f.stopped.next,
        action: "retry",
        actionLabel: f.stopped.action,
      };
    case "refused":
      return {
        ...base,
        headline: f.refused.headline(host),
        cause: f.refused.cause,
        next: f.refused.next,
        action: "retry",
        actionLabel: f.refused.action,
      };
    case "notFound":
      return {
        ...base,
        headline: f.notFound.headline(host),
        cause: f.notFound.cause,
        next: f.notFound.next,
        action: "retry",
        actionLabel: f.notFound.action,
      };
    case "certificate":
      return {
        ...base,
        headline: f.certificate.headline(host),
        cause: f.certificate.cause,
        next: f.certificate.next,
        action: "request-settings",
        actionLabel: f.certificate.action,
      };
    case "bridgeDown":
      return {
        ...base,
        headline: f.bridgeDown.headline,
        cause: f.bridgeDown.cause,
        next: f.bridgeDown.next,
        action: "bridge-settings",
        actionLabel: f.bridgeDown.action,
      };
    case "bridgeToken":
      return {
        ...base,
        headline: f.bridgeToken.headline,
        cause: f.bridgeToken.cause,
        next: f.bridgeToken.next,
        action: "bridge-settings",
        actionLabel: f.bridgeToken.action,
      };
    case "bridgeVersion":
      return {
        ...base,
        headline: f.bridgeVersion.headline,
        cause: f.bridgeVersion.cause,
        next: f.bridgeVersion.next,
        action: "bridge-settings",
        actionLabel: f.bridgeVersion.action,
      };
    case "bridgeOther":
      return {
        ...base,
        headline: f.bridgeOther.headline,
        cause: f.bridgeOther.cause,
        next: f.bridgeOther.next,
        action: "retry",
        actionLabel: f.bridgeOther.action,
      };
  }
}
