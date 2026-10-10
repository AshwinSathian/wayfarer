import type { ExportBody, ExportPart, ExportRequest } from "../export/request";
import { RAW_CONTENT_TYPES, emptyRequest, isHttpMethod, type RawLanguage, type RequestContent, type Row } from "../model/request";
import { isCurlCommand } from "./curl-command";
import { ImportError } from "./import-error";

/** A cURL command as the request it would send, with what of it was left out. */
export interface ParsedCurl {
  request: ExportRequest;
  /** `-u user:password`. */
  basic?: { username: string; password: string };
  /** What the command asked for that the app does not do, each as a sentence. */
  warnings: string[];
}

const ANSI_C: Record<string, string> = { n: "\n", t: "\t", r: "\r", a: "\x07", b: "\b", e: "\x1b", f: "\f", v: "\v", "\\": "\\", "'": "'", '"': '"', "?": "?" };

/** What follows a backslash inside `$'…'`, and how many characters of the text it took. */
function ansiEscape(text: string, at: number): [string, number] {
  const numbered: [RegExp, number][] = [
    [/^x([0-9a-fA-F]{1,2})/, 16],
    [/^u([0-9a-fA-F]{1,4})/, 16],
    [/^U([0-9a-fA-F]{1,8})/, 16],
    [/^([0-7]{1,3})/, 8],
  ];
  const rest = text.slice(at, at + 9);
  for (const [pattern, radix] of numbered) {
    const match = pattern.exec(rest);
    if (!match) continue;
    const code = parseInt(match[1], radix);
    return [code <= 0x10ffff ? String.fromCodePoint(code) : "", match[0].length];
  }
  const char = text[at] ?? "";
  return [Object.hasOwn(ANSI_C, char) ? ANSI_C[char] : `\\${char}`, 1];
}

/**
 * The words of a command line as bash reads them: single quotes, double
 * quotes, `$'…'` with its escapes (what Chrome and Firefox write for a body
 * with a line break or a quote in it), a backslash before a character, and
 * a backslash at the end of a line. Nothing is expanded: `$HOME` is that
 * text, and so is a backtick.
 */
function bashWords(text: string): string[] {
  const words: string[] = [];
  let word: string | null = null;
  const add = (piece: string) => (word = (word ?? "") + piece);
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "\\") {
      const next = text[i + 1];
      // A line that goes on: the backslash and the line break are nothing.
      if (next === "\n") i += 1;
      else if (next === "\r" && text[i + 2] === "\n") i += 2;
      else if (next !== undefined) {
        add(next);
        i += 1;
      }
    } else if (char === "'") {
      const end = text.indexOf("'", i + 1);
      if (end === -1) throw new ImportError("The cURL command has a single quote that is not closed.");
      add(text.slice(i + 1, end));
      i = end;
    } else if (char === "$" && text[i + 1] === "'") {
      let piece = "";
      let j = i + 2;
      for (; j < text.length && text[j] !== "'"; j++) {
        if (text[j] !== "\\") {
          piece += text[j];
          continue;
        }
        const [value, taken] = ansiEscape(text, j + 1);
        piece += value;
        j += taken;
      }
      if (j >= text.length) throw new ImportError("The cURL command has a quote that is not closed.");
      add(piece);
      i = j;
    } else if (char === '"') {
      let piece = "";
      let j = i + 1;
      for (; j < text.length && text[j] !== '"'; j++) {
        // Inside double quotes a backslash escapes only these; before anything else it is itself.
        if (text[j] === "\\" && '"\\$`\n'.includes(text[j + 1] ?? "")) {
          j += 1;
          if (text[j] !== "\n") piece += text[j];
        } else piece += text[j];
      }
      if (j >= text.length) throw new ImportError("The cURL command has a double quote that is not closed.");
      add(piece);
      i = j;
    } else if (/\s/.test(char)) {
      if (word !== null) words.push(word);
      word = null;
    } else add(char);
  }
  if (word !== null) words.push(word);
  return words;
}

