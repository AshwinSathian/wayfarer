import type { PastRequest } from "./exchange";
import type { FilledSecret } from "./record";

/** How much of a body the Sent part draws, in characters. History keeps up to a megabyte; a page of that size is not drawn. */
export const SENT_BODY_SHOWN = 100_000;

/** What the Sent part shows of one send. Every field comes from what history keeps, which the redactor has masked. */
export interface SentView {
  method: string;
  /** The address as sent, a secret in it `***`. */
  address: string;
  /** The headers the app set, in the order they went out. A credential's value is `***`. */
  headers: { name: string; value: string }[];
  /** The body's text, or what stands for it: a form's fields, a file's name and size. Absent when none was sent. */
  body?: { text: string; shown: number; of: number };
  route: "direct" | "bridge";
  /** The vault secrets filled, by name. `null`: the entry holds no record, so it is not recorded. */
  secrets: FilledSecret[] | null;
}

/**
 * What was sent, read off a history entry: the entry of a send just made, or one that is stored. It reads no
 * `BuiltRequest` and no secret: `sent` and `record` were made after the redactor (`exchange`), and they are the only
 * source here. Nothing is unmasked, and nothing is looked for again: a view of what a stored entry holds shows what it holds.
 */
export function sentView(entry: Pick<PastRequest, "sent" | "route" | "record">): SentView {
  const { sent } = entry;
  const text = sent.bodyPreview;
  return {
    method: sent.method,
    address: sent.url,
    headers: sent.headers.map(([name, value]) => ({ name, value })),
    ...(text !== undefined && {
      body: { text: text.slice(0, SENT_BODY_SHOWN), shown: Math.min(text.length, SENT_BODY_SHOWN), of: text.length },
    }),
    route: entry.route,
    secrets: entry.record?.secrets ?? null,
  };
}
