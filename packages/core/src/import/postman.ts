import { newId } from "../id";
import { COLLECTION_FORMAT, type CollectionExport, type EnvironmentDoc, type Folder, type Meta, type RequestDoc } from "../model/collection";
import { RAW_LANGUAGES, isHttpMethod, type AuthConfig, type MultipartPart, type OAuthGrant, type OwnAuth, type RawLanguage, type RequestBody, type Row, type Scripts } from "../model/request";
import { addressParts } from "../export/postman";
import { ImportError } from "./import-error";

/** Something of the file the app could not keep. `item` says where: `request "Login"`. */
export interface Warning {
  item: string;
  message: string;
}

export type Loose = Record<string, unknown>;

export const isObject = (value: unknown): value is Loose => typeof value === "object" && value !== null && !Array.isArray(value);
/** An own field: a file's "constructor" key must not read `Object.prototype.constructor`. */
export const field = (object: Loose, key: string): unknown => (Object.hasOwn(object, key) ? object[key] : undefined);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
export const objects = (value: unknown): Loose[] => list(value).filter(isObject);
/** A value as text: Postman writes numbers and booleans as values too, and `null` for none. */
export const text = (value: unknown): string => (typeof value === "string" ? value : value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value as number | boolean));

/** Folders in folders: a file nested deeper than this is not a collection anyone made. */
export const MAX_DEPTH = 64;

/** A Postman Collection v2.0 or v2.1: it has items. Newman reads a file with no `info`, so this does too. */
export function isPostmanCollection(value: unknown): boolean {
  return isObject(value) && Array.isArray(field(value, "item"));
}

/** A Postman Collection v1, which is not read: Postman itself exports v2.1. */
export function isPostmanV1(value: unknown): boolean {
  return isObject(value) && Array.isArray(field(value, "requests")) && Array.isArray(field(value, "order"));
}

/** A Postman environment or globals file: `values`, or the bare list of them that an older Postman wrote for globals. */
export function isPostmanEnvironment(value: unknown): boolean {
  const values = isObject(value) ? field(value, "values") : value;
  return Array.isArray(values) && (isObject(value) || values.length > 0) && values.every((entry) => isObject(entry) && typeof field(entry, "key") === "string");
}

const description = (value: unknown): { description?: string } => {
  const words = isObject(value) ? text(field(value, "content")) : text(value);
  return words ? { description: words } : {};
};

/** `{key, value, disabled}` entries as rows. A variable may be named by `id` in an old file. */
const rows = (value: unknown): Row[] =>
  objects(value).map((entry) => ({ key: text(field(entry, "key") ?? field(entry, "id")), value: text(field(entry, "value")), enabled: field(entry, "disabled") !== true }));

/** v2.0 may hold headers as one text, a `Name: value` per line. */
function headers(value: unknown): Row[] {
  if (typeof value !== "string") return rows(value);
  return value
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const disabled = line.startsWith("//");
      const colon = line.indexOf(":");
      const name = (colon === -1 ? line : line.slice(0, colon)).replace(/^\/\//, "").trim();
      return { key: name, value: colon === -1 ? "" : line.slice(colon + 1).trim(), enabled: !disabled };
    });
}

/**
 * Postman's `auth`. None at all is "inherit" for a request and a folder,
 * and no auth for a collection. v2.1 holds a type's fields as a list of
 * `{key, value}`, v2.0 as an object.
 */
