import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CURL_FIXTURES } from "../../test/fixtures/curl/commands";
import { buildCurl } from "../export/curl";
import type { ExportBody, ExportRequest } from "../export/request";
import { curlRequest, parseCurl } from "./curl";
import { isCurlCommand } from "./curl-command";
import { ImportError } from "./import-error";

const parsed = (command: string) => parseCurl(command).request;

describe("parseCurl: the thirty commands written in each browser's form", () => {
  it("there are thirty, from Chrome's two shells, Firefox and Safari, and none claims to be captured", () => {
    expect(CURL_FIXTURES).toHaveLength(30);
    expect([...new Set(CURL_FIXTURES.map((fixture) => fixture.from))].sort()).toEqual(["Chrome (bash)", "Chrome (cmd)", "Firefox", "Safari"]);
    expect(CURL_FIXTURES.filter((fixture) => fixture.captured)).toEqual([]);
  });

  for (const fixture of CURL_FIXTURES) {
    it(`${fixture.from}: ${fixture.name}`, () => {
      const result = parseCurl(fixture.command);

      expect(result.request).toEqual({ method: fixture.method, url: fixture.url, headers: fixture.headers, body: fixture.body });
      expect(result.warnings, result.warnings.join(" | ")).toHaveLength(fixture.warnings ?? 0);
    });
  }
});

