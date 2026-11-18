// A folder holds a credential as `***` (it is written through the redactor, as a shared file is), so a collection taken
// from it must not turn a credential typed here into `***`: wherever the folder has the mask and the collection here
// has a value at the same place, the value here stays.
import type { CollectionExport } from "../model/collection";
import { MASK } from "../redact/redactor";

function restore(taken: unknown, here: unknown): unknown {
  if (taken === MASK) return typeof here === "string" ? here : taken;
  if (Array.isArray(taken)) {
    return taken.map((item, index) => {
      const other: unknown = Array.isArray(here) ? here[index] : undefined;
      const row = (value: unknown) =>
        value && typeof value === "object" ? (value as { key?: unknown }).key : undefined;
      // A row moved is not the row here: its name must be the same.
      return row(item) !== row(other) ? item : restore(item, other);
    });
  }
  if (taken && typeof taken === "object")
    return Object.fromEntries(
      Object.entries(taken).map(([key, value]) => [
        key,
        restore(
          value,
          here && typeof here === "object" && Object.hasOwn(here, key)
            ? (here as Record<string, unknown>)[key]
            : undefined,
        ),
      ]),
    );
  return taken;
}

/** `taken` with each `***` put back to what `here` holds in the same place (a folder or request is found by its id). */
export function keepCredentialsHere(taken: CollectionExport, here: CollectionExport): CollectionExport {
  const byId = <T extends { meta: { id: string } }>(list: T[]) => new Map(list.map((entry) => [entry.meta.id, entry]));
  const folders = byId(here.folders);
  const requests = byId(here.requests);
  return {
    ...taken,
    collection: restore(taken.collection, here.collection) as CollectionExport["collection"],
    folders: taken.folders.map((f) => restore(f, folders.get(f.meta.id)) as (typeof taken.folders)[number]),
    requests: taken.requests.map((r) => restore(r, requests.get(r.meta.id)) as (typeof taken.requests)[number]),
  };
}
