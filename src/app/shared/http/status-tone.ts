import type { IconName } from "../icon/icon-paths";

/**
 * The class that colours a status code (`.status-code`, components.css): one rendering wherever a code is drawn,
 * the response's line, history and a run's table (V14). 3xx is the secondary label: a redirect is not a warning.
 */
export function statusTone(code: number): string {
  if (code >= 500 || code < 100) return "status-5xx";
  if (code >= 400) return "status-4xx";
  if (code >= 300) return "status-3xx";
  if (code >= 200) return "status-2xx";
  return "status-1xx";
}

/**
 * What says a status's class without its colour: a glyph of a shape of its own and a word for a screen reader. A 1xx
 * is a note, 2xx a tick, 3xx an arrow, 4xx the request's fault (a circle with a mark), 5xx the server's (a crossed
 * circle). A code under 100 is no server's and is drawn as a 5xx is.
 */
export function statusMark(code: number): { icon: IconName; label: string; tone: string } {
  if (code >= 500 || code < 100) return { icon: "cancel", label: "Server error", tone: "text-status-error" };
  if (code >= 400) return { icon: "error", label: "Client error", tone: "text-status-warning" };
  if (code >= 300) return { icon: "chevron_right", label: "Redirect", tone: "text-label-secondary" };
  if (code >= 200) return { icon: "check_circle", label: "Success", tone: "text-status-success" };
  return { icon: "info", label: "Informational", tone: "text-label-secondary" };
}
