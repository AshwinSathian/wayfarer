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
    case "awsv4":
      return { auth: { type: "awsv4", awsv4: [field("accessKey", config.accessKey), field("secretKey", config.secretKey), field("sessionToken", config.sessionToken), field("region", config.region), field("service", config.service)] } };
    case "oauth2":
      // The code grant is always sent with PKCE. A token is not part of the auth, and "retry on 401" has no place in the format.
      return {
        auth: {
          type: "oauth2",
          oauth2: [
            field("grant_type", config.grant === "authorization_code" ? "authorization_code_with_pkce" : config.grant === "password" ? "password_credentials" : config.grant),
            field("authUrl", config.authUrl),
            field("accessTokenUrl", config.tokenUrl),
            field("clientId", config.clientId),
            field("clientSecret", config.clientSecret),
            field("scope", config.scope),
            field("username", config.username),
            field("password", config.password),
            field("client_authentication", config.clientAuth),
            field("addTokenTo", "header"),
          ],
        },
      };
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
 * The parts of an address, cut from its text the way Postman cuts them:
 * as text, and never inside a `{{variable}}`, whose name may hold any of
 * the characters an address is cut at.
 */
export function addressParts(raw: string): { protocol?: string; auth?: { user: string; password?: string }; host: string[]; port?: string; path?: string[]; query?: { key: string; value: string | null }[]; hash?: string } {
  // Each variable is held aside as one character that no address is cut at. ponytail: an address that already holds that character is cut as it stands.
  const held: string[] = [];
  const HOLD = "\uE000";
  let rest = raw.includes(HOLD) ? raw : raw.replace(/\{\{[^{}]*\}\}/g, (variable) => HOLD + String.fromCharCode(0xe001 + held.push(variable) - 1));
  const back = (part: string): string => (held.length ? part.replace(/\uE000([\uE001-\uF8FF])/g, (_match, index: string) => held[index.charCodeAt(0) - 0xe001]) : part);
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
  return {
    ...(protocol !== undefined && { protocol: back(protocol) }),
    ...(user !== undefined && { auth: { user: back(user.split(":")[0]), ...(user.includes(":") && { password: back(user.slice(user.indexOf(":") + 1)) }) } }),
    host: host.startsWith("[") ? [back(host)] : host.split(".").map(back),
    ...(port !== undefined && { port: back(port) }),
    ...(path !== undefined && { path: path.split("/").map(back) }),
    ...(queryText !== undefined && {
      query: queryText.split("&").map((pair) => {
        const equals = pair.indexOf("=");
        return equals === -1 ? { key: back(pair), value: null } : { key: back(pair.slice(0, equals)), value: back(pair.slice(equals + 1)) };
      }),
    }),
    ...(hash !== undefined && { hash: back(hash) }),
  };
}

/**
 * Postman's `url`. Postman sends what the parts say and ignores `raw`.
 *
 * The query that is sent is the one in the text. The Params rows add what
 * the text does not have: a row that is switched off, in its place.
 */
function url(raw: string, params: Row[]): Entry {
  const { query: sent = [], ...parts } = addressParts(raw);
  const query: Entry[] = [];
  for (const row of params) {
    if (!row.enabled) {
      query.push({ key: row.key, value: row.value, disabled: true });
      continue;
    }
    const next = sent.shift();
    if (next) query.push(next);
  }
  query.push(...sent);
  const { hash, ...before } = parts;
  return { raw, ...before, ...(query.length && { query }), ...(hash !== undefined && { hash }) };
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
    request: { method: doc.method, header: rows(header), ...body(doc.body), url: url(doc.url, doc.params), ...auth(doc.auth), ...(doc.description && { description: doc.description }) },
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
    return { name: folder.name, id: folder.id, ...(folder.description && { description: folder.description }), ...(folder.variables.length && { variable: rows(folder.variables, "string") }), ...auth(folder.auth), ...events(folder.scripts), item: items(folder.id) };
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
