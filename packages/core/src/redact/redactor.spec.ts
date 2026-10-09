import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emptyRequest } from "../model/request";
import { MASK, MIN_SECRET_LENGTH, Redactor, isCredentialHeader } from "./redactor";

const utf8 = (text: string) => new TextEncoder().encode(text);
const base64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
const base64url = (bytes: Uint8Array) => base64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const binary = (bytes: Uint8Array) => Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

/**
 * Whether `secret` can still be read out of base64 text after masking: every
 * run of base64 characters that is left is decoded from each of the four
 * positions a reader could start at.
 */
function survivesInBase64(redacted: string, secret: string): boolean {
  const needle = binary(utf8(secret));
  for (const run of redacted.replace(/-/g, "+").replace(/_/g, "/").split(/[^A-Za-z0-9+/]+/)) {
    for (let start = 0; start < 4; start++) {
      // Read to the end of the run: a single character left over holds no whole byte, the rest is padded.
      const piece = run.slice(start);
      const usable = piece.length % 4 === 1 ? piece.slice(0, -1) : piece;
      if (usable && atob(usable.padEnd(Math.ceil(usable.length / 4) * 4, "=")).includes(needle)) return true;
    }
  }
  return false;
}

/** A secret long enough to be found, of any characters. */
const secret = fc.string({ minLength: MIN_SECRET_LENGTH, maxLength: 40, unit: "grapheme" });
/** Text around a secret that does not itself hold the mask. */
const around = fc.string({ maxLength: 30, unit: "grapheme" });

