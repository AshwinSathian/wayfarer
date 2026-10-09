import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { seedAndOpen, send } from "./support/app";
import { ECHO } from "./support/echo";

// P2.12: each body mode, as the echo-server received it. Every test also
// holds the page to its CSP and Trusted Types policy (plan risk R15).

interface Echo {
  method: string;
  headers: [string, string][];
  body: string | null;
  bodyBase64: string | null;
  bodySize: number;
}

const header = (echo: Echo, name: string) => echo.headers.find(([key]) => key === name)?.[1];
const bytesOf = (echo: Echo) => (echo.body === null ? Buffer.from(echo.bodyBase64 ?? "", "base64") : Buffer.from(echo.body, "utf8"));

async function watchViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = ((window as unknown as { __violations: string[] }).__violations = []);
    document.addEventListener("securitypolicyviolation", (e) => seen.push(`${e.effectiveDirective} ${e.blockedURI}`));
  });
}

const violations = (page: Page) => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);

async function sendAndEcho(page: Page): Promise<Echo> {
  const response = page.waitForResponse((r) => r.url().startsWith(`${ECHO}/echo`) && r.request().method() !== "OPTIONS");
  await send(page);
  return (await (await response).json()) as Echo;
}

/** A new POST to the echo-server, with the Body tab open on `mode`. */
async function postWithBody(page: Page, mode: string): Promise<void> {
  await watchViolations(page);
  await page.goto("/");
  await page.getByRole("textbox", { name: "HTTP method" }).fill("POST");
  await page.locator("input.address-url").fill(`${ECHO}/echo`);
  await page.getByRole("tab", { name: "Body", exact: true }).first().click();
  await choose(page, "Body", mode);
}

async function choose(page: Page, select: string, option: string): Promise<void> {
  await page.getByRole("combobox", { name: select, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** The parts of a multipart body: name, file name and bytes of each. */
function parseMultipart(body: Buffer, contentType: string): { name: string; fileName?: string; data: Buffer }[] {
  const boundary = Buffer.from(`--${/boundary=(.+)$/.exec(contentType)?.[1] ?? ""}`);
  const parts: { name: string; fileName?: string; data: Buffer }[] = [];
  let at = body.indexOf(boundary);
  for (;;) {
    const next = body.indexOf(boundary, at + boundary.length);
    if (next === -1) return parts;
    // Between two boundaries: CRLF, the part's headers, a blank line, the data, CRLF.
    const part = body.subarray(at + boundary.length + 2, next - 2);
    const split = part.indexOf("\r\n\r\n");
    const headers = part.subarray(0, split).toString("utf8");
    parts.push({
      name: /name="([^"]*)"/.exec(headers)?.[1] ?? "",
      fileName: /filename="([^"]*)"/.exec(headers)?.[1],
      data: part.subarray(split + 4),
    });
    at = next;
  }
}

test("raw: the text is sent as written, typed by its language; a root-level JSON array is sent", async ({ page }) => {
  await watchViolations(page);
  const text = '[1, {"a": "é"},\n  null]';
  await seedAndOpen(page, {}, {
    method: "POST",
    url: `${ECHO}/echo`,
    storedBody: { mode: "raw", raw: { language: "json", text } },
  });

  const json = await sendAndEcho(page);
  expect(json.body).toBe(text);
  expect(header(json, "content-type")).toBe("application/json");

  for (const [language, type] of [
    ["Text", "text/plain"],
    ["XML", "application/xml"],
    ["HTML", "text/html"],
    ["JavaScript", "application/javascript"],
  ]) {
    await choose(page, "Raw body language", language);
    const echo = await sendAndEcho(page);
    expect(echo.body, language).toBe(text);
    expect(header(echo, "content-type"), language).toBe(type);
  }
  expect(await violations(page)).toEqual([]);
});

test("none: a POST is sent with no body and no Content-Type, and the text typed earlier is kept", async ({ page }) => {
  await watchViolations(page);
  await seedAndOpen(page, {}, {
    method: "POST",
    url: `${ECHO}/echo`,
    storedBody: { mode: "raw", raw: { language: "text", text: "kept" } },
  });
  await choose(page, "Body", "None");

  const none = await sendAndEcho(page);
  expect(none.bodySize).toBe(0);
  expect(header(none, "content-type")).toBeUndefined();

  await choose(page, "Body", "Raw");
  expect((await sendAndEcho(page)).body).toBe("kept");
  expect(await violations(page)).toEqual([]);
});

