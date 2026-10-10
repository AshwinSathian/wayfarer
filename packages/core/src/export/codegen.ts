import { shellQuote } from "./curl";
import type { ExportRequest } from "./request";

/** The languages and tools a request can be written out for, each with its name in the menu. */
export const CODE_TARGETS = {
  fetch: "JavaScript (fetch)",
  "python-requests": "Python (requests)",
  httpie: "HTTPie",
} as const;
export type CodeTarget = keyof typeof CODE_TARGETS;

/**
 * A string literal of JavaScript, and of Python: both read JSON's escapes.
 * The user's text goes into code only through this, so it cannot end the
 * string it is in.
 */
const literal = (text: string) => JSON.stringify(text);
const pairs = (rows: [string, string][], open: string, close: string) => rows.map(([name, value]) => `${open}${literal(name)}, ${literal(value)}${close}`);
const sentHeaders = (request: ExportRequest) => request.headers.filter(([name]) => name);

function fetchCode(request: ExportRequest): string {
  const { body } = request;
  const before: string[] = [];
  let sent = "";
  if (body.mode === "raw" && body.text) {
    sent = literal(body.text);
  } else if (body.mode === "urlencoded") {
    sent = `new URLSearchParams([${pairs(body.fields, "[", "]").join(", ")}])`;
  } else if (body.mode === "multipart") {
    before.push("const form = new FormData();");
    for (const part of body.parts) {
      before.push("value" in part ? `form.append(${literal(part.name)}, ${literal(part.value)});` : `form.append(${literal(part.name)}, await openAsBlob(${literal(part.fileName)}), ${literal(part.fileName)});`);
    }
    sent = "form";
  } else if (body.mode === "binary" && body.fileName) {
    sent = `await openAsBlob(${literal(body.fileName)})`;
  }
  const readsFile = (body.mode === "multipart" && body.parts.some((part) => "fileName" in part)) || (body.mode === "binary" && !!body.fileName);
  const headers = sentHeaders(request);
  return [
    // A file is read with Node's own reader (19.8 or later). In a browser, give the File of an <input type="file"> in its place.
    ...(readsFile ? ['import { openAsBlob } from "node:fs";', ""] : []),
    ...before,
    `const response = await fetch(${literal(request.url)}, {`,
    `  method: ${literal(request.method)},`,
    // As a list: a header named "__proto__" is a header, and the order is the request's.
    ...(headers.length ? ["  headers: [", ...pairs(headers, "    [", "],"), "  ],"] : []),
    ...(sent ? [`  body: ${sent},`] : []),
    "});",
    "console.log(response.status, await response.text());",
  ].join("\n");
}

function pythonCode(request: ExportRequest): string {
  const { body } = request;
  const args = [literal(request.method), literal(request.url)];
  const headers = sentHeaders(request);
  if (headers.length) args.push(`headers={${headers.map(([name, value]) => `${literal(name)}: ${literal(value)}`).join(", ")}}`);
  if (body.mode === "raw" && body.text) {
    args.push(`data=${literal(body.text)}.encode("utf-8")`);
  } else if (body.mode === "urlencoded") {
    args.push(`data=[${pairs(body.fields, "(", ")").join(", ")}]`);
  } else if (body.mode === "multipart") {
    // A text part as (None, value): requests then writes a form part with no file name.
    const parts = body.parts.map((part) => ("value" in part ? `(${literal(part.name)}, (None, ${literal(part.value)}))` : `(${literal(part.name)}, (${literal(part.fileName)}, open(${literal(part.fileName)}, "rb")))`));
    args.push(`files=[${parts.join(", ")}]`);
  } else if (body.mode === "binary" && body.fileName) {
    args.push(`data=open(${literal(body.fileName)}, "rb")`);
  }
  return ["import requests", "", "response = requests.request(", ...args.map((arg) => `    ${arg},`), ")", "print(response.status_code)", "print(response.text)"].join("\n");
}

/** Why HTTPie cannot be given this request, as the text that is copied in the command's place. */
const notHttpie = (why: string) => `# HTTPie cannot say this request: ${why}. Copy it as cURL instead.`;

/**
 * HTTPie reads each request item by its separator: `Name:value` is a
 * header, `name=value` a field, and `name=@path`, `Name:@path` and
 * `name==value` are something else again. A value that starts with "@" or
 * "=" would be read as a file or as another kind of item, and HTTPie has no
 * way to say "this is text". Such a request is not written: a command that
 * reads a file the user did not name is worse than no command.
 */
function httpieCode(request: ExportRequest): string {
  const { body } = request;
  const unsafe = (value: string) => /^[@=]/.test(value);
  // In a name, a separator's characters are escaped with a backslash.
  const name = (text: string) => text.replace(/[\\:=@;]/g, "\\$&");
  // HTTPie reads its method, its address and its items by position: one that starts with "-" would be an option.
  if (!/^[A-Za-z][A-Za-z0-9!#$%&'*+.^_`|~-]*$/.test(request.method)) return notHttpie("the method does not start with a letter, and HTTPie could read it as an option");
  if (request.url.startsWith("-")) return notHttpie('the address starts with "-", which HTTPie reads as an option');
  const dashed = [...sentHeaders(request).map(([key]) => key), ...(body.mode === "multipart" ? body.parts.map((part) => part.name) : [])].find((key) => key.startsWith("-"));
  if (dashed !== undefined) return notHttpie(`the name ${dashed} starts with "-", which HTTPie reads as an option`);
  const flags = ["--ignore-stdin"];
  const items: string[] = [];
  for (const [key, value] of sentHeaders(request)) {
    if (unsafe(value)) return notHttpie(`the value of the header ${key} starts with "@" or "=", which HTTPie reads as a file or as another kind of item`);
    // "Name:" would remove the header; "Name;" sends it empty.
    items.push(shellQuote(value ? `${name(key)}:${value}` : `${name(key)};`));
  }
  if (body.mode === "raw" && body.text) {
    flags.push(`--raw ${shellQuote(body.text)}`);
  } else if (body.mode === "urlencoded") {
    // The encoded form as text: "name=value" items would read a value that starts with "@" as a file.
    if (body.fields.length) flags.push(`--raw ${shellQuote(new URLSearchParams(body.fields).toString())}`);
  } else if (body.mode === "multipart") {
    flags.push("--multipart");
    for (const part of body.parts) {
      if ("value" in part && unsafe(part.value)) return notHttpie(`the value of the form part ${part.name} starts with "@" or "=", which HTTPie reads as a file or as another kind of item`);
      items.push(shellQuote("value" in part ? `${name(part.name)}=${part.value}` : `${name(part.name)}@${part.fileName}`));
    }
  } else if (body.mode === "binary" && body.fileName) {
    items.push(shellQuote(`@${body.fileName}`));
  }
  return ["http", ...flags, shellQuote(request.method), shellQuote(request.url), ...items].join(" \\\n  ");
}

/**
 * The request as code for `target`. Text only: nothing is run here, and
 * the user's values are written as string literals or as quoted words.
 * A file of the body is named, not embedded.
 */
export function generateCode(target: CodeTarget, request: ExportRequest): string {
  switch (target) {
    case "fetch":
      return fetchCode(request);
    case "python-requests":
      return pythonCode(request);
    case "httpie":
      return httpieCode(request);
  }
}
