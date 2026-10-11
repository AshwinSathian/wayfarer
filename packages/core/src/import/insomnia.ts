import { addressParts } from "../export/postman";
import { newId } from "../id";
import type { EnvironmentDoc } from "../model/collection";
import type { Row } from "../model/request";
import { ImportError } from "./import-error";
import { MAX_DEPTH, field, isObject, objects, text, type Loose, type Warning } from "./postman";

/** The name of a collection made from requests whose workspace the file does not hold, or that has no name. */
const UNNAMED = "Imported from Insomnia";

/** An Insomnia export: format 4 (`_type: export`, a flat list of resources) or format 5 (`type: collection.insomnia.rest/5.0`). */
export function isInsomnia(value: unknown): boolean {
  if (!isObject(value)) return false;
  return field(value, "_type") === "export" || Object.hasOwn(value, "__export_format") || /^\w+\.insomnia(\.rest)?\/\d/.test(text(field(value, "type")));
}

/**
 * Insomnia writes a variable as `{{ _.name }}`, `{{ name }}` or
 * `{{ _['name'] }}`; the app as `{{name}}`. A value inside an object of an
 * environment is `{{ _.object.name }}` there and `{{object.name}}` here.
 */
const VARIABLE = /\{\{\s*(?:_\.|_(?=\[))?((?:\w[\w-]*|\[(?:'[^'\]]*'|"[^"\]]*")\])(?:\.\w[\w-]*|\[(?:'[^'\]]*'|"[^"\]]*")\])*)\s*\}\}/g;
const variables = (value: string): string =>
  value.replace(VARIABLE, (_match, path: string) => `{{${path.replace(/\[(?:'([^'\]]*)'|"([^"\]]*)")\]/g, (_part, single?: string, double?: string) => `.${single ?? double ?? ""}`).replace(/^\./, "")}}}`);

/** What a text still holds of Insomnia's templates once its variables are the app's: a `{% tag %}`, a filter. Read with `indexOf`, so in one pass. */
function foreign(value: string): string[] {
  const found: string[] = [];
  for (const [open, close] of [["{%", "%}"], ["{{", "}}"]] as const) {
    let at = value.indexOf(open);
    while (at !== -1) {
      const end = value.indexOf(close, at + 2);
      if (end === -1) break;
      const template = value.slice(at, end + 2);
      if (open === "{%" || !/^\{\{[\w.$-]+\}\}$/.test(template)) found.push(template);
      at = value.indexOf(open, end + 2);
    }
  }
  return found;
}

/** Reads the values of one item: each as text with the app's variables, and what it could not turn is said once for the item. */
function reader(item: string, warnings: Warning[]): { said: (value: unknown) => string; done: () => void } {
  const templates: string[] = [];
  return {
    said: (value) => {
      const turned = variables(text(value));
      templates.push(...foreign(turned));
      return turned;
    },
    done: () => {
      if (templates.length) warnings.push({ item, message: `It uses a template of Insomnia's (${templates[0].slice(0, 40)}${templates.length > 1 ? `, and ${templates.length - 1} more` : ""}), which the app does not have: the text is kept as written.` });
    },
  };
}

/** An environment's data as rows. A value in an object is named by its path, as a request names it: `object.name`. */
function rowsOf(data: unknown, said: (value: unknown) => string, prefix = "", depth = 0): Row[] {
  if (!isObject(data)) return [];
  return Object.keys(data).flatMap((key) => {
    const value = data[key];
    return isObject(value) && depth < MAX_DEPTH ? rowsOf(value, said, `${prefix}${key}.`, depth + 1) : [{ key: prefix + key, value: said(value), enabled: true }];
  });
}

function environment(name: string, vars: Row[]): EnvironmentDoc {
  const id = newId();
  const now = Date.now();
  return { id, meta: { id, createdAt: now, updatedAt: now, version: 1 }, name, order: 0, vars };
}

/** `{name, value, disabled}` entries as Postman's `{key, value, disabled}`. A row with no name and no value is one the editor left empty. */
const pairs = (value: unknown, said: (value: unknown) => string): { key: string; value: string; disabled?: true }[] =>
  objects(value)
    .map((entry) => ({ key: said(field(entry, "name")), value: said(field(entry, "value")), ...(field(entry, "disabled") === true && { disabled: true as const }) }))
    .filter((entry) => entry.key !== "" || entry.value !== "");

/**
 * Insomnia's `authentication` as Postman's `auth`. One with no type, or
 * one that is switched off, takes the nearest folder's, as Insomnia does:
 * that is no `auth` at all. A type the app does not have keeps its name,
 * and the Postman importer says it is left out.
 */
function auth(value: unknown, said: (value: unknown) => string): { auth?: Loose } {
  if (!isObject(value) || typeof field(value, "type") !== "string" || field(value, "disabled") === true) return {};
  const type = text(field(value, "type"));
  const read = (name: string): string => said(field(value, name));
  switch (type) {
    case "none":
      return { auth: { type: "noauth" } };
    case "basic":
      return { auth: { type, basic: { username: read("username"), password: read("password") } } };
    case "bearer": {
      // Insomnia sends "<prefix> <token>", and "Bearer" when there is no prefix. Another prefix is a header of its own.
      const prefix = read("prefix").trim();
      if (!prefix || prefix === "Bearer") return { auth: { type, bearer: { token: read("token") } } };
      return { auth: { type: "apikey", apikey: { key: "Authorization", value: prefix === "NO_PREFIX" ? read("token") : `${prefix} ${read("token")}`, in: "header" } } };
    }
    case "apikey": {
      const place = text(field(value, "addTo"));
      if (place && place !== "header" && place !== "queryParams") return { auth: { type: `an API key in a ${place}` } };
      return { auth: { type, apikey: { key: read("key"), value: read("value"), in: place === "queryParams" ? "query" : "header" } } };
    }
    default:
      return { auth: { type } };
  }
}

/** Insomnia's `body` as Postman's: text by its media type, a form's fields, a multipart form's parts, a file. */
function body(value: unknown, said: (value: unknown) => string): { body?: Loose } {
  if (!isObject(value)) return {};
  const type = text(field(value, "mimeType")).toLowerCase();
  const params = field(value, "params");
  const off = (entry: Loose) => field(entry, "disabled") === true && { disabled: true };
  if (type === "multipart/form-data" && Array.isArray(params)) {
    return {
      body: {
        mode: "formdata",
        formdata: objects(params).map((part) =>
          field(part, "type") === "file" ? { key: said(field(part, "name")), type: "file", src: text(field(part, "fileName")), ...off(part) } : { key: said(field(part, "name")), value: said(field(part, "value")), type: "text", ...off(part) },
        ),
      },
    };
  }
  if (type === "application/x-www-form-urlencoded" && Array.isArray(params)) return { body: { mode: "urlencoded", urlencoded: pairs(params, said) } };
  if (typeof field(value, "fileName") === "string" && typeof field(value, "text") !== "string") return { body: { mode: "file", file: { src: field(value, "fileName") } } };
  if (typeof field(value, "text") !== "string" || (!type && !field(value, "text"))) return {};
  // A GraphQL body is held as the JSON it is sent as.
  const language = /json|graphql/.test(type) ? "json" : type.includes("xml") ? "xml" : type.includes("html") ? "html" : type.includes("javascript") ? "javascript" : "text";
  return { body: { mode: "raw", raw: said(field(value, "text")), options: { raw: { language } } } };
}

/** The file as Postman collections, which the Postman importer turns into the app's, with the environments and what could not be kept. */
export interface InsomniaExport {
  collections: Loose[];
  environments: EnvironmentDoc[];
  warnings: Warning[];
}

/** What both formats hold of a request or a folder, under the names format 5 gives them. */
interface Entry {
  source: Loose;
  name: string;
  description: unknown;
  scripts: { pre: unknown; post: unknown };
}

/** Builds Postman's items from Insomnia's requests and folders, and keeps what is said about them. */
function builder(warnings: Warning[]) {
  /** A folder's variables, to compare with the environments once they are read. */
  const folderVariables: { item: string; key: string }[] = [];

  // Insomnia's scripts call its own `insomnia` object; the app's engine has Postman's `pm`.
  const scripts = (item: string, { pre, post }: Entry["scripts"]): void => {
    const kinds = [text(pre).trim() && "pre-request", text(post).trim() && "after-response"].filter(Boolean);
    if (kinds.length) warnings.push({ item, message: `Its ${kinds.join(" and ")} ${kinds.length > 1 ? "scripts are" : "script is"} left out: an Insomnia script calls Insomnia's own "insomnia" object, which the app does not have.` });
  };

  const request = ({ source, name, description, scripts: own }: Entry): Loose => {
    const item = `request "${name || "Request"}"`;
    const { said, done } = reader(item, warnings);
    const url = addressParts(said(field(source, "url")));
    const result = {
      name,
      request: {
        method: text(field(source, "method")),
        description,
        // Insomnia holds the query's rows beside the address, and sends both.
        url: { ...url, query: [...(url.query ?? []), ...pairs(field(source, "parameters"), said)], variable: pairs(field(source, "pathParameters"), said) },
        header: pairs(field(source, "headers"), said),
        ...body(field(source, "body"), said),
        ...auth(field(source, "authentication"), said),
      },
    };
    scripts(item, own);
    done();
    return result;
  };

  const folder = ({ source, name, description, scripts: own }: Entry, children: Loose[]): Loose => {
    const item = `folder "${name || "Folder"}"`;
    const { said, done } = reader(item, warnings);
    const variable = rowsOf(field(source, "environment"), said);
    folderVariables.push(...variable.map(({ key }) => ({ item, key })));
    const headers = pairs(field(source, "headers"), said).filter((header) => !header.disabled);
    if (headers.length) warnings.push({ item, message: `Its headers (${headers.map((header) => header.key).join(", ").slice(0, 200)}) are left out: in Insomnia a folder's headers are sent with each request in it, and the app has no headers on a folder. Add them to its requests.` });
    scripts(item, own);
    done();
    return { name, description, item: children, variable, ...auth(field(source, "authentication"), said) };
  };

  /** A folder's variable wins over an environment's in Insomnia, and loses to it here. */
  const compare = (environments: EnvironmentDoc[]): void => {
    for (const { item, key } of folderVariables) {
      const also = environments.find((entry) => entry.vars.some((row) => row.key === key));
      if (also) warnings.push({ item, message: `Its variable ${key} is also in the environment "${also.name}". Insomnia uses the folder's value; the app uses the environment's when that environment is active.` });
    }
  };

  return { request, folder, compare };
}

const tooDeep = (): ImportError => new ImportError(`The file's folders are nested more than ${MAX_DEPTH} deep.`);

/** Format 5: one collection as a tree, with its environments beside it. */
function format5(value: Loose): InsomniaExport {
  const warnings: Warning[] = [];
  const { request, folder, compare } = builder(warnings);
  const tree = field(value, "collection");
  const held = field(value, "environments");
  const type = text(field(value, "type"));
  if (!Array.isArray(tree) && !isObject(held)) throw new ImportError(`This Insomnia file (${type.slice(0, 60)}) holds no requests and no environments, so there is nothing to import.`);
  const name = text(field(value, "name")).trim() || UNNAMED;
  const item = Array.isArray(tree) ? `collection "${name}"` : `environment "${name}"`;
  const { said, done } = reader(item, warnings);
  const described = (entry: Loose): unknown => (isObject(field(entry, "meta")) ? field(field(entry, "meta") as Loose, "description") : undefined);

  const level = (items: unknown, depth: number): Loose[] => {
    if (depth > MAX_DEPTH) throw tooDeep();
    return objects(items).flatMap((source) => {
      const own = isObject(field(source, "scripts")) ? (field(source, "scripts") as Loose) : {};
      const entry: Entry = { source, name: text(field(source, "name")).trim(), description: described(source), scripts: { pre: field(own, "preRequest"), post: field(own, "afterResponse") } };
      if (Array.isArray(field(source, "children"))) return [folder(entry, level(field(source, "children"), depth + 1))];
      if (typeof field(source, "method") === "string") return [request(entry)];
      warnings.push({ item: `request "${entry.name || "Request"}"`, message: "It is not an HTTP request (gRPC, WebSocket or Socket.IO) and is left out." });
      return [];
    });
  };

  const base = isObject(held) ? rowsOf(field(held, "data"), said) : [];
  const subs = objects(isObject(held) ? field(held, "subEnvironments") : []).map((sub) => ({ name: text(field(sub, "name")).trim() || "Environment", vars: rowsOf(field(sub, "data"), said) }));
  const spec = field(value, "spec");
  const contents = isObject(spec) ? field(spec, "contents") : undefined;
  const left = [
    objects(isObject(field(value, "cookieJar")) ? field(field(value, "cookieJar") as Loose, "cookies") : []).length > 0 && "cookies",
    objects(field(value, "certificates")).length > 0 && "certificates",
    objects(field(value, "testSuites")).length > 0 && "unit tests",
    isObject(spec) && (typeof field(spec, "file") === "string" || (isObject(contents) && Object.keys(contents).length > 0)) && "API specification",
  ].filter((kind): kind is string => typeof kind === "string");
  if (left.length) warnings.push({ item, message: `Its ${left.length > 1 ? `${left.slice(0, -1).join(", ")} and ${left.at(-1)} are` : `${left[0]} ${left[0].endsWith("s") ? "are" : "is"}`} left out: the app imports requests, folders and environments.` });

  let result: InsomniaExport;
  if (Array.isArray(tree)) {
    // The base environment's values are the collection's variables: both are what every request has, and an environment's value wins over them.
    result = { collections: [{ info: { name, description: described(value) }, variable: base, item: level(tree, 1) }], environments: subs.map((sub) => environment(sub.name, sub.vars)), warnings };
  } else {
    // A file of environments alone has no collection to hold the base's values: each environment gets them, under its own.
    const merged = (own: Row[]): Row[] => [...own, ...base.filter((row) => !own.some((other) => other.key === row.key))];
    result = { collections: [], environments: [environment(name, base), ...subs.map((sub) => environment(sub.name, merged(sub.vars)))], warnings };
  }
  done();
  compare(result.environments);
  return result;
}

/** Format 4: a flat list of resources, each naming its parent. A workspace is a collection. */
function format4(value: Loose): InsomniaExport {
  const version = field(value, "__export_format");
  if (version !== 4) {
    throw new ImportError(`This is an Insomnia export of ${version === undefined ? "a format with no number" : `format ${text(version).slice(0, 20)}`}, which Wayfarer does not read. Export from a current Insomnia (format 4 or 5) and import that.`);
  }
  const warnings: Warning[] = [];
  const { request, folder, compare } = builder(warnings);
  const resources = objects(field(value, "resources"));
  const kind = (resource: Loose): string => text(field(resource, "_type"));
  const id = (resource: Loose): string => text(field(resource, "_id"));
  const sortKey = (resource: Loose): number => (typeof field(resource, "metaSortKey") === "number" ? (field(resource, "metaSortKey") as number) : 0);
  const children = new Map<string, Loose[]>();
  for (const resource of resources) {
    const parent = text(field(resource, "parentId"));
    children.set(parent, [...(children.get(parent) ?? []), resource]);
  }
  for (const list of children.values()) list.sort((a, b) => sortKey(a) - sortKey(b));
  const under = (parent: string, type: string): Loose[] => (parent === "" ? [] : (children.get(parent) ?? []).filter((resource) => kind(resource) === type));

  // A resource is placed once: a file whose resources name each other as parents in a ring, or share an id, cannot make the tree grow without end.
  const placed = new Set<Loose>();
  const level = (parent: string, depth: number): Loose[] => {
    if (depth > MAX_DEPTH) throw tooDeep();
    return (parent === "" ? [] : (children.get(parent) ?? [])).flatMap((source) => {
      if (placed.has(source) || (kind(source) !== "request" && kind(source) !== "request_group")) return [];
      placed.add(source);
      const entry: Entry = { source, name: text(field(source, "name")).trim(), description: field(source, "description"), scripts: { pre: field(source, "preRequestScript"), post: field(source, "afterResponseScript") } };
      return [kind(source) === "request_group" ? folder(entry, level(id(source), depth + 1)) : request(entry)];
    });
  };

  const workspaces = resources.filter((resource) => kind(resource) === "workspace");
  const collections = workspaces.map((workspace) => {
    const name = text(field(workspace, "name")).trim() || UNNAMED;
    const { said, done } = reader(`collection "${name}"`, warnings);
    // The base environment's values are the collection's variables: both are what every request has, and an environment's value wins over them.
    const collection = { info: { name, description: field(workspace, "description") }, variable: under(id(workspace), "environment").flatMap((base) => rowsOf(field(base, "data"), said)), item: level(id(workspace), 1) };
    done();
    return collection;
  });
  // An environment under a base environment is an environment of the app. So is a base whose workspace the file does not hold.
  const held = resources.filter((resource) => kind(resource) === "environment");
  const bases = new Set(workspaces.flatMap((workspace) => under(id(workspace), "environment")));
  const environments = held
    .filter((resource) => !bases.has(resource))
    .map((resource) => {
      const name = text(field(resource, "name")).trim() || "Environment";
      const { said, done } = reader(`environment "${name}"`, warnings);
      const made = environment(name, rowsOf(field(resource, "data"), said));
      done();
      return made;
    });

  // Requests and folders whose parent the file does not hold: Insomnia exports a selection that way.
  const known = new Set(resources.filter((resource) => kind(resource) === "workspace" || kind(resource) === "request_group").map(id));
  const loose = [...children.keys()].filter((parent) => parent !== "" && !known.has(parent)).flatMap((parent) => level(parent, 1));
  if (loose.length) collections.push({ info: { name: UNNAMED, description: undefined }, variable: [], item: loose });

  const unplaced = resources.filter((resource) => (kind(resource) === "request" || kind(resource) === "request_group") && !placed.has(resource)).length;
  if (unplaced) warnings.push({ item: "file", message: `${unplaced} ${unplaced === 1 ? "request or folder is" : "requests and folders are"} left out: the file does not say which collection ${unplaced === 1 ? "it is" : "they are"} in.` });
  for (const resource of resources) {
    if (kind(resource).endsWith("_request")) warnings.push({ item: `request "${text(field(resource, "name")).trim() || "Request"}"`, message: "It is not an HTTP request (gRPC, WebSocket or Socket.IO) and is left out." });
  }
  const others = [...new Set(resources.filter((resource) => !["workspace", "request", "request_group", "environment"].includes(kind(resource)) && !kind(resource).endsWith("_request") && !(kind(resource) === "cookie_jar" && objects(field(resource, "cookies")).length === 0) && !(kind(resource) === "api_spec" && !text(field(resource, "contents")).trim())).map((resource) => kind(resource).slice(0, 30)))];
  if (others.length) warnings.push({ item: "file", message: `What the file holds that is not a request, a folder or an environment is left out (${others.slice(0, 8).join(", ")}).` });

  compare(environments);
  return { collections, environments, warnings };
}

/**
 * An Insomnia export as Postman collections and the app's environments,
 * with what could not be kept. Insomnia's requests, folders, auth and
 * bodies are what Postman's are under other names, so the Postman importer
 * makes the app's model from them: one road, checked once.
 */
export function insomniaExport(value: unknown): InsomniaExport {
  if (!isObject(value)) throw new ImportError("The file is not an Insomnia export.");
  return typeof field(value, "type") === "string" ? format5(value) : format4(value);
}
