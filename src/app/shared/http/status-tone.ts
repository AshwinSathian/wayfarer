/**
 * The tone of a status code's badge (`components.css`), the one way a status is drawn: in the status line, history
 * and a run's table alike. 0 is no status a server sent.
 */
export function statusTone(code: number): string {
  if (code >= 500) return "status-5xx";
  if (code >= 400) return "status-4xx";
  if (code >= 300) return "status-3xx";
  if (code >= 200) return "status-2xx";
  return code ? "" : "status-err";
}