function auth(value: unknown, item: string, warnings: Warning[], top: boolean): AuthConfig {
  if (!isObject(value)) return top ? { type: "none" } : { type: "inherit" };
  const type = text(field(value, "type"));
  const fields = field(value, type);
  const read = (name: string): string =>
    Array.isArray(fields) ? text(field(objects(fields).find((entry) => field(entry, "key") === name) ?? {}, "value")) : isObject(fields) ? text(field(fields, name)) : "";
  switch (type) {
    case "noauth":
      return { type: "none" };
    case "bearer":
      return { type, token: read("token") };
    case "basic":
      return { type, username: read("username"), password: read("password") };
    case "apikey":
      return { type, key: read("key"), value: read("value"), in: read("in") === "query" ? "query" : "header" };
    case "awsv4":
      return { type, accessKey: read("accessKey"), secretKey: read("secretKey"), sessionToken: read("sessionToken"), region: read("region"), service: read("service") };
    case "oauth2": {
      // Postman's names for the three grants the app has. With none said, Postman asks for a code.
      const grant = OAUTH_GRANTS_OF.get(read("grant_type"));
      if (!grant) {
        warnings.push({ item, message: `Its auth is OAuth 2.0 with a grant the app does not have (${read("grant_type").slice(0, 40)}) and is left out: it is sent with no auth.` });
        return { type: "none" };
      }
      if (read("accessToken")) warnings.push({ item, message: "The OAuth 2.0 token in the file is not kept: get one in the Auth tab." });
      if (read("addTokenTo") === "queryParams") warnings.push({ item, message: "Its OAuth 2.0 token was added to the address: the app sends it in the Authorization header." });
      return {
        type,
        grant,
        authUrl: read("authUrl"),
        tokenUrl: read("accessTokenUrl"),
        clientId: read("clientId"),
        clientSecret: read("clientSecret"),
        scope: read("scope"),
        username: read("username"),
        password: read("password"),
        clientAuth: read("client_authentication") === "body" ? "body" : "header",
        retryOn401: false,
      };
    }
    default:
      warnings.push({ item, message: `Its auth is of a type the app does not have (${type || "no type"}) and is left out: it is sent with no auth.` });
      return { type: "none" };
  }
}

const OAUTH_GRANTS_OF = new Map<string, OAuthGrant>([
  ["", "authorization_code"],
  ["authorization_code", "authorization_code"],
  ["authorization_code_with_pkce", "authorization_code"],
  ["client_credentials", "client_credentials"],
  ["password_credentials", "password"],
]);

/** Postman's `event`: `prerequest` and `test`. A script is a list of lines, or one text. */
function scripts(value: unknown, item: string, warnings: Warning[]): Scripts {
  const of = (listen: string): string =>
    objects(value)
      .filter((event) => field(event, "listen") === listen && field(event, "disabled") !== true)
      .map((event) => {
        const script = field(event, "script");
        const exec = isObject(script) ? field(script, "exec") : script;
        return Array.isArray(exec) ? exec.map(text).join("\n") : text(exec);
      })
      .join("\n");
  const others = objects(value).map((event) => text(field(event, "listen"))).filter((listen) => listen !== "prerequest" && listen !== "test");
  if (others.length) warnings.push({ item, message: `A script for "${others[0]}" is left out: the app runs a script before a request and after its response.` });
  return { pre: of("prerequest"), post: of("test") };
}

/**
 * The address as text, from the parts Postman sends by; `raw` when the file
 * has no parts. A path variable (`:id`) is replaced by the value the file
 * gives it, or is `{{id}}` when it gives none. With the Params rows: the
 * query's entries in the file's order, one that is switched off among them.
 */
