import { MODEL_ACTION_WORDS } from "@wayfarer/core";
import type { HistorySummary } from "../../data/history-repository";

/** The host a request went to, as its record names it; the address when it has none. */
export function hostOf(request: HistorySummary): string {
  return request.record?.host ?? request.sent.url;
}

/** What the search field asks for: words, and the tokens `status:5xx`, `method:POST`, `host:x`, `route:bridge`, `slower-than:500ms`. */
export interface HistoryFilter {
  words: string[];
  /** `404`, `5xx`, or `error` (no response arrived). */
  status?: string;
  method?: string;
  host?: string;
  route?: "direct" | "bridge";
  slowerThanMs?: number;
  /** Tokens whose value is not one a token takes: nothing matches until they are fixed, and the field says which. */
  invalid: string[];
}

/** Each token's name and what it takes, as the field's help says it. */
export const FILTER_HELP = [
  "status:5xx",
  "status:404",
  "status:error",
  "method:POST",
  "host:example.com",
  "route:bridge",
  "slower-than:500ms",
] as const;

function duration(text: string): number | undefined {
  const found = /^(\d+(?:\.\d+)?)(ms|s)?$/i.exec(text);
  if (!found) return undefined;
  return Math.round(Number(found[1]) * (found[2]?.toLowerCase() === "s" ? 1000 : 1));
}

/** A word `name:value` with a name a token has is a token; any other word, a URL's `https://` among them, is a word. */
export function parseFilter(query: string): HistoryFilter {
  const filter: HistoryFilter = { words: [], invalid: [] };
  for (const word of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    const colon = word.indexOf(":");
    const name = word.slice(0, colon);
    const value = word.slice(colon + 1);
    if (colon < 1) filter.words.push(word);
    else if (name === "status") {
      if (/^([1-5]\d\d|[1-5]xx|error)$/.test(value)) filter.status = value;
      else filter.invalid.push(word);
    } else if (name === "method") {
      if (value) filter.method = value;
      else filter.invalid.push(word);
    } else if (name === "host") {
      if (value) filter.host = value;
      else filter.invalid.push(word);
    } else if (name === "route") {
      if (value === "bridge") filter.route = "bridge";
      else if (value === "page" || value === "direct") filter.route = "direct";
      else filter.invalid.push(word);
    } else if (name === "slower-than") {
      const ms = duration(value);
      if (ms === undefined) filter.invalid.push(word);
      else filter.slowerThanMs = ms;
    } else filter.words.push(word);
  }
  return filter;
}

function statusMatches(request: HistorySummary, wanted: string): boolean {
  const status = request.response?.status;
  if (wanted === "error") return status === undefined;
  if (status === undefined) return false;
  return wanted.endsWith("xx") ? Math.floor(status / 100) === Number(wanted[0]) : status === Number(wanted);
}

/**
 * Whether the entry is what `query` asks for: every token holds, and every other word is part of the entry's URL or of
 * the name and place of the saved request it was sent from, or is its method or its status; for a model call, also
 * part of its action, host or model (D4.10). Case does not matter.
 */
export function matches(request: HistorySummary, query: string): boolean {
  const filter = parseFilter(query);
  if (filter.invalid.length) return false;
  if (filter.status && !statusMatches(request, filter.status)) return false;
  if (filter.method && request.sent.method.toLowerCase() !== filter.method) return false;
  if (filter.host && !hostOf(request).toLowerCase().includes(filter.host)) return false;
  if (filter.route && request.route !== filter.route) return false;
  if (filter.slowerThanMs !== undefined && !((request.durationMs ?? 0) > filter.slowerThanMs)) return false;
  const url = request.sent.url.toLowerCase();
  const from = request.sentFrom ? [request.sentFrom.name, ...request.sentFrom.path].join(" ").toLowerCase() : "";
  const method = request.sent.method.toLowerCase();
  const status = String(request.response?.status ?? "");
  const model = request.model
    ? `${MODEL_ACTION_WORDS[request.model.action]} ${hostOf(request)} ${request.model.model}`.toLowerCase()
    : "";
  return filter.words.every(
    (word) => url.includes(word) || from.includes(word) || method === word || status === word || model.includes(word),
  );
}

/** An address as a row draws it: the host, and the path's end, which tells requests to one host apart. `tail` is "" for a bare host. */
export function addressParts(url: string): { host: string; tail: string } {
  const parsed = URL.parse(url);
  if (!parsed) return { host: "", tail: url };
  const segments = parsed.pathname.split("/").filter(Boolean);
  const tail = `${segments.length > 2 ? "…/" : "/"}${segments.slice(-2).join("/")}${parsed.search}`;
  return { host: parsed.host, tail: segments.length || parsed.search ? tail : "" };
}