describe("parseCurl: options", () => {
  it("-X, -H and the data options, long and short, apart and together", () => {
    expect(parsed("curl -X PUT https://a.test/ -H 'A: 1' -d x=1")).toEqual({ method: "PUT", url: "https://a.test/", headers: [["A", "1"]], body: { mode: "urlencoded", fields: [["x", "1"]] } });
    expect(parsed("curl -XPUT -H'A: 1' -dx=1 https://a.test/")).toEqual(parsed("curl --request PUT --header 'A: 1' --data x=1 https://a.test/"));
    expect(parsed("curl -sSL -XDELETE https://a.test/").method).toBe("DELETE");
    // A method is stored in upper case.
    expect(parsed("curl -X patch https://a.test/").method).toBe("PATCH");
  });

  it("data without -X is a POST; several -d are joined with &; without a type of its own it is a form, as curl sends it", () => {
    expect(parsed("curl https://a.test/ -d a=1 -d 'b=two words' --data-raw c=%263")).toEqual({
      method: "POST",
      url: "https://a.test/",
      headers: [],
      body: { mode: "urlencoded", fields: [["a", "1"], ["b", "two words"], ["c", "&3"]] },
    });
    expect(parsed(`curl https://a.test/ -H 'Content-Type: application/json' -d '{"a":1}'`).body).toEqual({ mode: "raw", text: '{"a":1}' });
  });

  it("--data-urlencode encodes the content and not the name, in each of its forms", () => {
    expect(parsed("curl https://a.test/ --data-urlencode 'q=a b&c' --data-urlencode '=x y' --data-urlencode 'plain text' --data-urlencode 'na%20me=v'").body).toEqual({
      mode: "urlencoded",
      fields: [["q", "a b&c"], ["x y", ""], ["plain text", ""], ["na me", "v"]],
    });
  });

  it("a body or a part that comes from a file is named, never read", () => {
    expect(parsed("curl -X PUT https://a.test/ -H 'Content-Type: image/png' --data-binary @pixel.png").body).toEqual({ mode: "binary", fileName: "pixel.png" });
    // --data-raw takes "@" as text.
    expect(parsed("curl https://a.test/ -H 'Content-Type: text/plain' --data-raw @/etc/passwd").body).toEqual({ mode: "raw", text: "@/etc/passwd" });
    const mixed = parseCurl("curl https://a.test/ -d a=1 -d @more.txt");
    expect(mixed.request.body).toEqual({ mode: "urlencoded", fields: [["a", "1"]] });
    expect(mixed.warnings).toEqual(["The data of the file more.txt was left out: the file was not read."]);
  });

  it("-F and --form-string: text, a file, a file with a type, and text that only looks like a file", () => {
    const result = parseCurl(`curl https://a.test/ -F note=hello -F 'typed=text;type=text/plain' -F 'upload=@"one megabyte.bin"' -F 'doc=@report.pdf;type=application/pdf' --form-string 'trap=@/etc/passwd' -F 'fromfile=<notes.txt'`);

    expect(result.request).toMatchObject({ method: "POST", body: { mode: "multipart" } });
    expect(result.request.body).toEqual({
      mode: "multipart",
      parts: [
        { name: "note", value: "hello" },
        { name: "typed", value: "text" },
        { name: "upload", fileName: "one megabyte.bin" },
        { name: "doc", fileName: "report.pdf" },
        { name: "trap", value: "@/etc/passwd" },
        { name: "fromfile", value: "" },
      ],
    });
    expect(result.warnings).toEqual(["The form part fromfile takes its text from the file notes.txt, which was not read: the part is empty."]);
  });

  it("-u is Basic auth, -b a Cookie header, -A and -e their headers", () => {
    const result = parseCurl("curl -u 'ada:p:ss' -b 'a=1; b=2' -A 'agent/1' -e https://ref.test/ https://a.test/");

    expect(result.basic).toEqual({ username: "ada", password: "p:ss" });
    expect(result.request.headers).toEqual([["Cookie", "a=1; b=2"], ["User-Agent", "agent/1"], ["Referer", "https://ref.test/"]]);
    expect(parseCurl("curl -u ada https://a.test/").basic).toEqual({ username: "ada", password: "" });
    // -b with a file name reads cookies from it: left out.
    expect(parseCurl("curl -b cookies.txt https://a.test/").warnings).toEqual(["The cookies of the file cookies.txt were left out: the file was not read."]);
  });

  it("-G puts the data in the query; -I and --head are HEAD; --url names the address", () => {
    expect(parsed("curl -G https://a.test/search -d q=1 --data-urlencode 'w=two words'")).toEqual({ method: "GET", url: "https://a.test/search?q=1&w=two+words", headers: [], body: { mode: "none" } });
    expect(parsed("curl --get 'https://a.test/search?a=1' -d q=1").url).toBe("https://a.test/search?a=1&q=1");
    expect(parsed("curl -I https://a.test/").method).toBe("HEAD");
    expect(parsed("curl --head --url https://a.test/")).toEqual({ method: "HEAD", url: "https://a.test/", headers: [], body: { mode: "none" } });
    expect(parsed("curl --url '-o/tmp/x'").url).toBe("-o/tmp/x");
  });

  it("--compressed is left out with a note, -k with a warning, and an option the app has no use for with its value", () => {
    expect(parseCurl("curl --compressed https://a.test/").warnings).toEqual(["--compressed was left out: the browser asks for a compressed answer by itself."]);
    expect(parseCurl("curl -k https://a.test/").warnings).toEqual(["-k (do not check the server's certificate) was left out: a browser always checks it, and the Local Bridge cannot skip the check yet."]);
    const result = parseCurl("curl -o out.json --max-time 5 --frobnicate -s https://a.test/ https://b.test/");
    expect(result.request.url).toBe("https://a.test/");
    expect(result.warnings).toEqual([
      "-o out.json was left out: the app has nothing it applies to.",
      "--max-time 5 was left out: the app has nothing it applies to.",
      "--frobnicate was left out: the app does not know this option.",
      "The command names 2 addresses. The first is used; the others were left out: https://b.test/.",
    ]);
  });

  it("headers: a name with no value, and one without a colon", () => {
    const result = parseCurl("curl https://a.test/ -H 'X-Empty;' -H 'X-Removed:' -H 'nonsense'");
    expect(result.request.headers).toEqual([["X-Empty", ""], ["X-Removed", ""]]);
    expect(result.warnings).toEqual(['A header without ":" was left out: nonsense.']);
  });
});

