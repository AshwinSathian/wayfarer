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
