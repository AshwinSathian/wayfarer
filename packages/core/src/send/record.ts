import { VARIABLE_SCOPES, type VariableScope } from "../variables/resolver";

/** A vault secret placed into a request: the variable that held it, and where that variable is set. */
export interface FilledSecret {
  /** The variable's name, or the reference as written when a text named the vault itself. */
  name: string;
  /** The scope the variable was found in. Absent for a reference written into a text. */
  scope?: VariableScope;
  /** That scope's holder, as the app names it: `environment "Local"`, `collection "Shop"`. */
  holder?: string;
}

/** Where the redactor put *** in what is kept of the exchange. */
export interface MaskedParts {
  /** The address as sent. */
  address?: true;
  /** The names of the headers sent whose values were masked. */
  headers: string[];
  body?: true;
  /** The names of the headers received whose values were masked. */
  responseHeaders: string[];
  responseBody?: true;
}

/**
 * What one send did, told from what the app sent and received (D4.12, the
 * exchange record): the route the request took, the host, the vault secrets
 * filled (by name), what the redactor masked and what is kept. It holds no
 * secret and no credential: names, the host as sent with secrets masked,
 * and what the browser or the bridge reported.
 */
export interface ExchangeRecord {
  /** The status as received. Absent when no response arrived. */
  status?: { code: number; text: string };
  /** How long the request took, scripts not counted. */
  durationMs: number;
  /** Where the request went last: from the page, or through the Local Bridge. */
  route: "direct" | "bridge";
  /** It went from the page, got no response, and no Local Bridge is paired to try (DQ10, U-131). */
  unpaired?: true;
  /** The host it was sent to, its port when that is not the scheme's own; an address that is no URL stands for itself. */
  host: string;
  secrets: FilledSecret[];
  masked: MaskedParts;
  /** What the exchange's entry keeps: the request always, the response's status and headers when one came, and its body when kept. */
  kept: { response: boolean; body: boolean };
  /** No response arrived. `reported` is what the browser or the bridge said, as it said it; `summary` is the app's first sentence. */
  failure?: { kind: "network" | "timeout" | "aborted" | "bridge"; reported: string; summary: string };
}

/** "16.3 ms": a duration as the app writes it. Under 0 is no duration. */
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

const ROUTE_WORDS = { direct: "Direct", bridge: "Local Bridge" } as const;

/** "Direct to api.example.com": the route the record took and where to. */
export function recordRoute(record: ExchangeRecord): string {
  return `${ROUTE_WORDS[record.route]} to ${record.host}`;
}

/**
 * The record's first line: what the status line and the status region say
 * when a send ends. "200 OK, 16.3 ms, Direct to api.example.com"; with no
 * response, the app's first sentence and the route: "The request got no
 * response. Direct to 127.0.0.1:9."
 */
export function recordHeadline(record: ExchangeRecord): string {
  if (!record.status)
    return `${record.failure?.summary ?? "No response."} ${recordRoute(record)}${record.unpaired ? ", no bridge paired" : ""}.`;
  const parts = [[record.status.code, record.status.text].filter(Boolean).join(" ")];
  if (record.durationMs > 0) parts.push(formatMs(record.durationMs));
  parts.push(recordRoute(record));
  return parts.join(", ");
}

/** A piece of a record's sentence: the app's words, or a value of the wire (a host, a name, what was reported), drawn in monospace. */
export type RecordPart = string | { wire: string };

/** One of the record's sentences: which field it tells, and its pieces. */
export interface RecordLine {
  field: "route" | "secrets" | "masked" | "kept" | "failure";
  parts: RecordPart[];
}

/** The sentence as plain text, as a screen reader and a test read it. */
export function lineText(line: RecordLine): string {
  return line.parts.map((part) => (typeof part === "string" ? part : part.wire)).join("");
}

/** The items joined as a list in words: "a", "a and b", "a, b and c". */
function listed(items: RecordPart[][]): RecordPart[] {
  return items.flatMap((item, index) => [
    ...(index === 0 ? [] : [index === items.length - 1 ? " and " : ", "]),
    ...item,
  ]);
}

/**
 * The record as sentences, one per field, in the app's words (voice.md).
 * `keeper` is what keeps the exchange: history for a send, the run for a
 * run's request.
 */
