// A collection as a folder of files (T2.1, docs/design/git.md option 4): one file for the collection, one for each
// folder and one for each request, in plain JSON a person can diff. Nothing a send changes is in them (no
// timestamps), keys are in one order, and a text of several lines is a list of lines, one to a line of the file.
// The files are untrusted when read: they are put back together as a collection file and checked by the same
// validator an import is.
import { COLLECTION_FORMAT, type CollectionExport, type Folder, type RequestDoc } from "../model/collection";
import { parseJson } from "../safe-json";
import { sortKeys, validateCollection } from "../import/wayfarer-collection";

export const FOLDER_FORMAT = "wayfarer/folder";
/** The most files a folder may hold, the deepest it may nest, and the longest a file may be. */
export const MAX_FOLDER_FILES = 10_000;
export const MAX_FOLDER_DEPTH = 32;
export const MAX_FOLDER_FILE_CHARS = 25 * 1024 * 1024;

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const NAME = "[a-z0-9]+(?:-[a-z0-9]+)*";
const FOLDER_DIR = new RegExp(`^(${NAME})\\.([A-Za-z0-9_-]{1,64})$`);
const REQUEST_FILE = new RegExp(`^(${NAME})\\.([A-Za-z0-9_-]{1,64})\\.request\\.json$`);
export const COLLECTION_FILE = "collection.json";
const FOLDER_FILE = "folder.json";

/** What was wrong with a folder, one line each, with the path it is about. */
export class FolderError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("\n"));
    this.name = "FolderError";
  }
}

/** Whether `path` (`/`-separated, relative to the collection's folder) is a file of the format. */
export function isFolderPath(path: string): boolean {
  const parts = path.split("/");
  const file = parts.pop() ?? "";
  if (parts.length >= MAX_FOLDER_DEPTH || !parts.every((part) => FOLDER_DIR.test(part))) return false;
  return parts.length === 0
    ? file === COLLECTION_FILE || REQUEST_FILE.test(file)
    : file === FOLDER_FILE || REQUEST_FILE.test(file);
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "untitled"
  );
}

function named(name: string, id: string): string {
  if (!ID.test(id))
    throw new FolderError([`"${name}": its id cannot name a file (letters, digits, "_" and "-", up to 64).`]);
  return `${slug(name)}.${id}`;
}

/** A text of several lines as a list of them, so a change to one line is one line of a diff. */
function wrap(value: unknown): unknown {
  if (typeof value === "string") return value.includes("\n") ? { $lines: value.split("\n") } : value;
  if (Array.isArray(value)) return value.map(wrap);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, wrap(item)]));
  return value;
}

function unwrap(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unwrap);
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    const [only] = entries;
    if (
      entries.length === 1 &&
      only[0] === "$lines" &&
      Array.isArray(only[1]) &&
      only[1].every((l) => typeof l === "string")
    )
      return only[1].join("\n");
    return Object.fromEntries(entries.map(([key, item]) => [key, unwrap(item)]));
  }
  return value;
}

const text = (value: unknown): string => `${JSON.stringify(sortKeys(wrap(value)), null, 2)}\n`;

/** The files of a collection, by path. A secret is already its reference in `source`; nothing is read from outside it. */
export function writeFolder(source: CollectionExport): Record<string, string> {
  const files: Record<string, string> = {};
  const { meta: _meta, id: _id, ...collection } = source.collection;
  files[COLLECTION_FILE] = text({
    ...collection,
    $id: FOLDER_FORMAT,
    kind: "collection",
    id: source.collection.meta.id,
  });

  const dirs = new Map<string, string>();
  const dirOf = (folder: Folder, seen: Set<string> = new Set()): string => {
    const known = dirs.get(folder.meta.id);
    if (known !== undefined) return known;
    if (seen.has(folder.meta.id)) throw new FolderError([`"${folder.name}": folders are each other's parents.`]);
    seen.add(folder.meta.id);
    const parent = folder.parentFolderId ? source.folders.find((f) => f.meta.id === folder.parentFolderId) : undefined;
    const dir = `${parent ? `${dirOf(parent, seen)}/` : ""}${named(folder.name, folder.meta.id)}`;
    dirs.set(folder.meta.id, dir);
    return dir;
  };
  for (const folder of source.folders) {
    const { meta, collectionId: _c, parentFolderId: _p, id: _i, ...rest } = folder;
    files[`${dirOf(folder)}/${FOLDER_FILE}`] = text({ ...rest, $id: FOLDER_FORMAT, kind: "folder", id: meta.id });
  }
  for (const request of source.requests) {
    const { meta, collectionId: _c, folderId, id: _i, ...rest } = request;
    const parent = folderId ? source.folders.find((f) => f.meta.id === folderId) : undefined;
    const dir = parent ? `${dirOf(parent)}/` : "";
    files[`${dir}${named(request.name, meta.id)}.request.json`] = text({
      ...rest,
      $id: FOLDER_FORMAT,
      kind: "request",
      id: meta.id,
    });
  }
  return files;
}

