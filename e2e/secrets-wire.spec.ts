import { expect, test, type Page } from "@playwright/test";
import { dumpIdb, seedAndOpen, send } from "./support/app";
import { ECHO } from "./support/echo";

// P2.5 with P2.8 and P2.9 (plan D21): a vault secret reaches the wire, and
// nothing that is stored, exported or copied holds it.

const PASSPHRASE = "correct horse battery staple";
/** Characters that every encoding writes differently. */
const SECRET = 'sek"ret/+ valu&e-9f2b';

interface Echo {
  query: Record<string, string>;
  headers: [string, string][];
  body: string | null;
}

async function recordClipboard(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const written: string[] = [];
    (window as unknown as { __clipboard: string[] }).__clipboard = written;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => void written.push(text) } });
  });
  return () => page.evaluate(() => (window as unknown as { __clipboard: string[] }).__clipboard);
}

async function sendAndEcho(page: Page): Promise<Echo> {
  const response = page.waitForResponse((r) => r.url().startsWith(`${ECHO}/echo`) && r.request().method() !== "OPTIONS");
  await send(page);
  return (await (await response).json()) as Echo;
}

/**
 * Every way `secret` can be read out of `text`: as it is, percent-encoded,
 * as a form field, JSON-escaped, or inside base64 (each run of base64
 * characters is decoded from each of the four positions a reader could
 * start at).
 */
function found(text: string, secret: string): string[] {
  const forms: [string, string][] = [
    ["plain", secret],
    ["percent", encodeURIComponent(secret)],
    ["form", new URLSearchParams({ k: secret }).toString().slice(2)],
    ["json", JSON.stringify(secret).slice(1, -1)],
    // As a browser writes it into a URL it sends: only the characters a URL cannot hold are escaped.
    ["url query", new URL(`http://h/?${secret}`).search.slice(1)],
    ["url path", new URL(`http://h/${secret}`).pathname.slice(1)],
  ];
  const hits = forms.filter(([, form]) => text.includes(form)).map(([name]) => name);
  const needle = Buffer.from(secret, "utf8").toString("latin1");
  for (const run of text.replace(/-/g, "+").replace(/_/g, "/").split(/[^A-Za-z0-9+/]+/)) {
    for (let start = 0; start < 4 && run.length >= 8; start++) {
      // Node reads base64 without its padding, to the end of the run.
      if (Buffer.from(run.slice(start), "base64").toString("latin1").includes(needle)) hits.push("base64");
    }
  }
  return [...new Set(hits)];
}

/** Adds a protected variable to the open environment, making the vault on the way. */
async function protectVariable(page: Page, name: string, plaintext: string): Promise<void> {
  const keys = page.getByPlaceholder("KEY", { exact: true });
  const before = await keys.count();
  await page.getByRole("button", { name: "Add variable" }).click();
  await expect(keys).toHaveCount(before + 1);
  await keys.last().fill(name);
  await page.getByPlaceholder("Value", { exact: true }).last().fill(plaintext);
  await page.getByRole("button", { name: "Mark variable as secret" }).last().click();
  const dialog = page.getByRole("dialog", { name: "Create vault passphrase", exact: true });
  await dialog.locator("input[type='password']").nth(0).fill(PASSPHRASE);
  await dialog.locator("input[type='password']").nth(1).fill(PASSPHRASE);
  await dialog.getByRole("button", { name: "Create vault" }).click();
  await expect(page.getByRole("button", { name: "Lock secrets", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark variable as secret" }).last().click();
  await expect(page.getByText("Secret stored")).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
}

async function downloadText(page: Page, menuItem: string): Promise<string> {
  await page.getByText("Tripwire collection", { exact: true }).click({ button: "right" });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: menuItem, exact: true }).click()]);
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

test("the scanner finds a secret in each encoding it claims to look for", () => {
  expect(found(`x ${SECRET} y`, SECRET)).toEqual(["plain"]);
  expect(found(`k=${encodeURIComponent(SECRET)}`, SECRET)).toEqual(["percent"]);
  expect(found(new URLSearchParams({ k: SECRET }).toString(), SECRET)).toEqual(["form"]);
  expect(found(JSON.stringify({ k: SECRET }), SECRET)).toEqual(["json"]);
  expect(found(new URL(`${ECHO}/echo?token=${SECRET}`).href, SECRET)).toEqual(["url query", "url path"]);
  for (const prefix of ["", "a", "ab", "alice:"]) {
    expect(found(`Basic ${Buffer.from(prefix + SECRET).toString("base64")}`, SECRET), prefix).toEqual(["base64"]);
    expect(found(Buffer.from(prefix + SECRET + "tail").toString("base64url"), SECRET), prefix).toEqual(["base64"]);
  }
  expect(found("nothing to see, aGVsbG8gd29ybGQ=", SECRET)).toEqual([]);
});