describe("Redactor", () => {
  it("masks a secret wherever it stands in text, and leaves text without one as it is", () => {
    const redactor = new Redactor(["s3cr3t-value"]);
    expect(redactor.text("Bearer s3cr3t-value and again s3cr3t-value.")).toBe(`Bearer ${MASK} and again ${MASK}.`);
    expect(redactor.text("nothing here")).toBe("nothing here");
    expect(new Redactor([]).text("s3cr3t-value")).toBe("s3cr3t-value");
  });

  it("does not look for a secret shorter than 6 characters: it would mask ordinary text", () => {
    expect(MIN_SECRET_LENGTH).toBe(6);
    expect(new Redactor(["12345"]).text("id=12345")).toBe("id=12345");
    expect(new Redactor(["123456"]).text("id=123456")).toBe(`id=${MASK}`);
  });

  it("masks the longer of two secrets first, so one that holds the other leaves no tail", () => {
    expect(new Redactor(["abcdef", "abcdef-and-more"]).text("x abcdef-and-more y")).toBe(`x ${MASK} y`);
  });

  it("masks the percent-encoded forms: as a URL component, as a form field, and with lower-case hex", () => {
    const value = "p@ss word/+é~!";
    const redactor = new Redactor([value]);
    const component = encodeURIComponent(value);
    const form = new URLSearchParams({ k: value }).toString().slice(2);

    expect(component).not.toBe(form);
    expect(redactor.text(`https://h/?k=${component}`)).toBe(`https://h/?k=${MASK}`);
    expect(redactor.text(`k=${form}&x=1`)).toBe(`k=${MASK}&x=1`);
    expect(redactor.text(component.toLowerCase().replace("p%40ss", "p%40ss"))).not.toContain("word");
    expect(redactor.text(component.replace(/%[0-9A-F]{2}/g, (hex) => hex.toLowerCase()))).toBe(MASK);
  });

  it("masks a value as a browser writes it into a URL, in the query and in the path (property)", () => {
    fc.assert(
      fc.property(secret, (value) => {
        const redactor = new Redactor([value]);
        const url = new URL("https://api.test/");
        url.search = `?k=${value}`;
        const inQuery = url.search.slice(3);
        url.search = "";
        url.pathname = `/${value}`;
        const inPath = url.pathname.slice(1);
        // Where the URL parser keeps the value in one piece, that piece is masked.
        if (!/[?#]/.test(value)) {
          expect(redactor.text(`GET /echo?k=${inQuery} HTTP/1.1`)).toBe(`GET /echo?k=${MASK} HTTP/1.1`);
        }
        if (!/[?#/\\]/.test(value) && !/^\.{1,2}$/.test(value)) {
          expect(redactor.text(`"path": "/${inPath}"`)).toBe(`"path": "/${MASK}"`);
        }
      }),
      { numRuns: 300 }
    );
  });

  it("takes a secret that holds half of a surrogate pair, which cannot be percent-encoded", () => {
    const value = "abc\ud800def";
    expect(new Redactor([value]).text(`x ${value} y`)).toBe(`x ${MASK} y`);
  });

  it("masks the JSON-escaped forms, with non-ASCII as it is and as \\u escapes", () => {
    const value = 'q"uote\\slash\nline é';
    const redactor = new Redactor([value]);
    const escaped = JSON.stringify(value).slice(1, -1);
    const ascii = escaped.replace(/[\u0080-￿]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);

    expect(redactor.text(JSON.stringify({ echoed: value }))).toBe(`{"echoed":"${MASK}"}`);
    expect(redactor.text(`{"echoed":"${ascii}"}`)).toBe(`{"echoed":"${MASK}"}`);
  });

  it("the test's own reader finds a secret in base64 wherever it starts and ends", () => {
    for (const before of ["", "a", "ab", "abc"]) {
      for (const after of ["", "z", "zy"]) {
        const bytes = utf8(`${before}s3cr3t-value${after}`);
        expect(survivesInBase64(base64(bytes), "s3cr3t-value"), `${before}|${after}`).toBe(true);
        expect(survivesInBase64(`x.${base64url(bytes)}.y`, "s3cr3t-value"), `${before}|${after}`).toBe(true);
      }
    }
    expect(survivesInBase64(base64(utf8("s3cr3t-valu")), "s3cr3t-value")).toBe(false);
  });

  it("masks a secret inside Basic credentials: base64 of user:secret does not contain base64 of the secret alone", () => {
    const value = "hunter2-hunter2";
    const header = base64(utf8(`bob:${value}`));
    expect(header).not.toContain(base64(utf8(value)).replace(/=+$/, ""));

    const redacted = new Redactor([value]).text(`Basic ${header}`);
    expect(redacted).toContain(MASK);
    expect(survivesInBase64(redacted, value)).toBe(false);
  });

  it("finds 0 survivors of a random secret at a random offset inside base64 and base64url text (property)", () => {
    fc.assert(
      fc.property(secret, fc.uint8Array({ maxLength: 12 }), fc.uint8Array({ maxLength: 12 }), (value, before, after) => {
        const bytes = new Uint8Array([...before, ...utf8(value), ...after]);
        const redactor = new Redactor([value]);
        for (const encoded of [base64(bytes), base64url(bytes)]) {
          const redacted = redactor.text(`data:${encoded};`);
          expect(redacted).toContain(MASK);
          expect(survivesInBase64(redacted, value)).toBe(false);
        }
      }),
      { numRuns: 500 }
    );
  });

  it("finds 0 survivors of a random secret at a random offset inside percent-encoded and JSON-escaped text (property)", () => {
    fc.assert(
      fc.property(secret, around, around, (value, before, after) => {
        const redactor = new Redactor([value]);
        const whole = `${before}${value}${after}`;
        const forms = [
          whole,
          encodeURIComponent(before) + encodeURIComponent(value) + encodeURIComponent(after),
          new URLSearchParams({ k: whole }).toString(),
          JSON.stringify({ k: whole }),
          JSON.stringify(JSON.stringify({ k: whole })).slice(1, -1).replace(/\\\\/g, "\\"),
        ];
        const [plain, component, form, json] = forms.map((text) => redactor.text(text));
        expect(plain).not.toContain(value);
        expect(decodeURIComponent(component.replaceAll(MASK, ""))).not.toContain(value);
        expect(new URLSearchParams(form.replaceAll(MASK, "")).get("k") ?? "").not.toContain(value);
        expect(json).not.toContain(JSON.stringify(value).slice(1, -1));
      }),
      { numRuns: 500 }
    );
  });

  describe("headers", () => {
    it.each(["Authorization", "proxy-authorization", "Cookie", "Set-Cookie", "X-API-Key", "X-Auth-Token", "x-client-secret", "Api-Key", "X-Password"])(
      "%s is a credential header",
      (name) => expect(isCredentialHeader(name)).toBe(true)
    );

    it.each(["Content-Type", "Accept", "X-Request-Id", "User-Agent"])("%s is not", (name) => expect(isCredentialHeader(name)).toBe(false));

    it("masks the whole value of a credential header, and a secret inside any other value", () => {
      const redactor = new Redactor(["s3cr3t-value"]);
      expect(
        redactor.headers([
          ["Authorization", "Bearer typed-by-hand"],
          ["Set-Cookie", "sid=1"],
          ["Set-Cookie", "theme=dark"],
          ["X-Echo", "you sent s3cr3t-value"],
          ["Accept", "*/*"],
        ])
      ).toEqual([
        ["Authorization", MASK],
        ["Set-Cookie", MASK],
        ["Set-Cookie", MASK],
        ["X-Echo", `you sent ${MASK}`],
        ["Accept", "*/*"],
      ]);
    });

    it("keeps credential headers when the user asks for them, and still masks vault secrets", () => {
      const redactor = new Redactor(["s3cr3t-value"]);
      expect(redactor.headers([["Authorization", "Bearer typed-by-hand"], ["X-Key", "s3cr3t-value"]], { credentials: true })).toEqual([
        ["Authorization", "Bearer typed-by-hand"],
        ["X-Key", MASK],
      ]);
    });

    it("masks a secret that is a header's name", () => {
      expect(new Redactor(["s3cr3t-name"]).headers([["s3cr3t-name", "1"]])).toEqual([[MASK, "1"]]);
    });
  });

  describe("template", () => {
    it("masks a vault secret wherever a composed request holds it, and leaves files and everything else as composed", () => {
      const request = {
        ...emptyRequest(),
        url: "https://h/?k=s3cr3t-value",
        params: [{ key: "k", value: "s3cr3t-value", enabled: true }],
        headers: [{ key: "X-Echo", value: "s3cr3t-value", enabled: true }],
        body: {
          mode: "multipart" as const,
          raw: { language: "text" as const, text: "raw s3cr3t-value" },
          urlencoded: [{ key: "f", value: "s3cr3t-value", enabled: true }],
          multipart: [
            { kind: "text" as const, key: "t", value: "s3cr3t-value", enabled: true },
            { kind: "file" as const, key: "f", fileId: "file-1", fileName: "a.bin", enabled: true },
          ],
          binary: { fileId: "file-2", fileName: "b.bin" },
        },
        scripts: { pre: "p", post: "q" },
      };
      const masked = new Redactor(["s3cr3t-value"]).template(request);

      expect(masked).toEqual({
        ...request,
        url: `https://h/?k=${MASK}`,
        params: [{ key: "k", value: MASK, enabled: true }],
        headers: [{ key: "X-Echo", value: MASK, enabled: true }],
        body: {
          ...request.body,
          raw: { language: "text", text: `raw ${MASK}` },
          urlencoded: [{ key: "f", value: MASK, enabled: true }],
          multipart: [{ kind: "text", key: "t", value: MASK, enabled: true }, request.body.multipart[1]],
        },
      });
      expect(JSON.stringify(masked)).not.toContain("s3cr3t-value");
      // A body with no parts stays as it is.
      expect(new Redactor([]).template(emptyRequest()).body).toEqual({ mode: "none" });
    });

    it("masks a credential typed into the Auth tab or a credential header, and keeps one that is a variable", () => {
      const redactor = new Redactor([]);
      expect(redactor.auth({ type: "bearer", token: "typed-token" })).toEqual({ type: "bearer", token: MASK });
      expect(redactor.auth({ type: "bearer", token: "{{token}}" })).toEqual({ type: "bearer", token: "{{token}}" });
      expect(redactor.auth({ type: "basic", username: "alice", password: "typed" })).toEqual({ type: "basic", username: "alice", password: MASK });
      expect(redactor.auth({ type: "basic", username: "alice", password: "" })).toEqual({ type: "basic", username: "alice", password: "" });
      expect(redactor.auth({ type: "apikey", key: "X-Key", value: "typed", in: "query" })).toEqual({ type: "apikey", key: "X-Key", value: MASK, in: "query" });
      expect(redactor.auth({ type: "none" })).toEqual({ type: "none" });
      expect(redactor.auth({ type: "bearer", token: "typed-token" }, { credentials: true })).toEqual({ type: "bearer", token: "typed-token" });

      expect(
        redactor.rows([
          { key: "Authorization", value: "Bearer typed", enabled: true },
          { key: "Authorization", value: "Bearer {{token}}", enabled: false },
          { key: "Accept", value: "*/*", enabled: true },
        ])
      ).toEqual([
        { key: "Authorization", value: MASK, enabled: true },
        { key: "Authorization", value: "Bearer {{token}}", enabled: false },
        { key: "Accept", value: "*/*", enabled: true },
      ]);
    });
  });
});
