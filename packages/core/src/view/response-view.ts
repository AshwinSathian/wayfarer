/** A way to show a response body. */
export type ResponseView = "json" | "text" | "xml" | "html" | "image" | "hex";

/** JSON longer than this opens as plain text: formatting and folding it would stall the page. */
export const JSON_VIEW_LIMIT = 5 * 1024 * 1024;

/** How much of a binary body the hex view shows. */
export const HEX_VIEW_BYTES = 64 * 1024;

/**
 * The types an `<img>` draws without running anything. Not SVG: opened on
 * its own, a `blob:` URL of that type is a document of the app's origin.
 */
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp", "image/x-icon", "image/vnd.microsoft.icon"];

export interface ViewedBody {
  contentType: string;
  /** Bytes that are not text. */
  binary: boolean;
  /** The text parses as JSON. */
  json: boolean;
  /** Characters of text, or bytes. */
  length: number;
}

/** The views a body can be shown in. The first is the one its content type asks for; the rest are the user's to choose. */
export function responseViews(body: ViewedBody): ResponseView[] {
  const mediaType = body.contentType.split(";")[0].trim().toLowerCase();
  if (body.binary) {
    return IMAGE_TYPES.includes(mediaType) ? ["image", "hex"] : ["hex"];
  }
  if (!body.length) {
    return ["text"];
  }
  const offered: ResponseView[] = body.json ? ["json", "text", "xml", "html"] : ["text", "xml", "html"];
  const first: ResponseView = body.json
    ? body.length > JSON_VIEW_LIMIT
      ? "text"
      : "json"
    : mediaType.includes("html")
      ? "html"
      : mediaType.includes("xml")
        ? "xml"
        : "text";
  return [first, ...offered.filter((view) => view !== first)];
}

// A comment, a CDATA section, a tag (a quoted attribute may hold ">"), a "<" that opens none of these, or text.
const XML_TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<(?:[^<>"']|"[^"]*"|'[^']*')*>|<|[^<]+/g;

/**
 * XML with one element per line, indented by depth. It works on the text:
 * `DOMParser` is a Trusted Types sink the app's policy does not allow (plan
 * D19). Only whitespace between tags changes, and text that is not XML comes
 * back as it was, line by line.
 */
export function indentXml(text: string, indent = "  "): string {
  const tokens = text.match(XML_TOKEN) ?? [];
  const lines: string[] = [];
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.startsWith("<")) {
      const trimmed = token.trim();
      if (trimmed) lines.push(indent.repeat(depth) + trimmed);
      continue;
    }
    if (token.startsWith("</")) depth = Math.max(0, depth - 1);
    const opens = /^<[^!?/]/.test(token) && !token.endsWith("/>");
    // <name>text</name> stays on one line.
    if (opens && tokens[i + 2]?.startsWith("</") && !tokens[i + 1].startsWith("<")) {
      lines.push(indent.repeat(depth) + token + tokens[i + 1].trim() + tokens[i + 2]);
      i += 2;
      continue;
    }
    lines.push(indent.repeat(depth) + token);
    if (opens) depth++;
  }
  return lines.join("\n");
}

/** Bytes as a hex dump: offset, 16 bytes, and their printable ASCII characters. */
export function hexDump(bytes: Uint8Array): string {
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const row = Array.from(bytes.subarray(offset, offset + 16));
    const hex = row.map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
    const ascii = row.map((byte) => (byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : ".")).join("");
    lines.push(`${offset.toString(16).padStart(8, "0")}  ${hex.padEnd(47)}  |${ascii}|`);
  }
  return lines.join("\n");
}

/** What the previewed page may load: its own inline styles and `data:` images. No network, no script, no frame. */
export const PREVIEW_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

/**
 * An HTML response as the document the preview frame shows (plan D19). The
 * policy comes before anything the response wrote, so the response cannot
 * loosen it; a link opens a new window, which the frame's sandbox refuses.
 * Only a doctype may stay in front: after an element it would be ignored and
 * the page drawn in quirks mode.
 */
export function previewDocument(html: string): string {
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html)?.[0] ?? "";
  return `${doctype}<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><base target="_blank">${html.slice(doctype.length)}`;
}