test("@claim:C-007 a protected variable reaches the server as its plaintext, and a scan of everything stored, exported and copied finds it nowhere", async ({ page }) => {
  const clipboard = await recordClipboard(page);
  await seedAndOpen(page, {}, {
    method: "POST",
    url: `${ECHO}/echo?token={{API_TOKEN}}`,
    headers: { "X-Api-Key": "{{API_TOKEN}}" },
    auth: { type: "basic", username: "alice", password: "{{API_TOKEN}}" },
    storedBody: { mode: "raw", raw: { language: "text", text: "t={{API_TOKEN}}" } },
    // P3.2: a script reads the response, in which the server sent the secret back, and writes it everywhere a script can write.
    postRequestScript: `
      const echoed = pm.response.json().body;
      console.log("the server sent back: " + pm.response.text());
      console.error(echoed);
      pm.environment.set("LEAKED_BY_SCRIPT", echoed);
      pm.test("a test named " + echoed, () => { throw new Error("it failed with " + echoed); });
      throw new Error("the script ended with " + echoed);
    `,
  });
  await protectVariable(page, "API_TOKEN", SECRET);

  // On the wire: the plaintext, in the URL, a header, Basic credentials and the body.
  const echo = await sendAndEcho(page);
  const header = (name: string) => echo.headers.find(([key]) => key === name)?.[1] ?? "";
  // The URL takes the value as written, as in Postman: "&" and "+" in it mean what they mean in a URL.
  expect(echo.query["token"]).toBe('sek"ret/  valu');
  expect(header("x-api-key")).toBe(SECRET);
  expect(Buffer.from(header("authorization").slice("Basic ".length), "base64").toString("utf8")).toBe(`alice:${SECRET}`);
  expect(echo.body).toBe(`t=${SECRET}`);
  // The server sent all of it back, and the page shows it.
  await expect(page.locator(".status-badge")).toHaveText("200");
  await expect.poll(async () => (await dumpIdb(page))["history"]?.length ?? 0).toBe(1);

  // Every export there is, with and without credentials: a vault secret is in none.
  const exportMenu = page.getByRole("button", { name: "Export response" });
  for (const item of ["Copy as cURL", "Copy as HAR", "Copy as cURL with credentials", "Copy as HAR with credentials"]) {
    await exportMenu.click();
    await page.getByRole("menuitem", { name: item, exact: true }).click();
  }
  for (const item of ["Copy as cURL", "Copy as cURL with credentials"]) {
    await page.getByRole("button", { name: "Copy as cURL", exact: true }).click();
    await page.getByRole("menuitem", { name: item, exact: true }).click();
  }
  await expect.poll(clipboard).toHaveLength(6);
  const copied = await clipboard();
  const files = [await downloadText(page, "Export"), await downloadText(page, "Export with credentials")];

  // What the script wrote, as the page shows it: its console, its test row and its own error.
  await page.locator("app-response-viewer").getByRole("tab", { name: /Tests/ }).click();
  await expect(page.locator(".script-console")).toContainText("the server sent back:");
  await expect(page.locator(".test-result-fail")).toHaveCount(2);
  const scriptOutput = (await page.locator(".script-console, .test-result-fail").allInnerTexts()).join("\n");

  const stores = await dumpIdb(page);
  const web = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
  const searched: Record<string, string> = {
    ...Object.fromEntries(Object.entries(stores).map(([name, records]) => [`IndexedDB ${name}`, JSON.stringify(records)])),
    "localStorage and sessionStorage": web,
    "cURL export": copied[0],
    "HAR export": copied[1],
    "cURL export with credentials": copied[2],
    "HAR export with credentials": copied[3],
    "composer cURL": copied[4],
    "composer cURL with credentials": copied[5],
    "collection export": files[0],
    "collection export with credentials": files[1],
    "what the script wrote on the page": scriptOutput,
  };
  // All eight stores were read, and the exports are the real thing.
  expect(Object.keys(stores).sort()).toEqual(["collections", "environments", "files", "folders", "history", "meta", "requests", "secrets"]);
  expect(copied[1]).toContain('"version": "1.2"');
  expect(copied[0]).toMatch(/^curl /);
  expect(files[0]).toContain('"$id": "wayfarer/collection/2"');
  expect(Object.fromEntries(Object.entries(searched).map(([place, text]) => [place, found(text, SECRET)]))).toEqual(
    Object.fromEntries(Object.keys(searched).map((place) => [place, []]))
  );
  // The script did set its variable, and the mask is what was stored of the secret.
  expect(JSON.stringify(stores["environments"])).toContain('"key":"LEAKED_BY_SCRIPT","value":"t=***"');
  expect(scriptOutput).toContain("a test named t=***");
  expect(scriptOutput).toContain("the script ended with t=***");
  // What history kept instead.
  expect(JSON.stringify(stores["history"])).toContain("***");
  expect(copied[0]).toContain("-H 'X-Api-Key: ***'");
});