/**
 * The words of a command line as Windows' cmd and its programs read them,
 * which is what "Copy as cURL (cmd)" writes: `^` before a character takes
 * it as it is and at the end of a line joins the next one; inside double
 * quotes `\"` and `""` are a quote.
 */
function cmdWords(text: string): string[] {
  const plain = text.replace(/\^(\r?\n|[\s\S])/g, (_match, next: string) => (/^\r?\n$/.test(next) ? "" : next));
  const words: string[] = [];
  let word: string | null = null;
  let quoted = false;
  for (let i = 0; i < plain.length; i++) {
    const char = plain[i];
    if (char === "\\" && plain[i + 1] === '"') {
      word = (word ?? "") + '"';
      i += 1;
    } else if (char === '"') {
      if (quoted && plain[i + 1] === '"') {
        word = (word ?? "") + '"';
        i += 1;
      } else {
        quoted = !quoted;
        word ??= "";
      }
    } else if (!quoted && /\s/.test(char)) {
      if (word !== null) words.push(word);
      word = null;
    } else word = (word ?? "") + char;
  }
  if (quoted) throw new ImportError("The cURL command has a double quote that is not closed.");
  if (word !== null) words.push(word);
  return words;
}

/**
 * True when the text is a command for cmd: it escapes with `^` (before a
 * quote, or at a line's end) and quotes nothing with single quotes, which
 * cmd does not have. A bash command that holds `^"` holds it inside single
 * quotes, as `buildCurl` and the browsers write it.
 */
const isCmd = (text: string) => /\^\r?\n|\^"/.test(text) && !text.includes("'");


/** Options that take a value, by every name they have, as the kind of thing they are. */
const VALUE_OPTIONS: Record<string, string> = {
  "-X": "method", "--request": "method",
  "-H": "header", "--header": "header",
  "-d": "data", "--data": "data", "--data-ascii": "data",
  "--data-raw": "data-raw",
  "--data-binary": "data-binary",
  "--data-urlencode": "data-urlencode",
  "-F": "form", "--form": "form",
  "--form-string": "form-string",
  "-u": "user", "--user": "user",
  "-b": "cookie", "--cookie": "cookie",
  "-A": "user-agent", "--user-agent": "user-agent",
  "-e": "referer", "--referer": "referer",
  "--url": "url",
};

/** Options with no value that change the request, and those that change nothing the app does. */
const FLAGS: Record<string, string> = {
  "-G": "get", "--get": "get",
  "-I": "head", "--head": "head",
  "-k": "insecure", "--insecure": "insecure",
  "--compressed": "compressed",
};
const QUIET_FLAGS = new Set(["-s", "--silent", "-S", "--show-error", "-v", "--verbose", "-i", "--include", "-L", "--location", "-f", "--fail", "-#", "--progress-bar", "-g", "--globoff", "-N", "--no-buffer", "--http1.1", "--http2", "-4", "-6", "-q", "-n", "-j"]);

/** Options that take a value the app has no use for: the value is skipped with the option. */
const SKIPPED_VALUE_OPTIONS = new Set([
  "-o", "--output", "-w", "--write-out", "-m", "--max-time", "--connect-timeout", "--retry", "--retry-delay", "--retry-max-time", "-x", "--proxy", "-U", "--proxy-user",
  "--cacert", "--capath", "-E", "--cert", "--key", "--cert-type", "--key-type", "-c", "--cookie-jar", "-T", "--upload-file", "--resolve", "--connect-to", "-D", "--dump-header",
  "--max-redirs", "-C", "--continue-at", "-r", "--range", "-y", "--speed-time", "-Y", "--speed-limit", "--limit-rate", "-K", "--config", "--interface", "--ciphers", "--tls-max",
  "-z", "--time-cond", "--oauth2-bearer", "--aws-sigv4", "--unix-socket", "--noproxy", "--pinnedpubkey", "--trace", "--trace-ascii", "--stderr", "--proto", "--proto-default",
]);