function address(value: unknown, item: string, warnings: Warning[]): { url: string; params: Row[] } {
  // An address that is one text has its query in it: the rows are what the text says.
  const inText = (url: string): Row[] => (addressParts(url).query ?? []).map((entry) => ({ key: entry.key, value: entry.value ?? "", enabled: true }));
  if (!isObject(value)) return { url: text(value), params: inText(text(value)) };
  // In the file a part is its own text. In an address it must not hold what the address is cut at, outside a variable.
  const kept = (part: string, marks: RegExp): string =>
    part
      .split(/(\{\{[^{}]*\}\})/)
      .map((piece, index) => (index % 2 ? piece : piece.replace(marks, (mark) => `%${mark.charCodeAt(0).toString(16).toUpperCase()}`)))
      .join("");
  const params = objects(field(value, "query")).map((entry) => {
    const enabled = field(entry, "disabled") !== true;
    // A row that is sent reads as the address has it; one that is switched off is not in the address, and stays as written.
    return { key: enabled ? kept(text(field(entry, "key")), /[#&=]/g) : text(field(entry, "key")), value: enabled ? kept(text(field(entry, "value")), /[#&]/g) : text(field(entry, "value")), enabled };
  });
  const off = params.filter((row) => !row.enabled).map((row) => row.key);
  if (off.length) warnings.push({ item, message: `${off.length === 1 ? `A query parameter that is switched off (${off[0]}) is` : `${off.length} query parameters that are switched off are`} kept for an export, but the composer has no switch for a parameter: it does not show one, and saving the request there drops it.` });
  const host = field(value, "host");
  if (host === undefined) return { url: text(field(value, "raw")), params: params.length ? params : inText(text(field(value, "raw"))) };

  const variables = objects(field(value, "variable"));
  const replaced: string[] = [];
  const named: string[] = [];
  const segment = (part: string): string => {
    // A path variable is one the file lists: a part that only starts with a colon is text.
    const variable = part.startsWith(":") ? variables.find((entry) => field(entry, "key") === part.slice(1)) : undefined;
    if (!variable) return part;
    const given = text(field(variable, "value"));
    (given ? replaced : named).push(part);
    return given || `{{${part.slice(1)}}}`;
  };
  const inPath = (part: string): string => kept(segment(part), /[?#]/g);
  const joined = (parts: unknown, by: string, each: (part: string) => string = (part) => part): string => (Array.isArray(parts) ? parts.map((part) => each(text(part))).join(by) : each(text(parts)));
  const login = field(value, "auth");
  const protocol = field(value, "protocol");
  const port = field(value, "port");
  const path = field(value, "path");
  const query = objects(field(value, "query"))
    .filter((entry) => field(entry, "disabled") !== true)
    .map((entry) => (field(entry, "value") === null || field(entry, "value") === undefined ? kept(text(field(entry, "key")), /[#&=]/g) : `${kept(text(field(entry, "key")), /[#&=]/g)}=${kept(text(field(entry, "value")), /[#&]/g)}`));
  const hash = field(value, "hash");
  const url =
    (protocol === undefined ? "" : `${text(protocol)}://`) +
    (isObject(login) ? `${text(field(login, "user"))}${field(login, "password") === undefined ? "" : `:${text(field(login, "password"))}`}@` : "") +
    joined(host, ".") +
    (port === undefined ? "" : `:${text(port)}`) +
    (path === undefined ? "" : `/${Array.isArray(path) ? joined(path, "/", inPath) : text(path).replace(/^\//, "").split("/").map(inPath).join("/")}`) +
    (query.length ? `?${query.join("&")}` : "") +
    (hash === undefined ? "" : `#${text(hash)}`);
  // The app has `{{variables}}` only: a path variable with a value is that value, and one without is a variable of its name.
  if (replaced.length) warnings.push({ item, message: `${replaced.length === 1 ? `The path variable ${replaced[0]} is` : `The path variables ${replaced.join(", ")} are`} replaced by ${replaced.length === 1 ? "its value" : "their values"} in the address: the app has no path variables.` });
  if (named.length) warnings.push({ item, message: `${named.length === 1 ? `The path variable ${named[0]} has` : `The path variables ${named.join(", ")} have`} no value in the file: in the address ${named.length === 1 ? "it is" : "they are"} ${named.map((part) => `{{${part.slice(1)}}}`).join(", ")}, to be given a value as ${named.length === 1 ? "a variable" : "variables"}.` });
  return { url, params };
}

/** Postman's `body`: each part the file holds is kept, and `mode` says which is sent. */
function body(value: unknown, item: string, warnings: Warning[]): RequestBody {
  if (!isObject(value)) return { mode: "none" };
  const options = field(value, "options");
  const raw = isObject(options) ? field(options, "raw") : undefined;
  const named = isObject(raw) ? text(field(raw, "language")) : "";
  const language: RawLanguage = (RAW_LANGUAGES as readonly string[]).includes(named) ? (named as RawLanguage) : "text";
  const file = (src: unknown): string => text(Array.isArray(src) ? src[0] : src);
  const kept: Omit<RequestBody, "mode"> = {
    ...(typeof field(value, "raw") === "string" && { raw: { language, text: text(field(value, "raw")) } }),
    ...(Array.isArray(field(value, "urlencoded")) && { urlencoded: rows(field(value, "urlencoded")) }),
    ...(Array.isArray(field(value, "formdata")) && {
      multipart: objects(field(value, "formdata")).map((part): MultipartPart => {
        const key = text(field(part, "key"));
        const enabled = field(part, "disabled") !== true;
        return field(part, "type") === "file" ? { key, enabled, kind: "file", fileId: "", fileName: file(field(part, "src")) } : { key, enabled, kind: "text", value: text(field(part, "value")) };
      }),
    }),
    ...(isObject(field(value, "file")) && { binary: { fileId: "", fileName: file(field(field(value, "file") as Loose, "src")) } }),
    // Postman keeps the variables as text, as the app does.
    ...(isObject(field(value, "graphql")) && { graphql: { query: text(field(field(value, "graphql") as Loose, "query")), variables: text(field(field(value, "graphql") as Loose, "variables")) } }),
  };
  if (kept.multipart?.some((part) => part.kind === "file") || kept.binary) warnings.push({ item, message: "A file of its body is named, not included: choose it again in the Body tab." });
  if (field(value, "disabled") === true) return { mode: "none", ...kept };
  switch (field(value, "mode")) {
    case "raw":
      return { ...kept, mode: "raw", raw: kept.raw ?? { language, text: "" } };
    case "urlencoded":
      return { ...kept, mode: "urlencoded", urlencoded: kept.urlencoded ?? [] };
    case "formdata":
      return { ...kept, mode: "multipart", multipart: kept.multipart ?? [] };
    case "file":
      return { ...kept, mode: "binary" };
    case "graphql":
      return { ...kept, mode: "graphql", graphql: kept.graphql ?? { query: "", variables: "" } };
    case undefined:
    case null:
    case "none":
      return { mode: "none", ...kept };
    default:
      warnings.push({ item, message: `Its body is of a kind the app does not have (${text(field(value, "mode"))}) and is left out.` });
      return { mode: "none", ...kept };
  }
}

/**
 * A Postman Collection v2.0 or v2.1 as a collection of the app, under new
 * ids, with what could not be kept. Scripts are kept as text: whether they
 * may run is not an importer's to say. The caller checks the result with
 * the collection validator.
 */
export function postmanCollection(value: unknown): { payload: CollectionExport; warnings: Warning[] } {
  if (!isObject(value)) throw new ImportError("The file is not a Postman collection.");
  const warnings: Warning[] = [];
  const now = Date.now();
  const meta = (): Meta => ({ id: newId(), createdAt: now, updatedAt: now, version: 1 });
  const top = meta();
  const info = field(value, "info");
  const name = text(isObject(info) ? field(info, "name") : field(value, "name")).trim() || "Imported from Postman";
  const folders: Folder[] = [];
  const requests: RequestDoc[] = [];
  let examples = 0;
  let mixed = false;

  const walk = (items: unknown, parent: string | undefined, depth: number): void => {
    if (depth > MAX_DEPTH) throw new ImportError(`The collection's folders are nested more than ${MAX_DEPTH} deep.`);
    let folderOrder = 0;
    let requestOrder = 0;
    for (const entry of objects(items)) {
      const own = meta();
      const entryName = text(field(entry, "name")).trim();
      if (Array.isArray(field(entry, "item"))) {
        // The app lists a folder's folders before its requests; a Postman file has them in one order.
        if (requestOrder > 0) mixed = true;
        const item = `folder "${entryName || "Folder"}"`;
        folders.push({
          id: own.id,
          meta: own,
          collectionId: top.id,
          ...(parent && { parentFolderId: parent }),
          name: entryName || "Folder",
          ...description(field(entry, "description")),
          order: folderOrder++,
          variables: rows(field(entry, "variable")),
          auth: auth(field(entry, "auth"), item, warnings, false),
          scripts: scripts(field(entry, "event"), item, warnings),
        });
        walk(field(entry, "item"), own.id, depth + 1);
        continue;
      }
      const request = field(entry, "request");
      const item = `request "${entryName || "Request"}"`;
      const source = isObject(request) ? request : { url: request };
      const { url, params } = address(field(source, "url"), item, warnings);
      const method = text(field(source, "method") ?? "GET").toUpperCase();
      examples += list(field(entry, "response")).length;
      if (!url.trim() || !isHttpMethod(method)) {
        warnings.push({ item, message: !url.trim() ? "It has no address and is left out." : `Its method (${method.slice(0, 40)}) is not an HTTP method and it is left out.` });
        continue;
      }
      requests.push({
        id: own.id,
        meta: own,
        collectionId: top.id,
        ...(parent && { folderId: parent }),
        name: entryName || `${method} ${url}`,
        ...description(field(source, "description")),
        order: requestOrder++,
        method,
        url,
        params,
        headers: headers(field(source, "header")),
        body: body(field(source, "body"), item, warnings),
        auth: auth(field(source, "auth"), item, warnings, false),
        scripts: scripts(field(entry, "event"), item, warnings),
        tests: [],
        settings: {},
      });
    }
  };
  walk(field(value, "item"), undefined, 0);

  const item = `collection "${name}"`;
  if (examples) warnings.push({ item, message: `${examples} saved ${examples === 1 ? "response is" : "responses are"} left out: the app keeps responses in its history, not in a collection.` });
  if (mixed) warnings.push({ item, message: "Where a folder holds requests before folders, the folders now come first: the app lists a folder's folders before its requests." });
  return {
    payload: {
      $id: COLLECTION_FORMAT,
      meta: top,
      collection: {
        id: top.id,
        meta: top,
        name,
        ...description(isObject(info) ? field(info, "description") : field(value, "description")),
        order: 0,
        variables: rows(field(value, "variable")),
        auth: auth(field(value, "auth"), item, warnings, true) as OwnAuth,
        scripts: scripts(field(value, "event"), item, warnings),
      },
      folders,
      requests,
    },
    warnings,
  };
}

/**
 * A Postman environment or globals file as an environment of the app.
 * Postman's globals become an environment too, and the report says so: an
 * import adds, and the app's own globals are the user's.
 */
export function postmanEnvironment(value: unknown): { environment: EnvironmentDoc; warnings: Warning[] } {
  const globals = Array.isArray(value) || (isObject(value) && field(value, "_postman_variable_scope") === "globals");
  const name = (isObject(value) ? text(field(value, "name")).trim() : "") || (globals ? "Postman globals" : "Imported from Postman");
  const now = Date.now();
  const id = newId();
  return {
    environment: {
      id,
      meta: { id, createdAt: now, updatedAt: now, version: 1 },
      name,
      order: 0,
      vars: objects(isObject(value) ? field(value, "values") : value).map((entry) => ({ key: text(field(entry, "key")), value: text(field(entry, "value")), enabled: field(entry, "enabled") !== false && field(entry, "disabled") !== true })),
    },
    warnings: globals ? [{ item: `environment "${name}"`, message: "Postman's globals are imported as an environment: choose it as the active environment, or copy what you need into the app's globals." }] : [],
  };
}
