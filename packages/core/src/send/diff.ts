import { parseJson } from "../safe-json";
import type { PastRequest } from "./exchange";

/** What the diff reads of an entry: only what history keeps, which the redactor has masked. */
export type DiffSide = Pick<PastRequest, "sent" | "response" | "durationMs" | "route" | "error">;

export interface HeaderChange {
  name: string;
  kind: "added" | "removed" | "changed";
  /** The values it had on each side, in order; empty where the side lacks it. */
  a: string[];
  b: string[];
}

export interface PathChange {
  /** `$.items[0].id`: a path from the body's root. */
  path: string;
  kind: "added" | "removed" | "changed";
  a?: string;
  b?: string;
}

export type BodyDiff =
  | { kind: "same" }
  /** One side or both kept no body (or none came): nothing is compared. */
  | { kind: "not-kept"; a: boolean; b: boolean }
  | { kind: "json"; changes: PathChange[]; more: number }
  | { kind: "text"; line: number };

export interface ExchangeDiff {
  status: { a: string; b: string; same: boolean };
  /** `undefined`: the entry holds no duration. */
  duration: { a?: number; b?: number };
  route: { a: DiffSide["route"]; b: DiffSide["route"]; same: boolean };
  request: { method: { a: string; b: string }; address: { a: string; b: string }; changed: boolean };
  /** The request's body as history kept it (masked): whether it differs. */
  requestBody: { changed: boolean; a?: string; b?: string };
  requestHeaders: HeaderChange[];
  headers: HeaderChange[];
  body: BodyDiff;
  /** Whether anything above differs (the duration is not a difference: it varies every send). */
  differs: boolean;
}

/** Changes listed at most; the rest are counted. */
export const MAX_PATH_CHANGES = 200;
/** A value is cut at this many characters, so that one big string is not a screenful. */
const VALUE_SHOWN = 200;

function statusOf(side: DiffSide): string {
  const response = side.response;
  return response ? `${response.status} ${response.statusText}`.trim() : "No response";
}

/** Header names compare without case; a name sent twice keeps its values in order. */
function headerChanges(a: readonly [string, string][], b: readonly [string, string][]): HeaderChange[] {
  const group = (rows: readonly [string, string][]): Map<string, { name: string; values: string[] }> => {
    const out = new Map<string, { name: string; values: string[] }>();
    for (const [name, value] of rows) {
      const key = name.toLowerCase();
      const held = out.get(key);
      if (held) held.values.push(value);
      else out.set(key, { name, values: [value] });
    }
    return out;
  };
  const left = group(a);
  const right = group(b);
  const changes: HeaderChange[] = [];
  for (const [key, one] of left) {
    const other = right.get(key);
    if (!other) changes.push({ name: one.name, kind: "removed", a: one.values, b: [] });
    else if (one.values.join("\n") !== other.values.join("\n"))
      changes.push({ name: one.name, kind: "changed", a: one.values, b: other.values });
  }
  for (const [key, other] of right) {
    if (!left.has(key)) changes.push({ name: other.name, kind: "added", a: [], b: other.values });
  }
  return changes.sort((x, y) => x.name.localeCompare(y.name));
}

const KEY = /^[A-Za-z_$][\w$]*$/;

function shown(value: unknown): string {
  const text = typeof value === "string" ? JSON.stringify(value) : (JSON.stringify(value) ?? String(value));
  return text.length > VALUE_SHOWN ? `${text.slice(0, VALUE_SHOWN)}…` : text;
}

function shownText(text: string): string {
  return text.length > VALUE_SHOWN ? `${text.slice(0, VALUE_SHOWN)}…` : text;
}

function walk(a: unknown, b: unknown, path: string, out: PathChange[]): void {
  const array = Array.isArray(a) && Array.isArray(b);
  const object = !array && isRecord(a) && isRecord(b);
  if (array) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const at = `${path}[${i}]`;
      if (i >= a.length) out.push({ path: at, kind: "added", b: shown(b[i]) });
      else if (i >= b.length) out.push({ path: at, kind: "removed", a: shown(a[i]) });
      else walk(a[i], b[i], at, out);
    }
  } else if (object) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const at = KEY.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
      const inA = Object.hasOwn(a, key);
      const inB = Object.hasOwn(b, key);
      if (!inA) out.push({ path: at, kind: "added", b: shown(b[key]) });
      else if (!inB) out.push({ path: at, kind: "removed", a: shown(a[key]) });
      else walk(a[key], b[key], at, out);
    }
  } else if (!Object.is(a, b)) {
    out.push({ path, kind: "changed", a: shown(a), b: shown(b) });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Changed paths first, then removed, then added; each group in the order the body has them. */
const ORDER = { changed: 0, removed: 1, added: 2 } as const;

function bodyDiff(a: DiffSide, b: DiffSide): BodyDiff {
  const left = a.response?.body?.text;
  const right = b.response?.body?.text;
  if (!a.response && !b.response) return { kind: "same" };
  if (left === undefined || right === undefined)
    return { kind: "not-kept", a: left === undefined, b: right === undefined };
  if (left === right) return { kind: "same" };
  const one = parseJson(left);
  const two = parseJson(right);
  if (one.ok && two.ok) {
    const all: PathChange[] = [];
    walk(one.value, two.value, "$", all);
    all.sort((x, y) => ORDER[x.kind] - ORDER[y.kind]);
    return { kind: "json", changes: all.slice(0, MAX_PATH_CHANGES), more: Math.max(0, all.length - MAX_PATH_CHANGES) };
  }
  const x = left.split("\n");
  const y = right.split("\n");
  let line = 0;
  while (line < x.length && line < y.length && x[line] === y[line]) line++;
  return { kind: "text", line: line + 1 };
}

/**
 * What differs between two exchanges. It reads two history entries and nothing else: what a send kept is masked
 * (`***` where a vault secret or a credential was), so the diff holds no secret, and two different secrets look alike.
 * It reads no `BuiltRequest`; a live response is compared as the entry its send wrote.
 */
export function diffExchanges(a: DiffSide, b: DiffSide): ExchangeDiff {
  const status = { a: statusOf(a), b: statusOf(b), same: statusOf(a) === statusOf(b) };
  const request = {
    method: { a: a.sent.method, b: b.sent.method },
    address: { a: a.sent.url, b: b.sent.url },
    changed: a.sent.method !== b.sent.method || a.sent.url !== b.sent.url,
  };
  const requestBody = {
    changed: a.sent.bodyPreview !== b.sent.bodyPreview,
    ...(a.sent.bodyPreview !== undefined && { a: shownText(a.sent.bodyPreview) }),
    ...(b.sent.bodyPreview !== undefined && { b: shownText(b.sent.bodyPreview) }),
  };
  const requestHeaders = headerChanges(a.sent.headers, b.sent.headers);
  const headers = headerChanges(a.response?.headers ?? [], b.response?.headers ?? []);
  const body = bodyDiff(a, b);
  const route = { a: a.route, b: b.route, same: a.route === b.route };
  return {
    status,
    duration: { a: a.durationMs, b: b.durationMs },
    route,
    request,
    requestBody,
    requestHeaders,
    headers,
    body,
    differs:
      !status.same ||
      !route.same ||
      request.changed ||
      requestBody.changed ||
      requestHeaders.length > 0 ||
      headers.length > 0 ||
      body.kind === "json" ||
      body.kind === "text",
  };
}