const formEncode = (text: string) => new URLSearchParams([[text, ""]]).toString().slice(0, -1);

/** The request's `Content-Type`: the last one named, as curl sends it. */
const contentType = (headers: [string, string][]): string | undefined => headers.filter(([name]) => name.toLowerCase() === "content-type").at(-1)?.[1];

/** One `-d`, `--data-urlencode` and so on, as the text it puts on the wire, or the file it names. */
type Datum = { text: string } | { file: string };

/** `--data-urlencode`: `content`, `=content` and `name=content` encode the content; `@file` and `name@file` read one. */
function urlencodeDatum(value: string): Datum {
  const [equals, at] = [value.indexOf("="), value.indexOf("@")];
  if (equals !== -1 && (at === -1 || equals < at)) {
    const name = value.slice(0, equals);
    return { text: `${name}${name ? "=" : ""}${formEncode(value.slice(equals + 1))}` };
  }
  if (at !== -1) return { file: value.slice(at + 1) };
  return { text: formEncode(value) };
}

/** `-F name=content`: `@file` is a file part, `<file` a text part read from a file, anything else text; `;type=` and `;filename=` follow either. */
function formPart(value: string, warnings: string[]): ExportPart | null {
  const equals = value.indexOf("=");
  if (equals === -1) {
    warnings.push(`A form part without "=" was left out: ${value}.`);
    return null;
  }
  const name = value.slice(0, equals);
  const content = value.slice(equals + 1);
  const quotedFile = /^@"((?:[^"\\]|\\.)*)"/.exec(content);
  if (quotedFile) return { name, fileName: quotedFile[1].replace(/\\(.)/g, "$1") };
  if (content.startsWith("@")) return { name, fileName: content.slice(1).split(/[;,]/)[0] };
  if (content.startsWith("<")) {
    warnings.push(`The form part ${name} takes its text from the file ${content.slice(1).split(";")[0]}, which was not read: the part is empty.`);
    return { name, value: "" };
  }
  // A text part may say its type; the text is what stands before it.
  return { name, value: content.replace(/;type=[^;]*$/, "") };
}

/**
 * A cURL command as the request it would send. It reads the command; it
 * runs nothing and reads no file: a body or a part that comes from a file
 * is named, or left out with a warning. Throws `ImportError`.
 */
