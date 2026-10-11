import { RAW_CONTENT_TYPES, type RawLanguage } from "../model/request";
import { ImportError } from "./import-error";
import { MAX_DEPTH, field, isObject, text, type Loose, type Warning } from "./postman";

/** The name of a collection whose file gives no title. */
const UNNAMED = "Imported from OpenAPI";

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

/**
 * The most values one sample holds. A schema with no ring in it can still
 * double at every level (`a: [b, b]`, `b: [c, c]`): written out, thirty
 * levels are a billion values.
 * ponytail: a count per sample, not per file. A file of 10 MB with many
 * operations that each use a large schema is still read in full.
 */
const SAMPLE_VALUES = 1000;

/** What a text is sampled as when its schema names a format a server checks. */
const FORMATS: Record<string, string> = {
  date: "2026-01-01",
  "date-time": "2026-01-01T00:00:00Z",
  uuid: "00000000-0000-4000-8000-000000000000",
  email: "user@example.com",
  uri: "https://example.com",
};

/** An OpenAPI description (`openapi: 3.x`) or a Swagger one (`swagger: "2.0"`). YAML reads an unquoted `2.0` as a number. */
export function isOpenApi(value: unknown): boolean {
  if (!isObject(value)) return false;
  const version = field(value, "openapi") ?? field(value, "swagger");
  return typeof version === "string" || typeof version === "number";
}

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
/** A value of the file as a row's text: a list as its items with commas, as a parameter is sent by default in Swagger 2.0. */
const said = (value: unknown): string => (Array.isArray(value) ? value.map(text).join(",") : text(value));
const withoutEndSlash = (url: string): string => {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end--;
  return url.slice(0, end);
};
/** A part of a pointer as the text it stands for. One that is not percent-encoded text is read as written. */
const decoded = (part: string): string => {
  try {
    return decodeURIComponent(part);
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    return part;
  }
};
const named = (names: string[]): string => `${names.slice(0, 3).join(", ")}${names.length > 3 ? `, and ${names.length - 3} more` : ""}`;

/**
 * An OpenAPI 3.0 or 3.1 description, or a Swagger 2.0 one, as a Postman
 * collection, which the Postman importer turns into the app's: one road,
 * checked once. A request per operation, in a folder per tag, addressed
 * through the collection's variable `baseUrl`.
 *
 * A reference (`$ref`) is followed only when it points inside the file. One
 * to another file or to an address is never read: there is no code here
 * that could fetch it, and the report names it (C-001).
 */