test("a request that uses a secret while the vault is locked asks for the passphrase, and cancelling sends nothing", async ({ page }) => {
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo`, headers: { "X-Api-Key": "{{API_TOKEN}}" } });
  await protectVariable(page, "API_TOKEN", "locked-vault-secret");
  await page.getByRole("button", { name: "Lock secrets", exact: true }).click();
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().startsWith(ECHO)) requests += 1;
  });

  await send(page);
  const dialog = page.getByRole("dialog", { name: "Unlock secrets", exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(/uses a vault secret and the vault is locked/)).toBeVisible();
  expect(requests).toBe(0);

  // With the passphrase, the same click sends it.
  const response = page.waitForResponse((r) => r.url().startsWith(`${ECHO}/echo`) && r.request().method() !== "OPTIONS");
  await send(page);
  await dialog.locator("input[type='password']").fill(PASSPHRASE);
  await dialog.getByRole("button", { name: "Unlock secrets" }).click();
  const echo = (await (await response).json()) as Echo;
  expect(echo.headers.find(([key]) => key === "x-api-key")?.[1]).toBe("locked-vault-secret");
});

test("@claim:C-045 a variable without a value holds the request back; Send anyway sends it as written, but never a secret's reference", async ({ page }) => {
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo`, headers: { "X-Plain": "{{nowhere}}" } });
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().startsWith(ECHO)) requests += 1;
  });

  await send(page);
  await expect(page.getByText("{{nowhere}} has no value. The request was not sent.")).toBeVisible();
  expect(requests).toBe(0);

  const response = page.waitForResponse((r) => r.url().startsWith(`${ECHO}/echo`) && r.request().method() !== "OPTIONS");
  await page.getByRole("button", { name: "Send anyway" }).click();
  const echo = (await (await response).json()) as Echo;
  expect(echo.headers.find(([key]) => key === "x-plain")?.[1]).toBe("{{nowhere}}");
  await expect(page.locator(".status-badge")).toHaveText("200");

  // A secret's reference is not a variable without a value. It is never sent, whatever the user chose.
  const sent = requests;
  await page.getByRole("tab", { name: "Headers", exact: true }).first().click();
  await page.getByRole("textbox", { name: "Headers value, row 1" }).fill("{{nowhere}} {{$secret.00000000-0000-4000-8000-00000000d5d5}}");
  await send(page);
  const dialog = page.getByRole("dialog", { name: "Create vault passphrase", exact: true });
  await dialog.locator("input[type='password']").nth(0).fill(PASSPHRASE);
  await dialog.locator("input[type='password']").nth(1).fill(PASSPHRASE);
  await dialog.getByRole("button", { name: "Create vault" }).click();
  await expect(page.getByText(/have no value|has no value/)).toBeVisible();
  await page.getByRole("button", { name: "Send anyway" }).click();
  await expect(page.getByText(/refers to a vault secret that could not be read/)).toBeVisible();
  await page.waitForTimeout(500);
  expect(requests).toBe(sent);
});

test("history keeps as many entries as Settings says: with the size at 5, 7 requests leave the newest 5", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const size = page.getByLabel("History size");
  await expect(size).toHaveValue("500");
  await size.fill("5");
  await size.blur();
  await page.keyboard.press("Escape");

  for (let n = 1; n <= 7; n++) {
    await page.locator("input.address-url").fill(`${ECHO}/echo?n=${n}`);
    const response = page.waitForResponse((r) => r.url() === `${ECHO}/echo?n=${n}`);
    await send(page);
    await response;
    await expect.poll(async () => JSON.stringify((await dumpIdb(page))["history"])).toContain(`n=${n}"`);
  }

  const history = (await dumpIdb(page))["history"] as { sent: { url: string } }[];
  expect(history.map((entry) => entry.sent.url).sort()).toEqual([3, 4, 5, 6, 7].map((n) => `${ECHO}/echo?n=${n}`));
});

test("history is searched by URL, by method and by status", async ({ page }) => {
  await page.goto("/");
  for (const [method, url] of [["GET", `${ECHO}/echo?find=users`], ["DELETE", `${ECHO}/status/500?find=orders`]]) {
    await page.getByRole("textbox", { name: "HTTP method" }).fill(method);
    await page.locator("input.address-url").fill(url);
    const response = page.waitForResponse((r) => r.url() === url && r.request().method() !== "OPTIONS");
    await send(page);
    await response;
  }
  await expect.poll(async () => (await dumpIdb(page))["history"]?.length ?? 0).toBe(2);

  await page.getByRole("button", { name: "Request history", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Request history" });
  const rows = drawer.getByRole("button", { name: /^Load request / });
  const search = drawer.getByRole("searchbox", { name: "Search history" });
  await expect(rows).toHaveCount(2);

  for (const [query, url] of [["orders", "find=orders"], ["get", "find=users"], ["500", "find=orders"], ["delete 500", "find=orders"]]) {
    await search.fill(query);
    await expect(rows, query).toHaveCount(1);
    await expect(rows, query).toContainText(url);
  }
  await search.fill("nothing-like-this");
  await expect(rows).toHaveCount(0);
  await expect(drawer.getByText("No request in history matches.")).toBeVisible();
  await search.fill("");
  await expect(rows).toHaveCount(2);
});