export function parseCurl(text: string): ParsedCurl {
  if (!isCurlCommand(text)) throw new ImportError("This is not a cURL command: it does not start with curl.");
  const words = (isCmd(text) ? cmdWords(text) : bashWords(text)).slice(1);
  const warnings: string[] = [];
  const headers: [string, string][] = [];
  const data: Datum[] = [];
  const parts: ExportPart[] = [];
  const urls: string[] = [];
  let method: string | undefined;
  let basic: ParsedCurl["basic"];
  let [get, head, binaryOnly] = [false, false, true];

  const take = (kind: string, value: string): void => {
    switch (kind) {
      case "method":
        method = value.toUpperCase();
        break;
      case "header": {
        // "Name;" is a header with no value; "Name:" removes one curl would add, which the app does not add either.
        const colon = value.indexOf(":");
        if (colon > 0) headers.push([value.slice(0, colon).trim(), value.slice(colon + 1).trim()]);
        else if (value.endsWith(";")) headers.push([value.slice(0, -1).trim(), ""]);
        else warnings.push(`A header without ":" was left out: ${value}.`);
        break;
      }
      case "data":
      case "data-binary":
        if (kind === "data") binaryOnly = false;
        data.push(value.startsWith("@") ? { file: value.slice(1) } : { text: value });
        break;
      case "data-raw":
        binaryOnly = false;
        data.push({ text: value });
        break;
      case "data-urlencode":
        binaryOnly = false;
        data.push(urlencodeDatum(value));
        break;
      case "form": {
        const part = formPart(value, warnings);
        if (part) parts.push(part);
        break;
      }
      case "form-string": {
        const equals = value.indexOf("=");
        if (equals === -1) warnings.push(`A form part without "=" was left out: ${value}.`);
        else parts.push({ name: value.slice(0, equals), value: value.slice(equals + 1) });
        break;
      }
      case "user": {
        const colon = value.indexOf(":");
        basic = colon === -1 ? { username: value, password: "" } : { username: value.slice(0, colon), password: value.slice(colon + 1) };
        break;
      }
      case "cookie":
        // With "=" it is the cookies themselves; without, a file of them.
        if (value.includes("=")) headers.push(["Cookie", value]);
        else warnings.push(`The cookies of the file ${value} were left out: the file was not read.`);
        break;
      case "user-agent":
        headers.push(["User-Agent", value]);
        break;
      case "referer":
        headers.push(["Referer", value]);
        break;
      case "url":
        urls.push(value);
        break;
    }
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const valueOf = (option: string): string => {
      if (i + 1 >= words.length) throw new ImportError(`The cURL command ends after ${option}, which needs a value.`);
      return words[++i];
    };
    if (!word.startsWith("-") || word === "-") {
      urls.push(word);
    } else if (word.startsWith("--")) {
      if (Object.hasOwn(VALUE_OPTIONS, word)) take(VALUE_OPTIONS[word], valueOf(word));
      else if (Object.hasOwn(FLAGS, word)) ({ get, head } = flag(FLAGS[word], { get, head }, warnings));
      else if (SKIPPED_VALUE_OPTIONS.has(word)) warnings.push(`${word} ${valueOf(word)} was left out: the app has nothing it applies to.`);
      else if (!QUIET_FLAGS.has(word)) warnings.push(`${word} was left out: the app does not know this option.`);
    } else {
      // Short options, which may stand together: -sSL, and -XPOST with its value in the same word.
      for (let at = 1; at < word.length; at++) {
        const option = `-${word[at]}`;
        const rest = word.slice(at + 1);
        if (Object.hasOwn(VALUE_OPTIONS, option)) {
          take(VALUE_OPTIONS[option], rest || valueOf(option));
          break;
        }
        if (SKIPPED_VALUE_OPTIONS.has(option)) {
          warnings.push(`${option} ${rest || valueOf(option)} was left out: the app has nothing it applies to.`);
          break;
        }
        if (Object.hasOwn(FLAGS, option)) ({ get, head } = flag(FLAGS[option], { get, head }, warnings));
        else if (!QUIET_FLAGS.has(option)) warnings.push(`${option} was left out: the app does not know this option.`);
      }
    }
  }

  if (!urls.length) throw new ImportError("The cURL command has no address.");
  if (urls.length > 1) warnings.push(`The command names ${urls.length} addresses. The first is used; the others were left out: ${urls.slice(1).join(", ")}.`);
  let url = urls[0];

  const type = (contentType(headers) ?? "").toLowerCase();
  let body: ExportBody = { mode: "none" };
  const files = data.flatMap((datum) => ("file" in datum ? [datum.file] : []));
  if (parts.length) {
    body = { mode: "multipart", parts };
    if (data.length) warnings.push("The command has both a form (-F) and data (-d). curl refuses that; the form is kept.");
  } else if (get) {
    // -G: the data is the query, not a body.
    const query = data.flatMap((datum) => ("text" in datum ? [datum.text] : [])).join("&");
    if (files.length) warnings.push(`The data of the file ${files.join(", ")} was left out: the file was not read.`);
    if (query) url += (url.includes("?") ? "&" : "?") + query;
  } else if (data.length === 1 && files.length === 1 && binaryOnly) {
    body = { mode: "binary", fileName: files[0] };
  } else if (data.length) {
    if (files.length) warnings.push(`The data of the file ${files.join(", ")} was left out: the file was not read.`);
    const wire = data.flatMap((datum) => ("text" in datum ? [datum.text] : [])).join("&");
    // Without a type of its own, curl sends data as a form.
    body = !type || type.startsWith("application/x-www-form-urlencoded") ? { mode: "urlencoded", fields: [...new URLSearchParams(wire)] } : { mode: "raw", text: wire };
  }

  method ??= head ? "HEAD" : body.mode === "none" ? "GET" : "POST";
  if (!isHttpMethod(method)) throw new ImportError(`The cURL command's method, ${method}, is not an HTTP method: one word of at most 32 characters.`);
  return { request: { method, url, headers, body }, ...(basic && { basic }), warnings };
}

