import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test, type Page } from "@playwright/test";
import { seedAndOpen, send, type SeededRequest } from "./support/app";
import { ECHO } from "./support/echo";

// P4.6 (a): the cURL command the composer copies, run by bash against the
// echo server, sends what the app itself sends. Twelve requests, every body
// mode. Needs bash and curl on the machine that runs the tests.

const run = promisify(execFile);

interface Echo {
  method: string;
  url: string;
  headers: [string, string][];
  body: string | null;
  bodyBase64: string | null;
}

/**
 * What a request set, as it arrived: its method, its path and query, the
 * headers it named, and its body. A browser and curl each add headers of
 * their own and write their own multipart boundary, so a form is compared
 * part by part (a part's own Content-Type left out: curl guesses it from
 * the file's name), and a URL-encoded form field by field.
 */
function arrived(echo: Echo, named: string[]) {
  const type = echo.headers.find(([name]) => name === "content-type")?.[1] ?? "";
  const boundary = /boundary=(.+)$/.exec(type)?.[1];
  const bytes = echo.bodyBase64 === null ? Buffer.from(echo.body ?? "", "utf8") : Buffer.from(echo.bodyBase64, "base64");
  return {
    method: echo.method,
    url: echo.url,
    headers: named.map((name) => [name, echo.headers.find(([key]) => key === name)?.[1]]),
    body: boundary
      ? bytes
          .toString("latin1")
          .split(`--${boundary}`)
          .slice(1, -1)
          .map((part) => part.replace(/\r\nContent-Type: [^\r]+/i, ""))
      : type.startsWith("application/x-www-form-urlencoded")
        ? [...new URLSearchParams(bytes.toString("utf8"))]
        : bytes.toString("base64"),
  };
}

const HOSTILE = `it's "quoted" \\ $(touch pwned) \`id\`\n</script>`;
const raw = (language: string, text: string) => ({ mode: "raw", raw: { language, text } });
const rows = (fields: [string, string][]) => fields.map(([key, value]) => ({ key, value, enabled: true }));
/** Every byte value: a file no text encoding leaves alone. */
const FILE = Buffer.from(Uint8Array.from({ length: 512 }, (_, index) => index % 256));

interface Fixture {
  name: string;
  request: SeededRequest;
  /** Headers the request sets, by their lower-case names: these must arrive the same from both. */
  named: string[];
  /** What is done in the page before the send: a file is picked there, since a file is not seeded. */
  prepare?: (page: Page) => Promise<void>;
}

const body = (page: Page) => page.getByRole("tab", { name: "Body", exact: true }).first().click();

const FIXTURES: Fixture[] = [
  { name: "GET with a query and headers", request: { method: "GET", url: `${ECHO}/echo?a=1&b=two%20words`, headers: { Accept: "application/json", "X-Trace": "t-1" } }, named: ["accept", "x-trace"] },
  { name: "DELETE without a body", request: { method: "DELETE", url: `${ECHO}/echo?id=3` }, named: [] },
  { name: "GET with a body kept for another method: none is sent", request: { method: "GET", url: `${ECHO}/echo`, storedBody: raw("text", "not sent") }, named: [] },
  { name: "POST JSON with a variable", request: { method: "POST", url: `${ECHO}/echo`, storedBody: raw("json", '{"name":"héllo","who":"{{who}}"}') }, named: ["content-type"] },
  { name: "PUT text that tries to leave its quotes", request: { method: "PUT", url: `${ECHO}/echo`, headers: { "X-Note": "it's" }, storedBody: raw("text", HOSTILE) }, named: ["content-type", "x-note"] },
  { name: "POST text that starts with @", request: { method: "POST", url: `${ECHO}/echo`, storedBody: raw("text", "@/etc/passwd") }, named: ["content-type"] },
  { name: "a method of its own kind, with XML", request: { method: "PURGE", url: `${ECHO}/echo`, storedBody: raw("xml", "<a>1</a>") }, named: ["content-type"] },
  {
    name: "POST form",
    request: { method: "POST", url: `${ECHO}/echo`, storedBody: { mode: "urlencoded", urlencoded: rows([["q", "a b&c=d"], ["na me", "é"], ["at", "@/etc/passwd"], ["who", "{{who}}"], ["empty", ""]]) } },
    named: ["content-type"],
  },
  {
    name: "POST form with a row switched off",
    request: { method: "POST", url: `${ECHO}/echo`, storedBody: { mode: "urlencoded", urlencoded: [...rows([["only", "1"]]), { key: "off", value: "x", enabled: false }] } },
    named: ["content-type"],
  },
  {
    name: "POST multipart text",
    request: {
      method: "POST",
      url: `${ECHO}/echo`,
      headers: { "X-Trace": "t-10" },
      storedBody: { mode: "multipart", multipart: [{ kind: "text", key: "note", value: "héllo {{who}}", enabled: true }, { kind: "text", key: "trap", value: "@/etc/passwd", enabled: true }, { kind: "text", key: "second", value: "two words; type=x", enabled: true }] },
    },
    named: ["x-trace"],
  },
  {
    name: "POST multipart with a file",
    request: { method: "POST", url: `${ECHO}/echo`, storedBody: { mode: "multipart", multipart: [{ kind: "text", key: "note", value: "with a file", enabled: true }, { kind: "text", key: "upload", value: "", enabled: true }] } },
    named: [],
    prepare: async (page) => {
      await body(page);
      await page.getByRole("combobox", { name: "Part type, row 2", exact: true }).click();
      await page.getByRole("option", { name: "File", exact: true }).click();
      await page.getByLabel("File for part 2").setInputFiles({ name: "upload file.bin", mimeType: "application/octet-stream", buffer: FILE });
      await expect(page.getByText("upload file.bin")).toBeVisible();
    },
  },
  {
    name: "PUT a file",
    request: { method: "PUT", url: `${ECHO}/echo`, storedBody: { mode: "binary" } },
    named: ["content-type"],
    prepare: async (page) => {
      await body(page);
      await page.getByLabel("File to send as the body").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: FILE });
      await expect(page.getByText("pixel.png")).toBeVisible();
    },
  },
];

