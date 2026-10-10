import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { JSON_VIEW_LIMIT, PREVIEW_CSP, hexDump, indentXml, previewDocument, responseViews } from "./response-view";

const text = (contentType: string, more: Partial<Parameters<typeof responseViews>[0]> = {}) =>
  responseViews({ contentType, binary: false, json: false, length: 10, ...more });

describe("responseViews (P2.13)", () => {
  it("shows a body by its content type, the default first", () => {
    expect(text("application/json", { json: true })[0]).toBe("json");
    expect(text("text/html; charset=utf-8")[0]).toBe("html");
    expect(text("application/xhtml+xml")[0]).toBe("html");
    expect(text("application/xml")[0]).toBe("xml");
    expect(text("image/svg+xml")[0]).toBe("xml");
    expect(text("text/plain")[0]).toBe("text");
    expect(text("")[0]).toBe("text");
  });

  it("lets any text body be read as text, XML or an HTML preview, and as JSON only when it is JSON", () => {
    expect(text("text/plain")).toEqual(["text", "xml", "html"]);
    expect(text("text/html")).toEqual(["html", "text", "xml"]);
    expect(text("text/plain", { json: true })).toEqual(["json", "text", "xml", "html"]);
  });

  it("opens JSON over 5 MB as plain text and still offers JSON", () => {
    expect(text("application/json", { json: true, length: JSON_VIEW_LIMIT })[0]).toBe("json");
    expect(text("application/json", { json: true, length: JSON_VIEW_LIMIT + 1 }).slice(0, 2)).toEqual(["text", "json"]);
  });

  it("offers nothing but text for an empty body", () => {
    expect(text("text/html", { length: 0 })).toEqual(["text"]);
  });

  it("previews only the image types a browser draws without running anything", () => {
    const binary = (contentType: string) => responseViews({ contentType, binary: true, json: false, length: 4 });
    expect(binary("image/png")).toEqual(["image", "hex"]);
    expect(binary("IMAGE/JPEG")).toEqual(["image", "hex"]);
    expect(binary("application/pdf")).toEqual(["hex"]);
    // A binary body that calls itself HTML or SVG is never given to the page as that type.
    expect(binary("text/html")).toEqual(["hex"]);
    expect(binary("image/svg+xml")).toEqual(["hex"]);
  });
});

describe("indentXml (P2.13, D19: no DOMParser)", () => {
  it("puts each element on its own line, indented by depth, with a text-only element on one line", () => {
    expect(indentXml('<?xml version="1.0"?><fixture><name>echo</name><empty/><list><item>1</item></list></fixture>')).toBe(
      ['<?xml version="1.0"?>', "<fixture>", "  <name>echo</name>", "  <empty/>", "  <list>", "    <item>1</item>", "  </list>", "</fixture>"].join("\n")
    );
  });

  it("keeps a comment, a CDATA section and a '>' inside an attribute whole", () => {
    expect(indentXml('<a b="x>y"><!-- <not a tag> --><![CDATA[<raw>]]></a>')).toBe(
      ['<a b="x>y">', "  <!-- <not a tag> -->", "  <![CDATA[<raw>]]>", "</a>"].join("\n")
    );
  });

  it("does not indent below zero for a stray closing tag", () => {
    expect(indentXml("</a><b/>")).toBe("</a>\n<b/>");
  });

  it("changes nothing but whitespace, whatever the text", () => {
    const squeeze = (value: string) => value.replace(/\s+/g, "");
    fc.assert(
      fc.property(fc.array(fc.constantFrom("<a>", "</a>", "<b x='>'/>", "<", ">", '"', "text", " ", "\n", "<!--", "-->", "<![CDATA[", "]]>", "<?p?>")), (parts) => {
        const input = parts.join("");
        expect(squeeze(indentXml(input))).toBe(squeeze(input));
      })
    );
  });
});

describe("hexDump (P2.13)", () => {
  it("writes offset, 16 bytes in hex and their printable characters per line", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3, 0x7e, 0x7f, 0xff, 0x20, 0x41]);
    expect(hexDump(bytes)).toBe(
      ["00000000  89 50 4e 47 0d 0a 1a 0a 00 01 02 03 7e 7f ff 20  |.PNG........~.. |", `00000010  41${" ".repeat(45)}  |A|`].join("\n")
    );
  });

  it("is empty for no bytes", () => {
    expect(hexDump(new Uint8Array())).toBe("");
  });
});

describe("previewDocument (P2.13, D19)", () => {
  it("places its policy before anything the response wrote", () => {
    const page = previewDocument('<script>alert(1)</script><meta http-equiv="Content-Security-Policy" content="default-src *">');
    expect(page.indexOf(PREVIEW_CSP)).toBeGreaterThan(-1);
    expect(page.indexOf(PREVIEW_CSP)).toBeLessThan(page.indexOf("<script>"));
    expect(page.indexOf('<base target="_blank">')).toBeLessThan(page.indexOf("<script>"));
  });

  it("allows no network source, no script and no frame", () => {
    expect(PREVIEW_CSP).toBe("default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  });

  it("keeps a doctype first, so the page is not drawn in quirks mode, and nothing else", () => {
    expect(previewDocument("<!DOCTYPE html><h1>hi</h1>")).toMatch(/^<!DOCTYPE html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"/);
    expect(previewDocument("<!-- x --><!doctype html>")).toMatch(/^<meta charset/);
  });
});
