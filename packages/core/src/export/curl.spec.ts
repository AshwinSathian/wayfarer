import { describe, expect, it } from "vitest";
import { buildCurl } from "./curl";
import { exportBody, redactExport, type ExportRequest } from "./request";

const request = (fields: Partial<ExportRequest>): ExportRequest => ({ method: "GET", url: "https://api.test/", headers: [], body: { mode: "none" }, ...fields });

// Moved from the app's `export.spec.ts` (P4.6 a), on the request as built.
describe("buildCurl", () => {
  it("writes a GET as the bare URL plus its headers, one argument per line", () => {
    expect(buildCurl(request({ url: "https://api.test/items?a=1", headers: [["Accept", "application/json"], ["", "skipped"]] }))).toBe(
      "curl \\\n  'https://api.test/items?a=1' \\\n  -H 'Accept: application/json'"
    );
  });

  it("adds the method and a text body for other methods", () => {
    expect(buildCurl(request({ method: "POST", url: "https://api.test/items", body: { mode: "raw", text: '{"name":"a"}' } }))).toBe(
      "curl \\\n  -X POST \\\n  'https://api.test/items' \\\n  --data-raw '{\"name\":\"a\"}'"
    );
  });

  it("escapes single quotes so a value cannot end the shell string early", () => {
    const command = buildCurl(request({ method: "PUT", url: "https://api.test/o'brien", headers: [["X-Note", "it's"]], body: { mode: "raw", text: "name='x'; rm -rf /" } }));

    expect(command).toContain("'https://api.test/o'\\''brien'");
    expect(command).toContain("-H 'X-Note: it'\\''s'");
    expect(command).toContain("--data-raw 'name='\\''x'\\''; rm -rf /'");
  });

  it("quotes a method that is not a plain token and sends an @-body as data, not a file", () => {
    const command = buildCurl(request({ method: "GET; touch /tmp/x", body: { mode: "raw", text: "@/etc/passwd" } }));

    expect(command).toContain("-X 'GET; touch /tmp/x'");
    expect(command).toContain("--data-raw '@/etc/passwd'");
  });

  it("leaves out an empty or absent body", () => {
    expect(buildCurl(request({ method: "DELETE", body: { mode: "raw", text: "" } }))).not.toContain("--data");
    expect(buildCurl(request({ method: "DELETE" }))).not.toContain("--data");
  });

  // F31: these were left out of the command without a word.
  it("HEAD is --head: -X HEAD would make curl wait for a body that never comes", () => {
    expect(buildCurl(request({ method: "HEAD" }))).toBe("curl \\\n  --head \\\n  'https://api.test/'");
  });

  it("a form is one --data-urlencode per field, the name encoded here since curl encodes only the value", () => {
    const command = buildCurl(request({ method: "POST", body: { mode: "urlencoded", fields: [["q", "a b&c=d"], ["na me", "é"], ["", "no name"], ["@file", "@/etc/passwd"]] } }));

    expect(command.split(" \\\n  ").slice(3)).toEqual(["--data-urlencode 'q=a b&c=d'", "--data-urlencode 'na+me=é'", "--data-raw '=no+name'", "--data-urlencode '%40file=@/etc/passwd'"]);
  });

  it("a multipart form is --form-string for text, which curl never reads as a file, and -F with @ for a file", () => {
    const command = buildCurl(
      request({
        method: "POST",
        body: {
          mode: "multipart",
          parts: [
            { name: "note", value: "héllo" },
            { name: "trap", value: "@/etc/passwd" },
            { name: "also", value: "<stdin;type=text/x" },
            { name: "upload", fileName: "one megabyte.bin" },
            { name: "odd", fileName: 'we"ird;name,\\.txt' },
          ],
        },
      })
    );

    expect(command.split(" \\\n  ").slice(3)).toEqual([
      "--form-string 'note=héllo'",
      "--form-string 'trap=@/etc/passwd'",
      "--form-string 'also=<stdin;type=text/x'",
      `-F 'upload=@"one megabyte.bin"'`,
      `-F 'odd=@"we\\"ird;name,\\\\.txt"'`,
    ]);
  });

  it("a file body is --data-binary with the file's name, quoted for the shell", () => {
    expect(buildCurl(request({ method: "PUT", body: { mode: "binary", fileName: "it's.png" } }))).toContain("--data-binary '@it'\\''s.png'");
    // No file chosen yet: there is nothing to name.
    expect(buildCurl(request({ method: "PUT", body: { mode: "binary", fileName: "" } }))).not.toContain("--data");
  });
});

