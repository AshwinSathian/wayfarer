import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CODE_TARGETS, generateCode, type CodeTarget } from "../../src/export/codegen";
import { buildCurl } from "../../src/export/curl";
// @ts-expect-error -- a JavaScript module of the e2e support, without types.
import { startEchoServer } from "../../../../e2e/support/echo-server.mjs";
import { FILES, exportFixtures } from "./fixtures";

const run = promisify(execFile);

interface Echo {
  method: string;
  url: string;
  headers: [string, string][];
  body: string | null;
  bodyBase64: string | null;
}

/** What the request set, as it arrived: its method, its address, the headers it named, and its body. A multipart body is compared part by part, since each sender writes a boundary of its own. */
function arrived(echo: Echo, named: string[]) {
  const type = echo.headers.find(([name]) => name === "content-type")?.[1] ?? "";
  const boundary = /boundary=(.+)$/.exec(type)?.[1];
  const body = echo.body ?? `base64:${echo.bodyBase64 ?? ""}`;
  return {
    method: echo.method,
    url: echo.url,
    headers: named.filter((name) => name !== "content-type" || !boundary).map((name) => [name, echo.headers.find(([key]) => key === name)?.[1]]),
    body: boundary
      ? Buffer.from(echo.bodyBase64 ?? Buffer.from(echo.body ?? "").toString("base64"), "base64")
          .toString("latin1")
          .split(`--${boundary}`)
          .slice(1, -1)
          .map((part) => part.replace(/\r\nContent-Type: [^\r]+/i, ""))
      : // A form: the fields, since one sender writes a space as "+" and another as "%20".
        type.startsWith("application/x-www-form-urlencoded")
        ? [...new URLSearchParams(body)]
        : body,
  };
}

describe("generated code (P4.6 a)", () => {
  let server: { address(): { port: number }; close(): void };
  let base: string;
  let dir: string;
  beforeAll(async () => {
    server = (await startEchoServer(0)) as typeof server;
    base = `http://127.0.0.1:${server.address().port}`;
    dir = await mkdtemp(join(tmpdir(), "wayfarer-codegen-"));
    for (const [name, bytes] of Object.entries(FILES)) await writeFile(join(dir, name), bytes);
  });
  afterAll(async () => {
    server.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("is held to its snapshots, for every target and every body mode", () => {
    for (const target of Object.keys(CODE_TARGETS) as CodeTarget[]) {
      for (const { name, request } of exportFixtures("http://api.test")) {
        expect(generateCode(target, request), `${target}: ${name}`).toMatchSnapshot(`${target}: ${name}`);
      }
    }
    for (const { name, request } of exportFixtures("http://api.test")) expect(buildCurl(request), name).toMatchSnapshot(`curl: ${name}`);
  });

  it("the fetch code, run by Node, and the cURL command, run by bash, send the same request as each other, for all twelve", async () => {
    for (const { name, request } of exportFixtures(base)) {
      const file = join(dir, "request.mjs");
      // The code prints the status and the body: the echo server's account of what arrived.
      await writeFile(file, generateCode("fetch", request));
      const fetched = await run(process.execPath, [file], { cwd: dir });
      const curled = await run("bash", ["-c", `${buildCurl(request)} --silent --show-error`], { cwd: dir });
      // HEAD has no body to read the account from: that it was sent, and answered 200, is what there is.
      if (request.method === "HEAD") {
        expect(fetched.stdout.trim(), name).toBe("200");
        expect(curled.stdout, name).toMatch(/^HTTP\/1\.1 200/);
        continue;
      }
      const named = request.headers.map(([header]) => header.toLowerCase());
      const byFetch = arrived(JSON.parse(fetched.stdout.replace(/^200 /, "")) as Echo, named);
      const byCurl = arrived(JSON.parse(curled.stdout) as Echo, named);
      expect(byCurl, name).toEqual(byFetch);
      expect(byFetch.method, name).toBe(request.method);
      expect(`${base}${byFetch.url}`, name).toBe(request.url);
      if (request.body.mode === "raw") expect(byFetch.body, name).toBe(request.body.text);
      if (request.body.mode === "urlencoded") expect(byFetch.body, name).toEqual(request.body.fields);
    }
    // Nothing a value held was run by the shell.
    await expect(run("ls", [dir])).resolves.toMatchObject({ stdout: expect.not.stringContaining("pwned") as string });
  }, 60_000);

  it("HTTPie: a value it would read as a file is not written as a command", () => {
    const request = exportFixtures("http://api.test").find((fixture) => fixture.name === "POST multipart text")!.request;
    const trap = { ...request, body: { mode: "multipart" as const, parts: [{ name: "trap", value: "@/etc/passwd" }] } };

    expect(generateCode("httpie", trap)).toBe('# HTTPie cannot say this request: the value of the form part "trap" starts with "@" or "=", which HTTPie reads as a file or as another kind of item. Copy it as cURL instead.');
    expect(generateCode("httpie", { ...request, headers: [["X-At", "@secret-file"]] })).toMatch(/^# HTTPie cannot say this request: the value of the header "X-At"/);
    expect(generateCode("httpie", { ...request, headers: [["X-Empty", ""], ["We:ird", "v"]], body: { mode: "none" } })).toBe("http \\\n  --ignore-stdin \\\n  'POST' \\\n  'http://api.test/echo' \\\n  'X-Empty;' \\\n  'We\\:ird:v'");
    // A method, an address or a name that starts with "-" would be an option of HTTPie's.
    const plain = { ...request, body: { mode: "none" as const } };
    expect(generateCode("httpie", { ...plain, method: "--DOWNLOAD" })).toMatch(/^# HTTPie cannot say this request: the method does not start with a letter/);
    expect(generateCode("httpie", { ...plain, url: "--output=/tmp/owned" })).toMatch(/^# HTTPie cannot say this request: the address starts with "-"/);
    expect(generateCode("httpie", { ...plain, headers: [["--offline", "1"]] })).toMatch(/^# HTTPie cannot say this request: the name "--offline" starts with "-"/);
    expect(generateCode("httpie", { ...request, body: { mode: "multipart", parts: [{ name: "-o", value: "x" }] } })).toMatch(/^# HTTPie cannot say this request: the name "-o" starts with "-"/);
    // The refusal is one comment line whatever the name holds: pasted into a shell, it runs nothing.
    for (const target of ["httpie"] as const) {
      const refusal = generateCode(target, { ...request, body: { mode: "multipart", parts: [{ name: "-x\nrm -rf ~", value: "v" }] } });
      expect(refusal.split("\n")).toHaveLength(1);
      expect(refusal.startsWith("# ")).toBe(true);
    }
    const curlRefusal = buildCurl({ ...request, body: { mode: "multipart", parts: [{ name: "a=\nrm -rf ~", value: "v" }] } });
    expect(curlRefusal.split("\n")).toHaveLength(1);
    expect(curlRefusal.startsWith("# ")).toBe(true);
  });
});
