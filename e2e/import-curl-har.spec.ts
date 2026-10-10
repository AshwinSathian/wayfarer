import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { dumpIdb, send } from "./support/app";
import { ECHO } from "./support/echo";

// P4.5: a cURL command becomes a request, pasted into the address field or
// into the import dialog; a HAR 1.2 file imports. Run with CI=1.

interface Echo {
  method: string;
  url: string;
  headers: [string, string][];
  body: string | null;
}

const stored = async (page: Page) => JSON.stringify(await dumpIdb(page));

/**
 * Pastes text into the address field with the keyboard, from the real
 * clipboard: the text is cut out of a scratch box first. (A paste event made
 * by script carries no readable text in Firefox, so it would test nothing there.)
 */
async function pasteIntoAddress(page: Page, text: string): Promise<void> {
  await page.evaluate((value) => {
    const scratch = document.createElement("textarea");
    scratch.id = "paste-scratch";
    scratch.value = value;
    document.body.append(scratch);
    scratch.focus();
    scratch.select();
  }, text);
  await page.keyboard.press("ControlOrMeta+X");
  await expect(page.locator("#paste-scratch")).toHaveValue("");
  await page.evaluate(() => document.getElementById("paste-scratch")?.remove());
  await page.locator("input.address-url").focus();
  await page.keyboard.press("ControlOrMeta+V");
}

test("@claim:C-056 a cURL command pasted into the address field fills the composer, stores nothing, and is sent as the command says", async ({ page }) => {
  const violations: string[] = [];
  await page.exposeFunction("__violation", (text: string) => violations.push(text));
  await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => void (window as unknown as { __violation: (text: string) => void }).__violation(`${e.effectiveDirective} ${e.blockedURI}`)));
  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();
  const before = await stored(page);

  // In the form Chrome writes for bash, with an option the app does not have.
  await pasteIntoAddress(page, `curl '${ECHO}/echo?page=2' \\\n  -X 'PUT' \\\n  -H 'accept: application/json' \\\n  -H 'content-type: application/json' \\\n  -H 'x-trace: pasted' \\\n  --data-raw $'{"name":"it\\'s Ada"}' \\\n  --insecure`);

  await expect(page.locator("input.address-url")).toHaveValue(`${ECHO}/echo?page=2`);
  await expect(page.getByRole("textbox", { name: "HTTP method" })).toHaveValue("PUT");
  await expect(page.locator(".paste-notes")).toContainText("-k (do not check the server's certificate) was left out");
  // The composer holds it; no store does.
  expect(await stored(page)).toBe(before);

  const response = page.waitForResponse((r) => r.url().startsWith(`${ECHO}/echo`) && r.request().method() !== "OPTIONS");
  await send(page);
  const echo = (await (await response).json()) as Echo;
  const header = (name: string) => echo.headers.find(([key]) => key === name)?.[1];
  expect(echo.method).toBe("PUT");
  expect(echo.url).toBe("/echo?page=2");
  expect([header("accept"), header("content-type"), header("x-trace")]).toEqual(["application/json", "application/json", "pasted"]);
  expect(echo.body).toBe(`{"name":"it's Ada"}`);
  await expect(page.locator(".paste-notes")).toHaveCount(0);

  // Text that is no command is pasted as text.
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await pasteIntoAddress(page, "https://example.test/not-a-command");
  await expect(page.getByRole("textbox", { name: "HTTP method" })).toHaveValue("GET");
  expect(violations).toEqual([]);
});

test("@claim:C-056 a cURL command pasted into the import dialog goes down the import road: a report first, then a collection with the request", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();
  const before = await stored(page);

  await page.getByRole("button", { name: "Import a cURL command", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^Import/ });
  // In the form Chrome writes for cmd.
  await dialog.getByLabel("A cURL command").fill(`curl "https://api.example.test/users?page=2^&per_page=50" ^\r\n  -H "accept: application/json" ^\r\n  -b "session=abc123" ^\r\n  --data-raw "^{^\\^"name^\\^":^\\^"Ada^\\^"^}" ^\r\n  -H "content-type: application/json"`);
  await dialog.getByRole("button", { name: "Read the command" }).click();

  await expect(dialog.locator(".import-report")).toContainText("cURL command");
  await expect(dialog.locator(".import-report")).toContainText("will add 1 collection and 1 request.");
  expect(await stored(page)).toBe(before);
  await dialog.getByRole("button", { name: "Confirm import" }).click();
  await expect(dialog).toHaveCount(0);

  const stores = await dumpIdb(page);
  expect(stores["collections"]).toMatchObject([{ name: "Imported from cURL", scriptTrust: { trusted: false } }]);
  expect(stores["requests"]).toMatchObject([
    {
      name: "POST api.example.test/users",
      method: "POST",
      url: "https://api.example.test/users?page=2&per_page=50",
      headers: [{ key: "accept", value: "application/json" }, { key: "Cookie", value: "session=abc123" }],
      body: { mode: "raw", raw: { language: "json", text: '{"name":"Ada"}' } },
    },
  ]);
  await expect(page.getByRole("treeitem", { name: /POST api\.example\.test\/users/ })).toBeVisible();

  // A command that cannot be read is refused in the dialog, and nothing more is stored.
  await page.getByRole("button", { name: "Import a cURL command", exact: true }).click();
  await dialog.getByLabel("A cURL command").fill("curl -H 'A: 1'");
  await dialog.getByRole("button", { name: "Read the command" }).click();
  await expect(dialog.getByRole("alert")).toContainText("The cURL command has no address.");
  await dialog.getByRole("button", { name: "Cancel import" }).click();
  expect((await dumpIdb(page))["requests"]).toHaveLength(1);
});

test("@claim:C-056 a HAR 1.2 file with three entries imports as three requests", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();

  const har = await readFile("packages/core/test/fixtures/har/three-entries.har.json");
  await page.locator('app-collections-sidebar input[type="file"]').setInputFiles({ name: "session.har", mimeType: "application/json", buffer: har });
  const dialog = page.getByRole("dialog", { name: "Import collection" });
  await expect(dialog.locator(".import-report")).toContainText("HAR 1.2");
  await expect(dialog.locator(".import-report")).toContainText('"session.har" will add 1 collection and 3 requests.');
  await dialog.getByRole("button", { name: "Confirm import" }).click();
  await expect(dialog).toHaveCount(0);

  const stores = await dumpIdb(page);
  expect(stores["collections"]).toMatchObject([{ name: "Imported from HAR" }]);
  const requests = (stores["requests"] as { name: string; order: number; method: string; url: string; headers: { key: string }[]; body: unknown }[]).sort((a, b) => a.order - b.order);
  expect(requests.map((request) => [request.name, request.method, request.url])).toEqual([
    ["GET /users", "GET", "https://api.example.test/users?page=2"],
    ["POST /users", "POST", "https://api.example.test/users"],
    ["POST /login", "POST", "https://app.example.test/login"],
  ]);
  // HTTP/2's pseudo-headers are gone; the form's fields are rows.
  expect(requests[0].headers.map((row) => row.key)).toEqual(["accept", "cookie"]);
  expect(requests[1].body).toEqual({ mode: "raw", raw: { language: "json", text: '{"name":"Ada"}' } });
  expect(requests[2].body).toMatchObject({ mode: "urlencoded", urlencoded: [{ key: "user", value: "ada@example.test" }, { key: "remember", value: "on" }] });
  for (const name of ["GET /users", "POST /users", "POST /login"]) await expect(page.getByRole("treeitem", { name })).toBeVisible();
});