describe("exportBody: the body of a request as an export writes it", () => {
  const upper = (text: string) => text.replace("{{v}}", "V");

  it("resolves the text of each mode and names files instead of reading them", () => {
    expect(exportBody({ mode: "raw", raw: { language: "json", text: '{"a":"{{v}}"}' } }, "POST", upper)).toEqual({ mode: "raw", text: '{"a":"V"}' });
    expect(exportBody({ mode: "urlencoded", urlencoded: [{ key: "a", value: "{{v}}", enabled: true }, { key: "off", value: "x", enabled: false }] }, "POST", upper)).toEqual({ mode: "urlencoded", fields: [["a", "V"]] });
    expect(
      exportBody({ mode: "multipart", multipart: [{ kind: "text", key: "{{v}}", value: "t", enabled: true }, { kind: "file", key: "f", fileId: "id-1", fileName: "a.bin", enabled: true }, { kind: "text", key: "off", value: "", enabled: false }] }, "POST", upper)
    ).toEqual({ mode: "multipart", parts: [{ name: "V", value: "t" }, { name: "f", fileName: "a.bin" }] });
    expect(exportBody({ mode: "binary", binary: { fileId: "id-2", fileName: "b.png" } }, "PUT", upper)).toEqual({ mode: "binary", fileName: "b.png" });
    expect(exportBody({ mode: "binary" }, "PUT", upper)).toEqual({ mode: "binary", fileName: "" });
    expect(exportBody({ mode: "none" }, "POST", upper)).toEqual({ mode: "none" });
  });

  it("GET and HEAD send no body, whatever the request holds", () => {
    for (const method of ["GET", "HEAD"]) expect(exportBody({ mode: "raw", raw: { language: "text", text: "kept" } }, method, upper)).toEqual({ mode: "none" });
  });
});

describe("redactExport (D5)", () => {
  const sent = {
    ...request({
      method: "POST",
      url: "https://api.test/items?key=typed-api-key&v=vault-plaintext",
      headers: [["Authorization", "Bearer typed-bearer"], ["X-Vault", "vault-plaintext"], ["Accept", "*/*"]],
      body: { mode: "raw", text: '{"token":"vault-plaintext"}' },
    }),
    secrets: ["vault-plaintext"],
    credentials: ["typed-api-key"],
  };

  it("masks vault secrets and credentials by default", () => {
    expect(redactExport(sent)).toEqual({
      method: "POST",
      url: "https://api.test/items?key=***&v=***",
      headers: [["Authorization", "***"], ["X-Vault", "***"], ["Accept", "*/*"]],
      body: { mode: "raw", text: '{"token":"***"}' },
    });
    expect(buildCurl(redactExport(sent))).not.toMatch(/typed|vault-plaintext/);
  });

  it("keeps credentials when the export asks for them, and still masks vault secrets", () => {
    expect(redactExport(sent, { credentials: true })).toEqual({
      method: "POST",
      url: "https://api.test/items?key=typed-api-key&v=***",
      headers: [["Authorization", "Bearer typed-bearer"], ["X-Vault", "***"], ["Accept", "*/*"]],
      body: { mode: "raw", text: '{"token":"***"}' },
    });
  });

  it("masks a secret in a form field, in a multipart part's name and value, and in a file's name", () => {
    const secrets = { secrets: ["vault-plaintext"], credentials: [] };
    expect(redactExport({ ...request({ body: { mode: "urlencoded", fields: [["vault-plaintext", "a vault-plaintext b"]] } }), ...secrets }).body).toEqual({ mode: "urlencoded", fields: [["***", "a *** b"]] });
    expect(
      redactExport({ ...request({ body: { mode: "multipart", parts: [{ name: "vault-plaintext", value: "vault-plaintext" }, { name: "f", fileName: "vault-plaintext.txt" }] } }), ...secrets }).body
    ).toEqual({ mode: "multipart", parts: [{ name: "***", value: "***" }, { name: "f", fileName: "***.txt" }] });
    expect(redactExport({ ...request({ body: { mode: "binary", fileName: "vault-plaintext.bin" } }), ...secrets }).body).toEqual({ mode: "binary", fileName: "***.bin" });
  });
});

// From the security review of P4.6 (a): what a name or an address could make the tool do.
describe("buildCurl: nothing the request holds is read as an option or as a file", () => {
  it("a form part whose name would end at an = of its own is not written: curl would read the rest by its own rules", () => {
    const steal = request({ method: "POST", body: { mode: "multipart", parts: [{ name: "x=@/etc/passwd;", fileName: "real.txt" }] } });

    expect(buildCurl(steal)).toBe('# curl cannot say this request: the name of the form part "x=@/etc/passwd;" holds "=", ";", a quote or a line break, which curl reads as the end of the name.');
    for (const name of ["a=b", "a;type=text/plain", 'a"b', "a\nb"]) {
      expect(buildCurl(request({ method: "POST", body: { mode: "multipart", parts: [{ name, value: "text" }] } })), name).toMatch(/^# curl cannot say this request/);
    }
  });

  it("an address that starts with - is given to --url, not left where curl reads options", () => {
    expect(buildCurl(request({ url: "-o/tmp/owned" }))).toBe("curl \\\n  --url '-o/tmp/owned'");
  });
});
