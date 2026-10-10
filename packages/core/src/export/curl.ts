import type { ExportBody, ExportRequest } from "./request";

/** `value` as one word of a POSIX shell: in single quotes, a single quote of its own closed, escaped and opened again. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** A form field's name or value as `application/x-www-form-urlencoded` writes it. */
const formEncode = (text: string) => new URLSearchParams([[text, ""]]).toString().slice(0, -1);

/**
 * The arguments that carry the body. Text the user wrote is never placed
 * where curl reads it as an option or as a file: `--data-raw` and
 * `--form-string` take their value as it is, where `-d` and `-F` read
 * `@name` as a file and `<name` from one.
 */
function bodyArguments(body: ExportBody): string[] {
  switch (body.mode) {
    case "none":
      return [];
    case "raw":
      return body.text ? [`--data-raw ${shellQuote(body.text)}`] : [];
    case "urlencoded":
      // curl encodes what follows the first "=" and takes the name as already encoded.
      // A field without a name has no "=" of its own for curl to split at: it is written whole.
      return body.fields.map(([name, value]) => (name ? `--data-urlencode ${shellQuote(`${formEncode(name)}=${value}`)}` : `--data-raw ${shellQuote(`=${formEncode(value)}`)}`));
    case "multipart":
      return body.parts.map((part) =>
        "value" in part ? `--form-string ${shellQuote(`${part.name}=${part.value}`)}` : `-F ${shellQuote(`${part.name}=@"${part.fileName.replace(/[\\"]/g, "\\$&")}"`)}`
      );
    case "binary":
      return body.fileName ? [`--data-binary ${shellQuote(`@${body.fileName}`)}`] : [];
  }
}

/**
 * The request as a cURL command for a POSIX shell, one argument per line.
 * A file of the body is named, not embedded: run the command where the
 * file is.
 */
export function buildCurl(request: ExportRequest): string {
  // curl splits a form part at its first "=", and what follows is then read by curl's own rules: a part
  // named `x=@/etc/passwd;` would send that file. Such a name cannot be said, so no command is written.
  const unsayable = request.body.mode === "multipart" ? request.body.parts.find((part) => /[=;"\r\n]/.test(part.name)) : undefined;
  if (unsayable) {
    return `# curl cannot say this request: the name of the form part ${JSON.stringify(unsayable.name)} holds "=", ";", a quote or a line break, which curl reads as the end of the name.`;
  }
  const parts: string[] = ["curl"];
  if (request.method === "HEAD") {
    // -X HEAD sends the method and then waits for a body: --head is the request curl knows has none.
    parts.push("--head");
  } else if (request.method !== "GET") {
    // An imported collection can carry any string as its method; only a plain token goes unquoted.
    parts.push(`-X ${/^[A-Za-z]+$/.test(request.method) ? request.method : shellQuote(request.method)}`);
  }
  // An address that starts with "-" would be read as an option: --url takes it as its value.
  parts.push(request.url.startsWith("-") ? `--url ${shellQuote(request.url)}` : shellQuote(request.url));
  for (const [name, value] of request.headers) {
    if (name) parts.push(`-H ${shellQuote(`${name}: ${value}`)}`);
  }
  parts.push(...bodyArguments(request.body));
  return parts.join(" \\\n  ");
}