export function recordLines(record: ExchangeRecord, keeper: "history" | "run" = "history"): RecordLine[] {
  const route: RecordPart[] =
    record.route === "bridge"
      ? ["Sent through the Local Bridge to ", { wire: record.host }, "."]
      : ["Sent from this page to ", { wire: record.host }, record.unpaired ? ". No Local Bridge is paired." : "."];
  const secrets: RecordPart[] = record.secrets.length
    ? [
        "Filled from the vault: ",
        ...listed(
          record.secrets.map(({ name, scope, holder }) => [
            { wire: name },
            ...(holder ? [`, from ${holder}`] : scope ? [`, from the ${scope}`] : []),
          ]),
        ),
        ". Each is *** in what is kept.",
      ]
    : ["No vault secret was filled."];
  const { masked } = record;
  const parts: RecordPart[][] = [
    ...(masked.address ? [["the address"]] : []),
    ...masked.headers.map((name) => [{ wire: name }]),
    ...(masked.body ? [["the body"]] : []),
    ...masked.responseHeaders.map((name): RecordPart[] => [{ wire: name }, " of the response"]),
    ...(masked.responseBody ? [["the response body"]] : []),
  ];
  const maskedLine: RecordPart[] = parts.length
    ? ["Masked with *** in what is kept: ", ...listed(parts), "."]
    : ["Nothing was masked."];
  const who = keeper === "history" ? "History kept" : "The run kept";
  const kept = !record.kept.response
    ? `${who} the request. No response came.`
    : record.kept.body
      ? `${who} the request and the response.`
      : `${who} the request and the response's status and headers, not its body.`;
  return [
    { field: "route", parts: route },
    { field: "secrets", parts: secrets },
    { field: "masked", parts: maskedLine },
    { field: "kept", parts: [kept] },
    ...(record.failure
      ? [{ field: "failure" as const, parts: ["What was reported: ", { wire: record.failure.reported }] }]
      : []),
  ];
}

type Fields = Record<string, unknown>;
const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const SCOPE_NAMES: readonly string[] = VARIABLE_SCOPES;
const FAILURE_KINDS: readonly string[] = ["network", "timeout", "aborted", "bridge"];

/**
 * What is wrong with `value` as an exchange record a file holds (a
 * workspace backup's history): every field is checked against what the app
 * writes, and a field the app does not write is refused. A file is
 * untrusted; the record is shown as text, and nothing else may ride in it.
 */
export function recordProblems(value: unknown, path: string): string[] {
  const problems: string[] = [];
  const object = (at: string, held: unknown, fields: Record<string, (field: unknown, where: string) => boolean>) => {
    if (!isFields(held)) {
      problems.push(`${at}: Value must be an object.`);
      return;
    }
    for (const key of Object.keys(held))
      if (!Object.hasOwn(fields, key)) problems.push(`${at}.${key}: The app writes no such field.`);
    for (const [key, check] of Object.entries(fields)) {
      const field = Object.hasOwn(held, key) ? held[key] : undefined;
      if (!check(field, `${at}.${key}`)) problems.push(`${at}.${key}: Value is not one the app writes.`);
    }
  };
  const optional = (check: (field: unknown, where: string) => boolean) => (field: unknown, where: string) =>
    field === undefined || check(field, where);
  const text = (field: unknown) => typeof field === "string";
  const yes = (field: unknown) => field === true;
  const flag = (field: unknown) => typeof field === "boolean";
  const texts = (field: unknown) => Array.isArray(field) && field.every(text);
  const nested = (fields: Parameters<typeof object>[2]) => (field: unknown, where: string) => {
    // The nested object says what is wrong with it itself.
    object(where, field, fields);
    return true;
  };
  object(path, value, {
    status: optional(
      nested({
        code: (field) => Number.isInteger(field) && (field as number) >= 0 && (field as number) <= 999,
        text,
      }),
    ),
    durationMs: (field) => typeof field === "number" && Number.isFinite(field) && field >= 0,
    route: (field) => field === "direct" || field === "bridge",
    unpaired: optional(yes),
    host: text,
    secrets: (field, where) => {
      if (!Array.isArray(field)) return false;
      field.forEach((secret, index) =>
        object(`${where}[${index}]`, secret, {
          name: text,
          scope: optional((scope) => typeof scope === "string" && SCOPE_NAMES.includes(scope)),
          holder: optional(text),
        }),
      );
      return true;
    },
    masked: nested({
      address: optional(yes),
      headers: texts,
      body: optional(yes),
      responseHeaders: texts,
      responseBody: optional(yes),
    }),
    kept: nested({ response: flag, body: flag }),
    failure: optional(
      nested({
        kind: (field) => typeof field === "string" && FAILURE_KINDS.includes(field),
        reported: text,
        summary: text,
      }),
    ),
  });
  return problems;
}
