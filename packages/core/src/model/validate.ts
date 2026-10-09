import { ASSERTION_OPERATORS, ASSERTION_TARGETS, HTTP_METHODS, RAW_LANGUAGES } from "./request";

export interface ValidationIssue {
  path: string;
  message: string;
}

type Fields = Record<string, unknown>;

function isObject(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An own field: a file's "constructor" key must not read `Object.prototype.constructor`. */
function field(object: Fields, key: string): unknown {
  return Object.hasOwn(object, key) ? object[key] : undefined;
}

class Checker {
  readonly issues: ValidationIssue[] = [];

  fail(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  object(value: unknown, path: string): Fields | null {
    if (isObject(value)) return value;
    this.fail(path, "Value must be an object.");
    return null;
  }

  string(object: Fields, key: string, path: string, optional = false): void {
    const value = field(object, key);
    if (typeof value === "string" || (optional && value === undefined)) return;
    this.fail(`${path}.${key}`, "Value must be a string.");
  }

  oneOf(object: Fields, key: string, path: string, allowed: readonly string[], optional = false): void {
    const value = field(object, key);
    if ((optional && value === undefined) || (typeof value === "string" && allowed.includes(value))) return;
    this.fail(`${path}.${key}`, `Value must be one of ${allowed.join(", ")}.`);
  }

  list(value: unknown, path: string, each: (item: Fields, itemPath: string) => void): void {
    if (!Array.isArray(value)) {
      this.fail(path, "Value must be an array.");
      return;
    }
    value.forEach((item: unknown, index) => {
      const itemPath = `${path}[${index}]`;
      const object = this.object(item, itemPath);
      if (object) each(object, itemPath);
    });
  }

  rows(value: unknown, path: string): void {
    this.list(value, path, (row, rowPath) => {
      this.string(row, "key", rowPath);
      this.string(row, "value", rowPath);
      if (typeof field(row, "enabled") !== "boolean") {
        this.fail(`${rowPath}.enabled`, "Value must be true or false.");
      }
    });
  }
}

/** Checks that `value` is a list of `{key, value, enabled}` rows with string keys and values. */
export function validateRows(value: unknown, path: string): ValidationIssue[] {
  const check = new Checker();
  check.rows(value, path);
  return check.issues;
}

/**
 * Checks the request fields of an imported document against what the app
 * itself writes. A file is untrusted: every field is checked, not only the
 * ones the caller is about to read.
 */
export function validateRequestContent(value: unknown, path: string): ValidationIssue[] {
  const check = new Checker();
  const request = check.object(value, path);
  if (!request) return check.issues;

  check.oneOf(request, "method", path, HTTP_METHODS);
  if (typeof field(request, "url") !== "string" || !(field(request, "url") as string).trim()) {
    check.fail(`${path}.url`, "Value must be a non-empty string.");
  }
  check.rows(field(request, "params"), `${path}.params`);
  check.rows(field(request, "headers"), `${path}.headers`);

  const body = check.object(field(request, "body"), `${path}.body`);
  if (body) {
    check.oneOf(body, "mode", `${path}.body`, ["none", "raw"]);
    if (field(body, "mode") === "raw") {
      const raw = check.object(field(body, "raw"), `${path}.body.raw`);
      if (raw) {
        check.oneOf(raw, "language", `${path}.body.raw`, RAW_LANGUAGES);
        check.string(raw, "text", `${path}.body.raw`);
      }
    }
  }

  const auth = check.object(field(request, "auth"), `${path}.auth`);
  if (auth) {
    check.oneOf(auth, "type", `${path}.auth`, ["none", "bearer", "basic", "apikey"]);
    const type = field(auth, "type");
    if (type === "bearer") {
      check.string(auth, "token", `${path}.auth`);
    } else if (type === "basic") {
      check.string(auth, "username", `${path}.auth`);
      check.string(auth, "password", `${path}.auth`);
    } else if (type === "apikey") {
      check.string(auth, "key", `${path}.auth`);
      check.string(auth, "value", `${path}.auth`);
      check.oneOf(auth, "in", `${path}.auth`, ["header", "query"]);
    }
  }

  const scripts = check.object(field(request, "scripts"), `${path}.scripts`);
  if (scripts) {
    check.string(scripts, "pre", `${path}.scripts`);
    check.string(scripts, "post", `${path}.scripts`);
  }

  check.list(field(request, "tests"), `${path}.tests`, (test, testPath) => {
    check.string(test, "id", testPath);
    check.oneOf(test, "target", testPath, ASSERTION_TARGETS);
    check.oneOf(test, "operator", testPath, ASSERTION_OPERATORS);
    check.string(test, "key", testPath, true);
    check.string(test, "expected", testPath, true);
  });

  const settings = check.object(field(request, "settings"), `${path}.settings`);
  if (settings) {
    const timeout = field(settings, "timeoutMs");
    if (timeout !== undefined && !(typeof timeout === "number" && Number.isFinite(timeout) && timeout >= 0)) {
      check.fail(`${path}.settings.timeoutMs`, "Value must be a number, 0 or more.");
    }
    const follow = field(settings, "followRedirects");
    if (follow !== undefined && typeof follow !== "boolean") {
      check.fail(`${path}.settings.followRedirects`, "Value must be true or false.");
    }
    check.oneOf(settings, "route", `${path}.settings`, ["auto", "direct", "bridge"], true);
  }

  return check.issues;
}