describe("parseCurl: quoting", () => {
  it("bash: single and double quotes, $'…', a backslash, and words joined without a space", () => {
    expect(parsed(`curl "https://a.test/?q=\\"x\\"&p=\\$HOME" -H 'A: it'\\''s' -H "B: $(not run) \`nor this\`"`)).toEqual({
      method: "GET",
      url: 'https://a.test/?q="x"&p=$HOME',
      headers: [["A", "it's"], ["B", "$(not run) `nor this`"]],
      body: { mode: "none" },
    });
    expect(parsed("curl https://a.test/ -H 'Content-Type: text/plain' --data-raw $'tab\\there\\x41\\101\\u00e9\\U0001F600\\'q\\''").body).toEqual({ mode: "raw", text: "tab\thereAAé😀'q'" });
    expect(parsed("curl https://a.test/pa\\ th").url).toBe("https://a.test/pa th");
  });

  it("line continuations: a backslash in bash, a caret in cmd, with either kind of line break", () => {
    expect(parsed("curl \\\n  https://a.test/ \\\r\n  -H 'A: 1'")).toEqual(parsed("curl https://a.test/ -H 'A: 1'"));
    expect(parsed('curl ^\r\n  "https://a.test/" ^\n  -H "A: 1"')).toEqual(parsed("curl https://a.test/ -H 'A: 1'"));
    expect(parsed("curl.exe ^\r\n  \"https://a.test/\"").url).toBe("https://a.test/");
  });

  it("cmd: a doubled quote is a quote, and a caret before a character is that character", () => {
    expect(parsed('curl "https://a.test/" ^\r\n -H "A: say ""hi"" ^& go"').headers).toEqual([["A", 'say "hi" & go']]);
  });

  it("refuses what is not a command it can read, with ImportError", () => {
    for (const [command, message] of [
      ["wget https://a.test/", "This is not a cURL command: it does not start with curl."],
      ["curl", "The cURL command has no address."],
      ["curl -H 'A: 1'", "The cURL command has no address."],
      ["curl https://a.test/ -H", "The cURL command ends after -H, which needs a value."],
      ["curl https://a.test/ --data", "The cURL command ends after --data, which needs a value."],
      ["curl 'https://a.test/", "The cURL command has a single quote that is not closed."],
      ['curl "https://a.test/', "The cURL command has a double quote that is not closed."],
      ["curl $'https://a.test/", "The cURL command has a quote that is not closed."],
      ['curl ^\r\n "https://a.test/', "The cURL command has a double quote that is not closed."],
      ["curl -X 'GET IT' https://a.test/", "The cURL command's method, GET IT, is not an HTTP method: one word of at most 32 characters."],
    ] as const) {
      expect(() => parseCurl(command), command).toThrow(new ImportError(message));
    }
    expect(isCurlCommand("  curl https://a.test/")).toBe(true);
    expect(isCurlCommand("curly https://a.test/")).toBe(false);
    expect(isCurlCommand('{"curl": 1}')).toBe(false);
  });

  it("ends, and throws nothing but ImportError, whatever follows the word curl", () => {
    fc.assert(
      fc.property(fc.string(), (rest) => {
        try {
          parseCurl(`curl ${rest}`);
        } catch (error) {
          if (!(error instanceof ImportError)) throw error;
        }
      }),
      { numRuns: 500 }
    );
  });
});