function flag(kind: string, state: { get: boolean; head: boolean }, warnings: string[]): { get: boolean; head: boolean } {
  if (kind === "get") return { ...state, get: true };
  if (kind === "head") return { ...state, head: true };
  if (kind === "insecure") warnings.push("-k (do not check the server's certificate) was left out: a browser always checks it, and the Local Bridge cannot skip the check yet.");
  if (kind === "compressed") warnings.push("--compressed was left out: the browser asks for a compressed answer by itself.");
  return state;
}

/** The raw language whose type this is, or text. */
function languageOf(type: string): RawLanguage {
  const base = type.split(";")[0].trim();
  if (base.endsWith("json")) return "json";
  if (base.endsWith("xml")) return "xml";
  if (base === "text/html") return "html";
  if (base.endsWith("javascript")) return "javascript";
  return "text";
}

/**
 * A parsed command as a request of the app. The body's own `Content-Type`
 * is dropped where the app writes the same one by itself. A file the
 * command names is not here: its part, or the body, says which file to
 * choose again.
 */
export function curlRequest(parsed: ParsedCurl): { content: RequestContent; warnings: string[] } {
  const { request, basic } = parsed;
  const warnings = [...parsed.warnings];
  const { body } = request;
  const type = contentType(request.headers) ?? "";
  const language = languageOf(type.toLowerCase());
  const row = (key: string, value: string): Row => ({ key, value, enabled: true });
  // The type the app would send for this body anyway: its row would only repeat it.
  const implied =
    body.mode === "urlencoded" ? "application/x-www-form-urlencoded" : body.mode === "multipart" ? "multipart/form-data" : body.mode === "raw" ? RAW_CONTENT_TYPES[language] : null;
  const headers = request.headers.filter(([name, value]) => !(name.toLowerCase() === "content-type" && implied !== null && value.toLowerCase().split(";")[0].trim() === implied));
  const content: RequestContent = { ...emptyRequest(), method: request.method, url: request.url, headers: headers.map(([name, value]) => row(name, value)) };
  if (basic) content.auth = { type: "basic", ...basic };
  if (body.mode === "raw") {
    content.body = { mode: "raw", raw: { language, text: body.text } };
  } else if (body.mode === "urlencoded") {
    content.body = { mode: "urlencoded", urlencoded: body.fields.map(([name, value]) => row(name, value)) };
  } else if (body.mode === "multipart") {
    content.body = {
      mode: "multipart",
      multipart: body.parts.map((part) => ("value" in part ? { kind: "text", key: part.name, value: part.value, enabled: true } : { kind: "file", key: part.name, fileId: "", fileName: part.fileName, enabled: true })),
    };
    for (const part of body.parts) if ("fileName" in part) warnings.push(`The form part ${part.name} sends the file ${part.fileName}. Choose the file again in the Body tab: a command names a file, it does not hold it.`);
  } else if (body.mode === "binary") {
    content.body = { mode: "binary", ...(type && { binary: { fileId: "", fileName: body.fileName, contentType: type } }) };
    warnings.push(`The body is the file ${body.fileName}. Choose the file again in the Body tab: a command names a file, it does not hold it.`);
  }
  return { content, warnings };
}
