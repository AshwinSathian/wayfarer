import type { CollectionExport, EnvironmentDoc, Folder, RequestDoc } from "../model/collection";
import type { AuthConfig, RequestBody, Row, Scripts } from "../model/request";
import { SECRET_REFERENCE } from "../model/variables";

export const POSTMAN_COLLECTION_SCHEMA = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

/** Something of the collection that Postman's format has no place for. `item` says where: `request "Login"`. */
export interface ExportNote {
  item: string;
  message: string;
}

/** An object of the file. */
type Entry = Record<string, unknown>;

const rows = (list: Row[], type?: string): Entry[] => list.map((row) => ({ key: row.key, value: row.value, ...(type && { type }), ...(!row.enabled && { disabled: true }) }));

const field = (key: string, value: string): Entry => ({ key, value, type: "string" });

/** Postman's `auth`. A request or a folder without one inherits, so `inherit` is no entry at all. */
function auth(config: AuthConfig): { auth?: Entry } {
  switch (config.type) {
    case "inherit":
      return {};
    case "none":
      return { auth: { type: "noauth" } };
    case "bearer":
      return { auth: { type: "bearer", bearer: [field("token", config.token)] } };
    case "basic":
      return { auth: { type: "basic", basic: [field("username", config.username), field("password", config.password)] } };
    case "apikey":
      return { auth: { type: "apikey", apikey: [field("key", config.key), field("value", config.value), field("in", config.in)] } };
  }
}

/** Postman's `event`: the pre-request script listens to `prerequest`, the post-response script to `test`. */
function events(scripts: Scripts): { event?: Entry[] } {
  const event = ([["prerequest", scripts.pre], ["test", scripts.post]] as const)
    .filter(([, source]) => source !== "")
    .map(([listen, source]) => ({ listen, script: { type: "text/javascript", exec: source.split("\n") } }));
  return event.length ? { event } : {};
}

/**
 * The address in parts. Postman sends what the parts say and ignores `raw`,
 * so they are cut from the text the way Postman cuts them: as text, with
 * every `{{variable}}` left as typed.
 *
 * The query that is sent is the one in the text. The Params rows add what
 * the text does not have: a row that is switched off, in its place.
 */
function url(raw: string, params: Row[]): Entry {
  let rest = raw;
  const cut = (mark: string): string | undefined => {
    const at = rest.indexOf(mark);
    if (at === -1) return undefined;
    const tail = rest.slice(at + mark.length);
    rest = rest.slice(0, at);
    return tail;
  };
  const hash = cut("#");
  const queryText = cut("?");
  const schemeAt = rest.indexOf("://");
  const protocol = schemeAt > 0 && !rest.slice(0, schemeAt).includes("/") ? rest.slice(0, schemeAt) : undefined;
  if (protocol !== undefined) rest = rest.slice(schemeAt + 3);
  const slash = rest.indexOf("/");
  let authority = slash === -1 ? rest : rest.slice(0, slash);
  const path = slash === -1 ? undefined : rest.slice(slash + 1);
  const at = authority.lastIndexOf("@");
  const user = at === -1 ? undefined : authority.slice(0, at);
  if (at !== -1) authority = authority.slice(at + 1);
  // ponytail: an IPv6 host in brackets is not cut at its own colons; anything else with a colon is host and port.
  const colon = authority.startsWith("[") ? authority.indexOf("]:") + 1 || -1 : authority.lastIndexOf(":");
  const port = colon === -1 ? undefined : authority.slice(colon + 1);
  const host = colon === -1 ? authority : authority.slice(0, colon);

  const sent = (queryText === undefined ? [] : queryText.split("&")).map((pair): Entry => {
    const equals = pair.indexOf("=");
    return equals === -1 ? { key: pair, value: null } : { key: pair.slice(0, equals), value: pair.slice(equals + 1) };
  });
  const query: Entry[] = [];
  for (const row of params) {
    if (!row.enabled) query.push({ key: row.key, value: row.value, disabled: true });
    else if (row.key && sent.length) query.push(sent.shift()!);
  }
  query.push(...sent);

  return {
    raw,
    ...(protocol !== undefined && { protocol }),
    ...(user !== undefined && { auth: { user: user.split(":")[0], password: user.includes(":") ? user.slice(user.indexOf(":") + 1) : "" } }),
    host: host.startsWith("[") ? [host] : host.split("."),
    ...(port !== undefined && { port }),
    ...(path !== undefined && { path: path.split("/") }),
    ...(query.length && { query }),
    ...(hash !== undefined && { hash }),
  };
}