let dir: string;
test.beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "wayfarer-curl-"));
  for (const name of ["upload file.bin", "pixel.png"]) await writeFile(join(dir, name), FILE);
});
test.afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function copiedCurl(page: Page): Promise<string> {
  const before = await page.evaluate(() => (window as unknown as { __clipboard: string[] }).__clipboard.length);
  await page.getByRole("button", { name: "Copy as cURL", exact: true }).click();
  await page.getByRole("menuitem", { name: "Copy as cURL", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __clipboard: string[] }).__clipboard.length)).toBe(before + 1);
  return page.evaluate(() => (window as unknown as { __clipboard: string[] }).__clipboard.at(-1) ?? "");
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const written: string[] = [];
    (window as unknown as { __clipboard: string[] }).__clipboard = written;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => void written.push(text) } });
  });
});

for (const fixture of FIXTURES) {
  test(`@claim:C-020 the copied cURL command, run by bash, sends what the app sends: ${fixture.name}`, async ({ page }) => {
    expect(FIXTURES).toHaveLength(12);
    await seedAndOpen(page, { who: "wörld & co" }, fixture.request);
    await fixture.prepare?.(page);

    const response = page.waitForResponse((r) => r.url().startsWith(`${ECHO}/echo`) && r.request().method() !== "OPTIONS");
    await send(page);
    const byApp = arrived((await (await response).json()) as Echo, fixture.named);

    const command = await copiedCurl(page);
    const { stdout } = await run("bash", ["-c", `${command} --silent --show-error`], { cwd: dir });
    const byCurl = arrived(JSON.parse(stdout) as Echo, fixture.named);

    expect(byCurl).toEqual(byApp);
    expect(byApp.method).toBe(fixture.request.method);
    // Nothing a value held was run by the shell.
    expect((await run("ls", [dir])).stdout).not.toContain("pwned");
  });
}

test("@claim:C-020 HEAD is copied as --head, and curl gets the answer the app got", async ({ page }) => {
  await seedAndOpen(page, {}, { method: "HEAD", url: `${ECHO}/echo?head=1`, headers: { "X-Trace": "t-2" } });
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");

  const command = await copiedCurl(page);
  expect(command.split(" \\\n  ")).toEqual(["curl", "--head", `'${ECHO}/echo?head=1'`, "-H 'X-Trace: t-2'"]);
  // -X HEAD would wait for a body until curl gave up. --head ends with the headers.
  const { stdout } = await run("bash", ["-c", `${command} --silent --show-error --max-time 5`], { cwd: dir });
  expect(stdout).toMatch(/^HTTP\/1\.1 200/);
});

test("the code generators are not in the page the server sends, are fetched when code is first asked for, and copy the request", async ({ page }) => {
  // The generators say this sentence, and exactly one file of the build holds it: one that index.html does not name.
  const dist = "dist/wayfarer/browser";
  const marker = "HTTPie cannot say this request";
  const holders: string[] = [];
  for (const name of (await readdir(dist)).filter((entry) => entry.endsWith(".js"))) {
    if ((await readFile(`${dist}/${name}`, "utf8")).includes(marker)) holders.push(name);
  }
  expect(holders).toHaveLength(1);
  expect(await readFile(`${dist}/index.html`, "utf8")).not.toContain(holders[0]);

  const scripts: string[] = [];
  page.on("request", (sent) => scripts.push(new URL(sent.url()).pathname.slice(1)));
  await seedAndOpen(page, {}, { method: "POST", url: `${ECHO}/echo?code=1`, storedBody: raw("json", '{"a":1}') });
  await copiedCurl(page);
  expect(scripts).not.toContain(holders[0]);

  for (const [item, starts] of [["Copy as JavaScript (fetch)", `const response = await fetch("${ECHO}/echo?code=1", {`], ["Copy as Python (requests)", "import requests"], ["Copy as HTTPie", "http \\\n  --ignore-stdin"]] as const) {
    const before = await page.evaluate(() => (window as unknown as { __clipboard: string[] }).__clipboard.length);
    await page.getByRole("button", { name: "Copy as cURL", exact: true }).click();
    await page.getByRole("menuitem", { name: item, exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __clipboard: string[] }).__clipboard.length)).toBe(before + 1);
    expect(await page.evaluate(() => (window as unknown as { __clipboard: string[] }).__clipboard.at(-1))).toContain(starts);
  }
  expect(scripts.filter((path) => path === holders[0])).toHaveLength(1);
});