/** The collection a folder holds, as the file an import reads, with every timestamp 0 (the files hold none). */
export function readFolder(files: Record<string, string>): CollectionExport {
  const problems: string[] = [];
  const paths = Object.keys(files);
  if (paths.length > MAX_FOLDER_FILES) throw new FolderError([`The folder holds more than ${MAX_FOLDER_FILES} files.`]);

  const parsed = new Map<string, Record<string, unknown>>();
  for (const path of paths) {
    if (!isFolderPath(path)) {
      problems.push(`${path}: not a file of the format.`);
      continue;
    }
    const content = files[path];
    if (content.length > MAX_FOLDER_FILE_CHARS) {
      problems.push(`${path}: larger than ${MAX_FOLDER_FILE_CHARS / 1024 / 1024} MB.`);
      continue;
    }
    const read = parseJson(content);
    if (!read.ok) {
      problems.push(`${path}: not JSON (a merge conflict leaves markers in a file).`);
      continue;
    }
    const value = unwrap(read.value);
    if (!value || typeof value !== "object" || Array.isArray(value)) problems.push(`${path}: not an object.`);
    else parsed.set(path, value as Record<string, unknown>);
  }

  const meta = (id: unknown) => ({ id: String(id), createdAt: 0, updatedAt: 0 });
  const kindOf = (path: string) =>
    path === COLLECTION_FILE
      ? "collection"
      : path.endsWith(FOLDER_FILE) && path.split("/").at(-1) === FOLDER_FILE
        ? "folder"
        : "request";
  let collection: Record<string, unknown> | undefined;
  const folders: Folder[] = [];
  const requests: RequestDoc[] = [];
  for (const [path, value] of parsed) {
    const kind = kindOf(path);
    const parts = path.split("/");
    const file = parts.pop() ?? "";
    const dir = parts.at(-1);
    const parentDir = parts.at(-2);
    const idOf = (name: string | undefined, pattern: RegExp) =>
      name === undefined ? undefined : pattern.exec(name)?.[2];
    if (value["$id"] !== FOLDER_FORMAT || value["kind"] !== kind)
      problems.push(`${path}: "$id" must be "${FOLDER_FORMAT}" and "kind" "${kind}".`);
    const { $id: _a, kind: _k, id, ...rest } = value;
    const expected = kind === "collection" ? id : kind === "folder" ? idOf(dir, FOLDER_DIR) : idOf(file, REQUEST_FILE);
    if (kind !== "collection" && id !== expected) problems.push(`${path}: its id is not the one in its name.`);
    if (kind === "collection") collection = { ...rest, id, meta: meta(id) };
    else if (kind === "folder")
      folders.push({
        ...(rest as object),
        id,
        meta: meta(id),
        collectionId: "",
        ...(parts.length > 1 ? { parentFolderId: idOf(parentDir, FOLDER_DIR) } : {}),
      } as Folder);
    else
      requests.push({
        ...(rest as object),
        id,
        meta: meta(id),
        collectionId: "",
        ...(parts.length ? { folderId: idOf(dir, FOLDER_DIR) } : {}),
      } as RequestDoc);
  }
  if (!collection && !problems.length) problems.push(`${COLLECTION_FILE}: missing.`);
  const seen = new Set<string>();
  for (const id of [...folders, ...requests].map((entry) => entry.meta.id))
    if (seen.has(id)) problems.push(`The id "${id}" is on two files.`);
    else seen.add(id);
  const folderIds = new Set(folders.map((folder) => folder.meta.id));
  for (const entry of [...folders, ...requests]) {
    const parent = "parentFolderId" in entry ? entry.parentFolderId : (entry as RequestDoc).folderId;
    if (parent && !folderIds.has(parent)) problems.push(`"${entry.name}": the folder it is in has no ${FOLDER_FILE}.`);
  }
  if (problems.length || !collection) throw new FolderError(problems);

  const collectionId = String(collection["id"]);
  for (const entry of [...folders, ...requests]) entry.collectionId = collectionId;
  const source = {
    $id: COLLECTION_FORMAT,
    meta: meta(collectionId),
    collection,
    folders,
    requests,
  };
  const checked = validateCollection(source);
  if (!checked.ok || !checked.payload)
    throw new FolderError((checked.errors ?? []).map((e) => `${e.path}: ${e.message}`));
  return checked.payload;
}