/** Postman's `body`. Every part the request keeps is written, as the app keeps it; `mode` says which is sent, and without one nothing is. */
function body(content: RequestBody): { body?: Entry } {
  const out: Entry = {
    ...(content.mode !== "none" && { mode: ({ raw: "raw", urlencoded: "urlencoded", multipart: "formdata", binary: "file" } as const)[content.mode] }),
    ...(content.raw && { raw: content.raw.text, options: { raw: { language: content.raw.language } } }),
    ...(content.urlencoded && { urlencoded: rows(content.urlencoded, "text") }),
    ...(content.multipart && {
      formdata: content.multipart.map((part) => ({
        key: part.key,
        ...(part.kind === "text" ? { value: part.value, type: "text" } : { type: "file", src: part.fileName }),
        ...(!part.enabled && { disabled: true }),
      })),
    }),
    ...(content.binary && { file: { src: content.binary.fileName } }),
  };
  return Object.keys(out).length ? { body: out } : {};
}

function request(doc: RequestDoc, notes: ExportNote[]): Entry {
  const item = `request "${doc.name}"`;
  if (doc.tests.length) notes.push({ item, message: `Its ${doc.tests.length === 1 ? "assertion is" : `${doc.tests.length} assertions are`} left out: Postman has tests only as scripts.` });
  if (doc.body.multipart?.some((part) => part.kind === "file") || doc.body.binary) notes.push({ item, message: "A file of its body is named, not included: choose it again in Postman." });
  // A file body's own type is a header in Postman, as it is on the wire.
  const typed = doc.body.mode === "binary" && doc.body.binary?.contentType && !doc.headers.some((row) => row.enabled && row.key.toLowerCase() === "content-type");
  const header = typed ? [...doc.headers, { key: "Content-Type", value: doc.body.binary?.contentType ?? "", enabled: true }] : doc.headers;
  return {
    name: doc.name,
    id: doc.id,
    ...events(doc.scripts),
    request: { method: doc.method, header: rows(header), ...body(doc.body), url: url(doc.url, doc.params), ...auth(doc.auth) },
    response: [],
  };
}

/**
 * A collection as a Postman Collection v2.1 file, with what the format has
 * no place for. Give it what went through the redactor: it writes what it
 * is given.
 */
export function postmanCollection(source: CollectionExport): { file: Entry; notes: ExportNote[] } {
  const notes: ExportNote[] = [];
  const byOrder = <T extends { order: number; id: string }>(list: T[]) => [...list].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const written = new Set<Folder>();
  const ids = new Set(source.folders.map((folder) => folder.id));
  const items = (parent: string | undefined): Entry[] => [
    ...byOrder(source.folders.filter((folder) => folder.parentFolderId === parent && !written.has(folder))).map((folder) => group(folder)),
    ...byOrder(source.requests.filter((doc) => doc.folderId === parent)).map((doc) => request(doc, notes)),
  ];
  const group = (folder: Folder): Entry => {
    written.add(folder);
    if (folder.variables.length) notes.push({ item: `folder "${folder.name}"`, message: "Its variables are written, but Postman does not read a folder's variables: move them to the collection or to an environment there." });
    return { name: folder.name, id: folder.id, ...(folder.variables.length && { variable: rows(folder.variables, "string") }), ...auth(folder.auth), ...events(folder.scripts), item: items(folder.id) };
  };
  const { collection } = source;
  const top = items(undefined);
  // A folder or a request whose parent the file does not hold, or folders that name each other as parents, go to the top: nothing is left out without a word.
  for (const folder of byOrder(source.folders)) if (!written.has(folder)) top.push(group(folder));
  top.push(...byOrder(source.requests.filter((doc) => doc.folderId !== undefined && !ids.has(doc.folderId))).map((doc) => request(doc, notes)));
  return {
    file: {
      info: { _postman_id: collection.id, name: collection.name, ...(collection.description && { description: collection.description }), schema: POSTMAN_COLLECTION_SCHEMA },
      item: top,
      ...auth(collection.auth),
      ...events(collection.scripts),
      ...(collection.variables.length && { variable: rows(collection.variables, "string") }),
    },
    notes,
  };
}

/**
 * An environment as a Postman environment file. `value` gives what the file
 * holds of a variable's value: nothing or the plaintext for a protected one,
 * as the user chose. A protected variable is of Postman's type `secret`.
 */
export function postmanEnvironment(environment: EnvironmentDoc, value: (text: string) => string): Entry {
  return {
    id: environment.id,
    name: environment.name,
    values: environment.vars.map((row) => ({ key: row.key, value: value(row.value), type: SECRET_REFERENCE.test(row.value) ? "secret" : "default", enabled: row.enabled })),
    _postman_variable_scope: "environment",
  };
}