test("form: fields are URL-encoded in order, a switched-off row is left out", async ({ page }) => {
  await postWithBody(page, "Form (URL-encoded)");
  await page.getByLabel("Body name, row 1").fill("q");
  await page.getByLabel("Body value, row 1").fill("a b&c=é");
  await page.getByRole("button", { name: "Add Field" }).click();
  await page.getByLabel("Body name, row 2").fill("off");
  await page.getByLabel("Body value, row 2").fill("1");
  await page.getByRole("checkbox", { name: "Send body row 2" }).uncheck();
  await page.getByRole("button", { name: "Add Field" }).click();
  await page.getByLabel("Body name, row 3").fill("q");
  await page.getByLabel("Body value, row 3").fill("again");

  const echo = await sendAndEcho(page);

  expect(echo.body).toBe("q=a+b%26c%3D%C3%A9&q=again");
  expect(header(echo, "content-type")).toBe("application/x-www-form-urlencoded");
  expect(await violations(page)).toEqual([]);
});

test("multipart: a text part and a 1 MB file arrive byte for byte, also after the request is saved and the page reloaded", async ({ page }) => {
  const file = randomBytes(1 << 20);
  await postWithBody(page, "Multipart");
  await page.getByLabel("Part name, row 1").fill("note");
  await page.getByLabel("Part value, row 1").fill("héllo");
  await page.getByRole("button", { name: "Add part" }).click();
  await page.getByLabel("Part name, row 2").fill("upload");
  await choose(page, "Part type, row 2", "File");
  await page.getByLabel("File for part 2").setInputFiles({ name: "one-megabyte.bin", mimeType: "application/octet-stream", buffer: file });
  await expect(page.getByText("one-megabyte.bin")).toBeVisible();

  const check = (echo: Echo) => {
    const type = header(echo, "content-type") ?? "";
    expect(type).toMatch(/^multipart\/form-data; boundary=/);
    const parts = parseMultipart(bytesOf(echo), type);
    expect(parts.map((part) => [part.name, part.fileName])).toEqual([["note", undefined], ["upload", "one-megabyte.bin"]]);
    expect(parts[0].data.toString("utf8")).toBe("héllo");
    expect(parts[1].data.equals(file)).toBe(true);
  };
  check(await sendAndEcho(page));

  // Saved, the file is in IndexedDB with the request.
  await page.getByRole("button", { name: "New collection" }).click();
  await page.locator("#creation-name-input").fill("Uploads");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "Save to Collection" }).click();
  await page.getByPlaceholder("Request name").fill("Upload one megabyte");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("treeitem", { name: /Upload one megabyte/ })).toBeVisible();

  await page.reload();
  await page.getByRole("treeitem", { name: /Upload one megabyte/ }).dblclick();
  await expect(page.locator("input.address-url")).toHaveValue(`${ECHO}/echo`);
  check(await sendAndEcho(page));
  expect(await violations(page)).toEqual([]);
});

test("multipart: a Content-Type header is flagged, because it would replace the boundary", async ({ page }) => {
  await postWithBody(page, "Multipart");
  const warning = page.getByText(/replaces the one the browser writes for a multipart body/);
  await expect(warning).toHaveCount(0);

  await page.getByRole("tab", { name: "Headers", exact: true }).first().click();
  await page.getByLabel("Headers name, row 1").fill("content-type");
  await page.getByLabel("Headers value, row 1").fill("multipart/form-data");
  await page.getByRole("tab", { name: "Body", exact: true }).first().click();
  await expect(warning).toBeVisible();

  await page.getByRole("tab", { name: "Headers", exact: true }).first().click();
  await page.getByRole("checkbox", { name: "Send headers row 1" }).uncheck();
  await page.getByRole("tab", { name: "Body", exact: true }).first().click();
  await expect(warning).toHaveCount(0);
});

test("binary: the file is the body, byte for byte, with the file's type", async ({ page }) => {
  const file = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(4096)]);
  await postWithBody(page, "Binary file");

  // No file yet: nothing is sent, and the page says why.
  await send(page);
  await expect(page.getByText("Choose a file for the body, or set the body to None.")).toBeVisible();

  await page.getByLabel("File to send as the body").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: file });
  await expect(page.getByText("pixel.png")).toBeVisible();
  const echo = await sendAndEcho(page);

  expect(bytesOf(echo).equals(file)).toBe(true);
  expect(echo.bodySize).toBe(file.length);
  expect(header(echo, "content-type")).toBe("image/png");
  expect(await violations(page)).toEqual([]);
});