describe("the round trip: a request written by buildCurl is read back as that request", () => {
  /** A header name, and text with what a shell and curl treat specially in it. */
  const token = fc.stringMatching(/^[A-Za-z][A-Za-z0-9-]{0,10}$/);
  const text = fc.string({ unit: fc.constantFrom("a", "B", "1", " ", "'", '"', "\\", "$", "`", "&", "=", "@", "<", ";", "%", "+", "é", "\n", "!", "#", "^", "-"), maxLength: 12 });
  /** A header's value as it is sent: no line break, no space at either end. */
  const headerValue = text.map((value) => value.replace(/\n/g, " ").trim());
  /** A name curl can be told: `buildCurl` writes no command for the others. */
  const partName = text.filter((name) => !/[=;"\r\n]/.test(name));
  const method = fc.constantFrom("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "PURGE", "M-SEARCH");
  const url = fc.tuple(fc.constantFrom("https://api.test/", "http://127.0.0.1:8080/a b", "{{base}}/items", "-o/tmp/x"), text).map(([base, query]) => `${base}?q=${query.replace(/\s/g, "")}`);
  const typed = (type: string) => fc.array(fc.tuple(token, headerValue), { maxLength: 3 }).map((headers): [string, string][] => [...headers.filter(([name]) => name.toLowerCase() !== "content-type"), ["Content-Type", type]]);

  /** Requests as the app builds them: a body that is sent has the `Content-Type` its mode implies. */
  const request: fc.Arbitrary<ExportRequest> = fc.oneof(
    fc.record({ method, url, headers: fc.array(fc.tuple(token, headerValue), { maxLength: 4 }), body: fc.constant<ExportBody>({ mode: "none" }) }),
    fc.record({ method, url, headers: typed("application/json"), body: text.filter((value) => value !== "").map((value): ExportBody => ({ mode: "raw", text: value })) }),
    fc.record({
      method,
      url,
      headers: typed("application/x-www-form-urlencoded"),
      body: fc.array(fc.tuple(text, text), { minLength: 1, maxLength: 4 }).map((fields): ExportBody => ({ mode: "urlencoded", fields })),
    }),
    fc.record({
      method,
      url,
      headers: fc.array(fc.tuple(token, headerValue), { maxLength: 2 }).map((headers) => headers.filter(([name]) => name.toLowerCase() !== "content-type")),
      body: fc
        .array(fc.oneof(fc.record({ name: partName, value: text }), fc.record({ name: partName, fileName: text.filter((name) => name !== "" && !/[\n]/.test(name)) })), { minLength: 1, maxLength: 3 })
        .map((parts): ExportBody => ({ mode: "multipart", parts })),
    }),
    fc.record({ method, url, headers: typed("application/octet-stream"), body: text.filter((name) => name !== "" && !name.includes("\n")).map((fileName): ExportBody => ({ mode: "binary", fileName })) })
  );

  /** What `buildCurl` sends for a request: GET and HEAD carry no body. */
  const asSent = (sent: ExportRequest): ExportRequest => (sent.method === "GET" || sent.method === "HEAD" ? { ...sent, body: { mode: "none" } } : sent);

  it("parse(buildCurl(request)) is the request, for generated requests of every body mode", () => {
    fc.assert(
      fc.property(request.map(asSent), (sent) => {
        const result = parseCurl(buildCurl(sent));
        expect(result.request).toEqual(sent);
        expect(result.warnings).toEqual([]);
      }),
      { numRuns: 1000 }
    );
  });
});

describe("curlRequest: a parsed command as a request of the app", () => {
  it("a JSON body is raw JSON, and the Content-Type the app would send anyway has no row", () => {
    const { content, warnings } = curlRequest(parseCurl(`curl https://a.test/items -H 'Accept: */*' -H 'content-type: application/json' --data-raw '{"a":1}'`));

    expect(content).toMatchObject({ method: "POST", url: "https://a.test/items", headers: [{ key: "Accept", value: "*/*", enabled: true }], body: { mode: "raw", raw: { language: "json", text: '{"a":1}' } }, auth: { type: "none" } });
    expect(warnings).toEqual([]);
  });

  it("a type the app would not send by itself keeps its row", () => {
    const { content } = curlRequest(parseCurl(`curl https://a.test/ -H 'Content-Type: application/vnd.api+json' -d '{}'`));
    expect(content.headers).toEqual([{ key: "Content-Type", value: "application/vnd.api+json", enabled: true }]);
    expect(content.body).toEqual({ mode: "raw", raw: { language: "json", text: "{}" } });
    expect(curlRequest(parseCurl(`curl https://a.test/ -H 'Content-Type: application/xml; charset=utf-8' -d '<a/>'`)).content.body).toMatchObject({ raw: { language: "xml" } });
    expect(curlRequest(parseCurl(`curl https://a.test/ -H 'Content-Type: text/csv' -d 'a,b'`)).content.body).toMatchObject({ raw: { language: "text" } });
  });

  it("a form is rows, -u is the Auth tab's Basic, and a cookie is a header row", () => {
    const { content } = curlRequest(parseCurl("curl https://a.test/login -u ada:secret -b 'sid=1' -d user=ada -d 'note=two words'"));

    expect(content.auth).toEqual({ type: "basic", username: "ada", password: "secret" });
    expect(content.headers).toEqual([{ key: "Cookie", value: "sid=1", enabled: true }]);
    expect(content.body).toEqual({ mode: "urlencoded", urlencoded: [{ key: "user", value: "ada", enabled: true }, { key: "note", value: "two words", enabled: true }] });
  });

  it("a file is named for the user to choose again: the command does not hold it", () => {
    const form = curlRequest(parseCurl("curl https://a.test/ -F note=hi -F 'upload=@report.pdf'"));
    expect(form.content.body).toEqual({
      mode: "multipart",
      multipart: [{ kind: "text", key: "note", value: "hi", enabled: true }, { kind: "file", key: "upload", fileId: "", fileName: "report.pdf", enabled: true }],
    });
    expect(form.warnings).toEqual(["The form part upload sends the file report.pdf. Choose the file again in the Body tab: a command names a file, it does not hold it."]);

    const file = curlRequest(parseCurl("curl -X PUT https://a.test/ -H 'Content-Type: image/png' --data-binary @pixel.png"));
    expect(file.content.body).toEqual({ mode: "binary", binary: { fileId: "", fileName: "pixel.png", contentType: "image/png" } });
    expect(file.content.headers).toEqual([{ key: "Content-Type", value: "image/png", enabled: true }]);
    expect(file.warnings).toEqual(["The body is the file pixel.png. Choose the file again in the Body tab: a command names a file, it does not hold it."]);
  });
});