export function openApiCollection(root: unknown): { collection: Loose; warnings: Warning[] } {
  if (!isObject(root)) throw new ImportError("The file is not an OpenAPI description.");
  const swagger = field(root, "swagger") !== undefined;
  const version = text(field(root, swagger ? "swagger" : "openapi")).slice(0, 20);
  if (swagger ? !/^2(\.0)?$/.test(version) : !/^3(\.|$)/.test(version)) {
    throw new ImportError(`This is ${swagger ? "a Swagger" : "an OpenAPI"} description of version ${version || "none"}, which Wayfarer does not read. It reads OpenAPI 3.0 and 3.1 and Swagger 2.0.`);
  }
  const warnings: Warning[] = [];
  const info = field(root, "info");
  const name = text(isObject(info) ? field(info, "title") : "").trim() || UNNAMED;
  const top = `collection "${name}"`;
  if (!swagger && !/^3(\.[01](\.|$)|$)/.test(version)) warnings.push({ item: top, message: `The file is written for OpenAPI ${version}: it is read as OpenAPI 3.1, and what is newer is left out.` });

  /** What is being read, for a warning to name; and the references met there that lead nowhere the app goes. */
  let item = top;
  const unread = new Map<string, { outside: Set<string>; missing: Set<string> }>();
  const note = (kind: "outside" | "missing", ref: string): undefined => {
    const noted = unread.get(item) ?? { outside: new Set(), missing: new Set() };
    unread.set(item, noted);
    noted[kind].add(ref.slice(0, 200));
    return undefined;
  };

  /** The value a JSON pointer names in the file, by own fields only. */
  const at = (pointer: string): unknown => {
    let value: unknown = root;
    for (const part of pointer.split("/").slice(1)) {
      const key = decoded(part).replace(/~1/g, "/").replace(/~0/g, "~");
      if (Array.isArray(value)) value = /^\d+$/.test(key) ? value[Number(key)] : undefined;
      else if (isObject(value)) value = field(value, key);
      else return undefined;
    }
    return value;
  };

  /** A value of the file, with a reference followed to what it names. A ring of references ends: each is followed once. */
  const resolve = (value: unknown): unknown => {
    const followed = new Set<string>();
    while (isObject(value) && typeof field(value, "$ref") === "string") {
      const ref = field(value, "$ref") as string;
      if (ref !== "#" && !ref.startsWith("#/")) return note(ref.startsWith("#") ? "missing" : "outside", ref);
      if (followed.has(ref)) return note("missing", ref);
      followed.add(ref);
      value = at(ref.slice(1));
      if (value === undefined) return note("missing", ref);
    }
    return value;
  };
  const resolved = (value: unknown): Loose[] => list(value).map(resolve).filter(isObject);

  /** An example the file gives for a parameter or a body: `example`, or the first of `examples` that has a value. */
  const example = (holder: Loose): unknown => {
    if (field(holder, "example") !== undefined) return field(holder, "example");
    const examples = field(holder, "examples");
    if (isObject(examples)) {
      for (const key of Object.keys(examples)) {
        const one = resolve(field(examples, key));
        if (isObject(one) && field(one, "value") !== undefined) return field(one, "value");
      }
    }
    return field(holder, "x-example");
  };

  /**
   * A value that fits a schema: what the schema itself gives (an example, a
   * default, the first of an enum), and under that one made from its type.
   * `fill` says whether a bare type gives a value (`"string"`, `0`) or none:
   * a body is filled in, a parameter is left empty. A schema inside itself
   * ends there, and so does a sample of `SAMPLE_VALUES` values.
   */
  const sample = (from: unknown, fill: boolean): unknown => {
    let left = SAMPLE_VALUES;
    const open = new Set<Loose>();
    const of = (raw: unknown, depth: number): unknown => {
      const schema = resolve(raw);
      if (!isObject(schema) || left-- <= 0 || depth > MAX_DEPTH || open.has(schema)) return null;
      for (const key of ["example", "default", "const"]) if (field(schema, key) !== undefined) return field(schema, key);
      for (const key of ["examples", "enum"]) if (list(field(schema, key)).length) return list(field(schema, key))[0];
      open.add(schema);
      try {
        const properties = field(schema, "properties");
        const parts = list(field(schema, "allOf")).map((part) => of(part, depth + 1));
        if (isObject(properties)) {
          // What only a response holds (`readOnly`) is not sent.
          const sent = Object.keys(properties).filter((key) => {
            const property = resolve(field(properties, key));
            return !isObject(property) || field(property, "readOnly") !== true;
          });
          parts.push(Object.fromEntries(sent.map((key) => [key, of(field(properties, key), depth + 1)])));
        }
        if (parts.length) return parts.some(isObject) ? Object.fromEntries(parts.filter(isObject).flatMap((part) => Object.entries(part))) : parts[0];
        const choice = [...list(field(schema, "oneOf")), ...list(field(schema, "anyOf"))][0];
        if (choice !== undefined) return of(choice, depth + 1);
        const types = field(schema, "type");
        const type = Array.isArray(types) ? types.find((entry) => entry !== "null") : types;
        if (type === "array" || field(schema, "items") !== undefined) {
          const one = of(field(schema, "items"), depth + 1);
          return one === null ? [] : [one];
        }
        if (type === "object") return {};
        if (!fill) return null;
        if (type === "string") {
          const format = text(field(schema, "format"));
          return Object.hasOwn(FORMATS, format) ? FORMATS[format] : "string";
        }
        return type === "integer" || type === "number" ? 0 : type === "boolean" ? true : null;
      } finally {
        open.delete(schema);
      }
    };
    return of(from, 0);
  };

  /** A part of a form that is a file: `format: binary` in OpenAPI, `type: file` in Swagger. */
  const isFile = (raw: unknown): boolean => {
    const schema = resolve(raw);
    return isObject(schema) && (field(schema, "type") === "file" || field(schema, "format") === "binary");
  };

  /** A form's fields as Postman writes them. A file is named by nothing: the file holds its type, not a file. */
  const form = (type: string, fields: { key: string; schema: unknown; value: unknown }[]): Loose =>
    type.startsWith("multipart/")
      ? { mode: "formdata", formdata: fields.map(({ key, schema, value }) => (isFile(schema) ? { key, type: "file", src: "" } : { key, type: "text", value: said(value) })) }
      : { mode: "urlencoded", urlencoded: fields.map(({ key, value }) => ({ key, value: said(value) })) };

  /** A body of one media type, with the header it needs when the app would send another type for it. */
  const bodyOf = (type: string, media: Loose): { body: Loose; header: Loose[] } => {
    const kind = type.toLowerCase();
    const schema = resolve(field(media, "schema"));
    const value = example(media) ?? sample(schema, true);
    if (kind.startsWith("multipart/") || kind === "application/x-www-form-urlencoded") {
      const properties = isObject(schema) ? field(schema, "properties") : undefined;
      return { body: form(kind, Object.keys(isObject(value) ? value : {}).map((key) => ({ key, schema: isObject(properties) ? field(properties, key) : undefined, value: (value as Loose)[key] }))), header: [] };
    }
    if (kind === "application/octet-stream" || isFile(schema)) return { body: { mode: "file", file: { src: "" } }, header: [] };
    const language: RawLanguage = /json|\*/.test(kind) ? "json" : kind.includes("xml") ? "xml" : kind.includes("html") ? "html" : kind.includes("javascript") ? "javascript" : "text";
    // Only JSON is written from a schema: an example that is text is kept for any type.
    const raw = typeof value === "string" ? value : language === "json" && value !== null ? JSON.stringify(value, null, 2) : "";
    if (!raw) warnings.push({ item, message: `Its body (${type.slice(0, 80)}) has no example in the file that the app can write out: the body is empty.` });
    return { body: { mode: "raw", raw, options: { raw: { language } } }, header: kind.includes("*") || RAW_CONTENT_TYPES[language] === kind ? [] : [{ key: "Content-Type", value: type }] };
  };

  const components = field(root, "components");
  const schemes = swagger ? field(root, "securityDefinitions") : isObject(components) ? field(components, "securitySchemes") : undefined;
  /**
   * `security` as Postman's `auth`: the first way in that the file lists.
   * None said takes the level above, an empty one is no auth. A value is a
   * variable to fill in: the file names a scheme, not a credential.
   */
  const auth = (requirements: unknown): { auth?: Loose } => {
    if (!Array.isArray(requirements)) return {};
    const names = Object.keys(requirements.find(isObject) ?? {});
    if (!names.length) return { auth: { type: "noauth" } };
    if (names.length > 1) warnings.push({ item, message: `It needs ${names.length} security schemes together (${named(names)}): only the first is set.` });
    const scheme = resolve(isObject(schemes) ? field(schemes, names[0]) : undefined);
    if (!isObject(scheme)) return { auth: { type: `${names[0].slice(0, 60)}, which the file does not describe` } };
    const type = text(field(scheme, "type"));
    const how = text(field(scheme, "scheme")).toLowerCase();
    if (type === "basic" || (type === "http" && how === "basic")) return { auth: { type: "basic", basic: { username: "{{authUsername}}", password: "{{authPassword}}" } } };
    if (type === "http" && how === "bearer") return { auth: { type: "bearer", bearer: { token: "{{bearerToken}}" } } };
    if (type === "apiKey") {
      const place = text(field(scheme, "in"));
      if (place !== "header" && place !== "query") return { auth: { type: `an API key in a ${place.slice(0, 20) || "place the file does not say"}` } };
      return { auth: { type: "apikey", apikey: { key: text(field(scheme, "name")), value: "{{apiKey}}", in: place } } };
    }
    if (type === "oauth2") {
      // OpenAPI 3 lists flows, Swagger 2.0 names one on the scheme itself. The first the app has; a client and its user are variables to fill in.
      const flows = field(scheme, "flows");
      const flow = (name: string, old: string): unknown => (swagger ? (field(scheme, "flow") === old ? scheme : undefined) : isObject(flows) ? resolve(field(flows, name)) : undefined);
      const code = flow("authorizationCode", "accessCode");
      const client = flow("clientCredentials", "application");
      const password = flow("password", "password");
      const chosen = code ?? client ?? password;
      // Only a flow the app does not have (implicit), or none: the Postman importer says it is left out, by this name.
      if (!isObject(chosen)) return { auth: { type, oauth2: { grant_type: (swagger ? text(field(scheme, "flow")) : Object.keys(isObject(flows) ? flows : {})[0]) || "none said" } } };
      const asked = field(requirements.find(isObject) ?? {}, names[0]);
      const scopes = field(chosen, "scopes");
      const scope = (Array.isArray(asked) && asked.length ? asked.map(text) : isObject(scopes) ? Object.keys(scopes) : []).join(" ");
      return {
        auth: {
          type,
          oauth2: {
            grant_type: chosen === code ? "authorization_code_with_pkce" : chosen === client ? "client_credentials" : "password_credentials",
            authUrl: text(field(chosen, "authorizationUrl")),
            accessTokenUrl: text(field(chosen, "tokenUrl")),
            clientId: "{{clientId}}",
            clientSecret: chosen === client ? "{{clientSecret}}" : "",
            scope,
            username: chosen === password ? "{{authUsername}}" : "",
            password: chosen === password ? "{{authPassword}}" : "",
          },
        },
      };
    }
    return { auth: { type: (type === "http" ? `http ${how}` : type).slice(0, 60) } };
  };

  /** The first server of a list, its `{variables}` given their defaults. One with no default is a variable of the app. */
  const server = (servers: unknown): string | undefined => {
    const first = list(servers).find(isObject);
    if (!first) return undefined;
    const variables = field(first, "variables");
    const filled = text(field(first, "url")).replace(/\{([^{}]+)\}/g, (_whole, key: string) => {
      const variable = isObject(variables) ? field(variables, key) : undefined;
      return isObject(variable) && field(variable, "default") !== undefined ? text(field(variable, "default")) : `{{${key}}}`;
    });
    return withoutEndSlash(filled);
  };
  const host = text(field(root, "host"));
  const base = swagger ? withoutEndSlash(`${host && `${text(list(field(root, "schemes"))[0] ?? "https")}://${host}`}${text(field(root, "basePath"))}`) : (server(field(root, "servers")) ?? "");
  if (!/^([a-z][a-z0-9+.-]*:\/\/|\{\{)/i.test(base)) {
    warnings.push({ item: top, message: `The file gives no full address for its server (${base.slice(0, 80) || "it names none"}): give the collection's variable baseUrl the server's address before you send.` });
  }
  const others = list(field(root, "servers")).length - 1;
  if (!swagger && others > 0) warnings.push({ item: top, message: `The file names ${others + 1} servers: the collection's variable baseUrl holds the first (${base.slice(0, 80)}).` });

  // A folder per tag: those the file lists, in its order, then the others as they are met.
  const folders = new Map<string, { description: unknown; item: Loose[] }>();
  for (const tag of list(field(root, "tags")).filter(isObject)) folders.set(text(field(tag, "name")), { description: field(tag, "description"), item: [] });
  const loose: Loose[] = [];

  const paths = field(root, "paths");
  for (const path of isObject(paths) ? Object.keys(paths) : []) {
    item = `path ${path.slice(0, 80)}`;
    const pathItem = resolve(field(paths as Loose, path));
    if (!isObject(pathItem)) continue;
    for (const method of METHODS) {
      const operation = field(pathItem, method);
      if (!isObject(operation)) continue;
      const requestName = text(field(operation, "summary")).trim() || text(field(operation, "operationId")).trim() || `${method.toUpperCase()} ${path}`;
      item = `request "${requestName}"`;

      // The path's parameters, and over them the operation's of the same name and place.
      const parameters = new Map<string, Loose>();
      for (const parameter of [...resolved(field(pathItem, "parameters")), ...resolved(field(operation, "parameters"))]) parameters.set(`${text(field(parameter, "in"))}:${text(field(parameter, "name"))}`, parameter);
      const query: Loose[] = [];
      const header: Loose[] = [];
      const cookies: string[] = [];
      const fields: { key: string; schema: unknown; value: unknown }[] = [];
      let inBody: Loose | undefined;
      for (const parameter of parameters.values()) {
        const key = text(field(parameter, "name"));
        const place = field(parameter, "in");
        if (place === "body") inBody = parameter;
        if (place === "body" || place === "path") continue;
        const content = field(parameter, "content");
        const media = isObject(content) ? Object.values(content).find(isObject) : undefined;
        // A Swagger 2.0 parameter is its own schema: `type`, `default`, `enum`.
        const value = example(parameter) ?? sample(field(parameter, "schema") ?? (media ? field(media, "schema") : parameter), false);
        if (place === "formData") fields.push({ key, schema: parameter, value });
        else if (place === "query") query.push({ key, value: said(value) });
        else if (place === "cookie") cookies.push(`${key}=${said(value)}`);
        // The three that OpenAPI says a parameter does not set: the body's type and the auth do.
        else if (place === "header" && !/^(accept|content-type|authorization)$/i.test(key)) header.push({ key, value: said(value), ...(field(parameter, "required") !== true && said(value) === "" && { disabled: true }) });
      }
      if (cookies.length) header.push({ key: "Cookie", value: cookies.join("; ") });

      let body: Loose | undefined;
      const consumes = list(field(operation, "consumes") ?? field(root, "consumes")).map(text);
      const requestBody = resolve(field(operation, "requestBody"));
      const content = isObject(requestBody) ? field(requestBody, "content") : undefined;
      if (fields.length) {
        body = form(consumes.some((type) => type.startsWith("multipart/")) || fields.some(({ schema }) => isFile(schema)) ? "multipart/form-data" : "application/x-www-form-urlencoded", fields);
      } else if (inBody || isObject(content)) {
        const types = inBody ? (consumes.length ? consumes : ["application/json"]) : Object.keys(content as Loose).filter((type) => isObject(field(content as Loose, type)));
        const type = types.find((entry) => /json/i.test(entry)) ?? types[0];
        if (type !== undefined) {
          if (!inBody && types.length > 1) warnings.push({ item, message: `Its body is described in ${types.length} media types (${named(types)}): the request has the ${type.slice(0, 80)} one.` });
          const made = bodyOf(type, inBody ?? (field(content as Loose, type) as Loose));
          body = made.body;
          header.push(...made.header);
        }
      }

      const tags = list(field(operation, "tags")).map(text).filter(Boolean);
      if (tags.length > 1) warnings.push({ item, message: `It has ${tags.length} tags (${named(tags)}): it is in the folder of the first.` });
      const own = server(field(operation, "servers")) ?? server(field(pathItem, "servers"));
      const request = {
        name: requestName,
        request: {
          method: method.toUpperCase(),
          description: field(operation, "description"),
          // A `{name}` of the path is the variable `{{name}}`, which the composer asks for before it sends.
          url: { host: [own ?? "{{baseUrl}}"], path: path.replace(/^\//, "").split("/").map((part) => part.replace(/\{([^{}]+)\}/g, "{{$1}}")), query },
          header,
          ...(body && { body }),
          ...auth(field(operation, "security")),
        },
      };
      if (!tags.length) loose.push(request);
      else if (folders.has(tags[0])) folders.get(tags[0])?.item.push(request);
      else folders.set(tags[0], { description: undefined, item: [request] });
    }
  }

  item = top;
  const made = { info: { name, description: isObject(info) ? field(info, "description") : undefined }, variable: [{ key: "baseUrl", value: base }], ...auth(field(root, "security")) };
  const tagged = [...folders].filter(([, folder]) => folder.item.length).map(([folderName, folder]) => ({ name: folderName, description: folder.description, item: folder.item }));
  if (!tagged.length && !loose.length) throw new ImportError("This OpenAPI file describes no operation under `paths`, so there is no request to import.");

  for (const [where, { outside, missing }] of unread) {
    if (outside.size) warnings.push({ item: where, message: `It refers to ${outside.size === 1 ? "another file or an address" : `${outside.size} other files or addresses`} (${named([...outside])}). An import fetches nothing: what ${outside.size === 1 ? "it describes" : "they describe"} is left out.` });
    if (missing.size) warnings.push({ item: where, message: `It refers to ${missing.size === 1 ? "a part" : `${missing.size} parts`} of the file that ${missing.size === 1 ? "is" : "are"} not there or ${missing.size === 1 ? "leads" : "lead"} back to ${missing.size === 1 ? "itself" : "themselves"} (${named([...missing])}), and ${missing.size === 1 ? "that is" : "those are"} left out.` });
  }
  // Folders first: the app lists a folder's folders before its requests.
  return { collection: { ...made, item: [...tagged, ...loose] }, warnings };
}
