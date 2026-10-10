import { emptyRequest, type RequestContent, type Row } from "../src/model/request";
import type { Folder } from "../src/model/collection";

/** Name and value pairs as enabled rows, in the order written. */
export function rowsOf(record: Record<string, string>): Row[] {
  return Object.entries(record).map(([key, value]) => ({ key, value, enabled: true }));
}

/** A request with the given fields and nothing else set. */
export function requestContent(fields: Partial<RequestContent> = {}): RequestContent {
  return { ...emptyRequest(), ...fields };
}

/** What a new collection holds for its requests besides variables (P4.9): no auth and no scripts. */
export const inCollection = { auth: { type: "none" }, scripts: { pre: "", post: "" } } as const;

/** What a new folder holds for its requests: it inherits its auth, and has no variables and no scripts. */
export const inFolder = { variables: [] as Row[], auth: { type: "inherit" }, scripts: { pre: "", post: "" } } as const satisfies Pick<Folder, "variables" | "auth" | "scripts">;
