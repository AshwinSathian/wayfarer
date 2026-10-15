import { expect, test, type Page } from "@playwright/test";
import { PASSPHRASE, dumpIdb, openSettings, protectVariable, seedAndOpen, send } from "./support/app";
import { ECHO } from "./support/echo";

// P2.5 with P2.8 and P2.9 (plan D21): a vault secret reaches the wire, and
// nothing that is stored, exported or copied holds it.

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

async function downloadText(page: Page, menuItem: string): Promise<string> {
  await page.getByText("Tripwire collection", { exact: true }).click({ button: "right" });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: menuItem, exact: true }).click()]);
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** The collection as a Postman file (P4.6 b), through its dialog. */
async function postmanText(page: Page, credentials: boolean): Promise<string> {
  await page.getByText("Tripwire collection", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Export for Postman…" }).click();
  const dialog = page.getByRole("dialog", { name: "Export for Postman" });
  if (credentials) await dialog.getByRole("checkbox", { name: "Include credentials" }).check();
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Export file" }).click()]);
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** The HAR file the export dialog saves (P4.6 c): of the response on screen, or of every entry of history. */
async function harText(page: Page, from: "response" | "history", credentials = false): Promise<string> {
  if (from === "response") {
    await page.getByRole("button", { name: "Export response" }).click();
    await page.getByRole("menuitem", { name: "Export as HAR…", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Request history", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Request history" });
    await drawer.getByRole("button", { name: "Select all", exact: true }).click();
    await drawer.getByRole("button", { name: /Export .*as HAR…/ }).click();
  }
  const dialog = page.getByRole("dialog", { name: "Export as HAR" });
  if (credentials) await dialog.getByRole("checkbox", { name: "Include credentials" }).check();
  await expect(dialog.locator(".har-export-preview")).toContainText('"version": "1.2"');
  const shown = (await dialog.locator(".har-export-preview").textContent()) ?? "";
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Save file" }).click()]);
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  await expect(dialog).toHaveCount(0);
  if (from === "history") {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Request history" })).toBeHidden();
  }
  // What the dialog showed is searched too.
  return `${Buffer.concat(chunks).toString("utf8")}\n${shown}`;
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
  // The longest claim test: one send with two scripts, nine copies and two downloads. On a slow WebKit runner it passed 30 s (#228).
  test.slow();
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
      pm.globals.set("LEAKED_TO_GLOBALS", echoed);
      pm.test("a test named " + echoed, () => { throw new Error("it failed with " + echoed); });
      // P3.3: the script sends the secret on. The console names the request it made.
      pm.sendRequest("${ECHO}/echo?leak=" + encodeURIComponent(echoed), (error, response) => {
        console.log("sent on, and it came back again: " + response.json().query.leak);
        throw new Error("the script ended with " + echoed);
      });
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
  // The composer's own: the command, and the request as code for each target (P4.6 a).
  for (const item of ["Copy as cURL", "Copy as cURL with credentials", "Copy as JavaScript (fetch)", "Copy as Python (requests)", "Copy as HTTPie"]) {
    await page.getByRole("button", { name: "Copy as cURL", exact: true }).click();
    await page.getByRole("menuitem", { name: item, exact: true }).click();
    // The generators are fetched for the first of the three: each copy is waited for, so the order is the list's.
    await expect.poll(async () => (await clipboard()).length).toBe(5 + ["Copy as cURL", "Copy as cURL with credentials", "Copy as JavaScript (fetch)", "Copy as Python (requests)", "Copy as HTTPie"].indexOf(item));
  }
  await expect.poll(clipboard).toHaveLength(9);
  const copied = await clipboard();
  const files = [await downloadText(page, "Export"), await downloadText(page, "Export with credentials")];
  const postman = [await postmanText(page, false), await postmanText(page, true)];
  // P4.6 (c): the HAR dialog's file and what it showed, for the response (with credentials too) and for history.
  const har = [await harText(page, "response"), await harText(page, "response", true), await harText(page, "history")];

  // What the script wrote, as the page shows it: its console, its test row and its own error.
  await page.locator("app-response-viewer").getByRole("tab", { name: /Tests/ }).click();
  await expect(page.locator(".script-console")).toContainText("the server sent back:");
  await expect(page.locator(".script-console")).toContainText("[pm.sendRequest] GET http://127.0.0.1:4300/echo?leak=t%3D*** → 200");
  await expect(page.locator(".script-console")).toContainText("sent on, and it came back again: t=***");
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
    "composer code: fetch": copied[6],
    "composer code: Python requests": copied[7],
    "composer code: HTTPie": copied[8],
    "collection export": files[0],
    "collection export with credentials": files[1],
    "Postman collection export": postman[0],
    "Postman collection export with credentials": postman[1],
    "HAR file of the response": har[0],
    "HAR file of the response with credentials": har[1],
    "HAR file of history": har[2],
    "what the script wrote on the page": scriptOutput,
  };
  // All nine stores were read, the composer's tabs among them (P5.1), and the exports are the real thing.
  expect(Object.keys(stores).sort()).toEqual(["collections", "cookies", "environments", "files", "folders", "history", "meta", "requests", "secrets", "tabs"]);
  // The open tab is stored as the saved request is: the variable by its name, nothing of its value.
  expect(JSON.stringify(stores["tabs"])).toContain("t={{API_TOKEN}}");
  expect(copied[1]).toContain('"version": "1.2"');
  expect(copied[0]).toMatch(/^curl /);
  expect(copied[6]).toContain("await fetch(");
  expect(copied[7]).toContain("requests.request(");
  expect(copied[8]).toMatch(/^http /);
  expect(files[0]).toContain('"$id": "wayfarer/collection"');
  expect(postman[0]).toContain('"schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"');
  expect(postman[1]).toContain('"key": "username"');
  for (const file of har) expect(file).toContain('"version": "1.2"');
  // "With credentials" is the real thing: Basic's own header, with the secret in it masked.
  expect(har[1]).toContain('"name": "X-Api-Key"');
  expect(Object.fromEntries(Object.entries(searched).map(([place, text]) => [place, found(text, SECRET)]))).toEqual(
    Object.fromEntries(Object.keys(searched).map((place) => [place, []]))
  );
  // The script did set its variable, and the mask is what was stored of the secret.
  expect(JSON.stringify(stores["environments"])).toContain('"key":"LEAKED_BY_SCRIPT","value":"t=***"');
  expect(JSON.stringify(stores["meta"])).toContain('"key":"LEAKED_TO_GLOBALS","value":"t=***"');
  expect(scriptOutput).toContain("a test named t=***");
  expect(scriptOutput).toContain("the script ended with t=***");
  // What history kept instead.
  expect(JSON.stringify(stores["history"])).toContain("***");
  expect(copied[0]).toContain("-H 'X-Api-Key: ***'");
});

test("@claim:C-007 a script sets a protected variable: the new value goes into the vault and onto the wire, and nothing stored holds it", async ({ page }) => {
  const ROTATED = 'rotated/by+script "51ab9e&';
  await seedAndOpen(page, {}, {
    method: "GET",
    url: `${ECHO}/echo`,
    headers: { "X-Api-Key": "{{API_TOKEN}}" },
    // P3.12: as a script that refreshes a token does. The variable is protected, so the value must not land in the environment.
    preRequestScript: `pm.environment.set("API_TOKEN", ${JSON.stringify(ROTATED)}); console.log("rotated to " + pm.environment.get("API_TOKEN"));`,
  });
  await protectVariable(page, "API_TOKEN", "the-first-value-8d3c");

  const echo = await sendAndEcho(page);
  // The request was built after the script: it carries the new value.
  expect(echo.headers.find(([key]) => key === "x-api-key")?.[1]).toBe(ROTATED);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await expect.poll(async () => (await dumpIdb(page))["history"]?.length ?? 0).toBe(1);
  await page.locator("app-response-viewer").getByRole("tab", { name: /Tests/ }).click();
  await expect(page.locator(".script-console")).toHaveText(/rotated to \*\*\*/);

  const stores = await dumpIdb(page);
  const web = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
  expect(Object.keys(stores).sort()).toEqual(["collections", "cookies", "environments", "files", "folders", "history", "meta", "requests", "secrets", "tabs"]);
  const searched = { ...Object.fromEntries(Object.entries(stores).map(([name, records]) => [name, JSON.stringify(records)])), web, console: await page.locator(".script-console").innerText() };
  expect(Object.fromEntries(Object.entries(searched).map(([place, text]) => [place, found(text, ROTATED)]))).toEqual(Object.fromEntries(Object.keys(searched).map((place) => [place, []])));
  // The variable is still a reference to the one secret, which is still ciphertext.
  expect(JSON.stringify(stores["environments"])).toMatch(/"key":"API_TOKEN","value":"\{\{\$secret\.[0-9a-f-]+\}\}"/);
  expect(stores["secrets"]).toHaveLength(1);
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

// P4.7: an OAuth 2.0 token is a new thing the app keeps. With the vault
// unlocked it is a vault secret; it is masked wherever a vault secret is.
test("@claim:C-007 an OAuth 2.0 token is kept in the vault and nowhere else: a scan of everything stored, exported and copied finds neither it nor its refresh token", async ({ page }) => {
  // As long as the scan above it: a vault made, a send with a script, nine copies, two downloads and a reload. On the WebKit runner it was at 30 s with the reload still to do (#228).
  test.slow();
  const clipboard = await recordClipboard(page);
  let tokenRequests = 0;
  page.on("request", (request) => {
    if (request.url().startsWith(`${ECHO}/oauth/token`) && request.method() === "POST") tokenRequests += 1;
  });
  await seedAndOpen(page, {}, {
    method: "POST",
    url: `${ECHO}/echo`,
    auth: { type: "oauth2", grant: "client_credentials", authUrl: "", tokenUrl: `${ECHO}/oauth/token`, clientId: "wayfarer-e2e", clientSecret: "{{CLIENT_SECRET}}", scope: "", username: "", password: "", clientAuth: "header", retryOn401: false },
    storedBody: { mode: "raw", raw: { language: "text", text: "hello" } },
    // The server sends the Authorization header back, and a script writes it where a script can.
    postRequestScript: `
      const sent = pm.response.json().headers.find(([name]) => name === "authorization")[1];
      console.log("the server saw " + sent + " and the request says " + pm.request.headers.get("Authorization"));
      pm.environment.set("LEAKED_BY_SCRIPT", sent);
    `,
  });
  // The vault is made and left unlocked; the client's secret is in it.
  await protectVariable(page, "CLIENT_SECRET", "client-secret-in-vault");
  await page.getByRole("tab", { name: "Auth", exact: true }).first().click();
  const [asked] = await Promise.all([
    page.waitForRequest((request) => request.url().startsWith(`${ECHO}/oauth/token`) && request.method() === "POST"),
    page.getByRole("button", { name: "Get token", exact: true }).click(),
  ]);
  // The client's secret came out of the vault for the token request.
  expect(Buffer.from(((await asked.allHeaders())["authorization"] ?? "").slice("Basic ".length), "base64").toString("utf8")).toBe("wayfarer-e2e:client-secret-in-vault");
  await expect(page.locator(".oauth-token-status")).toContainText("It is kept in the vault.");

  // The token is the one the request arrives with; its refresh token is asked of the identity provider itself.
  // (Not read from the token answer in the browser: on a CI runner Chromium had no body to give for it.)
  const echo = await sendAndEcho(page);
  const token = (echo.headers.find(([key]) => key === "authorization")?.[1] ?? "").replace(/^Bearer /, "");
  const issued = await page.request.get(`${ECHO}/oauth/issued?token=${token}`);
  expect(issued.ok()).toBe(true);
  const { refresh_token: refresh } = (await issued.json()) as { refresh_token: string };
  expect(refresh).toBeTruthy();
  await expect(page.locator(".status-badge")).toHaveText("200");
  await expect.poll(async () => (await dumpIdb(page))["history"]?.length ?? 0).toBe(1);

  const exportMenu = page.getByRole("button", { name: "Export response" });
  for (const item of ["Copy as cURL", "Copy as HAR", "Copy as cURL with credentials", "Copy as HAR with credentials"]) {
    await exportMenu.click();
    await page.getByRole("menuitem", { name: item, exact: true }).click();
  }
  const composer = ["Copy as cURL", "Copy as cURL with credentials", "Copy as JavaScript (fetch)", "Copy as Python (requests)", "Copy as HTTPie"];
  for (const item of composer) {
    await page.getByRole("button", { name: "Copy as cURL", exact: true }).click();
    await page.getByRole("menuitem", { name: item, exact: true }).click();
    await expect.poll(async () => (await clipboard()).length).toBe(5 + composer.indexOf(item));
  }
  const copied = await clipboard();
  await page.locator("app-response-viewer").getByRole("tab", { name: /Tests/ }).click();
  await expect(page.locator(".script-console")).toContainText("the server saw *** and the request says Bearer ***");

  const stores = await dumpIdb(page);
  const searched: Record<string, string> = {
    ...Object.fromEntries(Object.entries(stores).map(([name, records]) => [`IndexedDB ${name}`, JSON.stringify(records)])),
    "localStorage and sessionStorage": await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }])),
    ...Object.fromEntries(copied.map((text, index) => [`copy ${index + 1}`, text])),
    "collection export": await downloadText(page, "Export"),
    "collection export with credentials": await downloadText(page, "Export with credentials"),
    "what the script wrote on the page": await page.locator(".script-console").innerText(),
  };
  expect(Object.keys(stores).sort()).toEqual(["collections", "cookies", "environments", "files", "folders", "history", "meta", "requests", "secrets", "tabs"]);
  expect(copied).toHaveLength(9);
  for (const secret of [token, refresh, "client-secret-in-vault"]) {
    expect(Object.fromEntries(Object.entries(searched).map(([place, text]) => [place, found(text, secret)])), secret).toEqual(Object.fromEntries(Object.keys(searched).map((place) => [place, []])));
  }
  // The vault holds two secrets, as ciphertext: the client's, and the token under a name that says whose it is and holds no secret.
  const names = (stores["secrets"] as { name: string }[]).map((secret) => secret.name).sort();
  expect(names).toEqual(["CLIENT_SECRET", `OAuth 2.0 token ["client_credentials","${ECHO}/oauth/token","wayfarer-e2e","",""]`]);
  // The command as sent has the header, masked even "with credentials"; the composer's own, built without a send, has none.
  expect(copied[2]).toContain("-H 'Authorization: Bearer ***'");
  expect(copied[5]).not.toContain("Authorization");
  expect(JSON.stringify(stores["environments"])).toContain('"key":"LEAKED_BY_SCRIPT","value":"Bearer ***"');

  // After a reload the tab holds nothing. The send asks for the passphrase and takes the token from the vault: no new one is asked for.
  await page.reload();
  // In the collections tree: the tab the reload restored shows the name too.
  await page.getByRole("tree").getByText("Tripwire request", { exact: true }).dblclick();
  await expect(page.locator("input.address-url")).toHaveValue(`${ECHO}/echo`);
  const again = page.waitForResponse((r) => r.url().startsWith(`${ECHO}/echo`) && r.request().method() !== "OPTIONS");
  await send(page);
  const dialog = page.getByRole("dialog", { name: "Unlock secrets", exact: true });
  await dialog.locator("input[type='password']").fill(PASSPHRASE);
  await dialog.getByRole("button", { name: "Unlock secrets" }).click();
  expect(((await (await again).json()) as Echo).headers.find(([key]) => key === "authorization")?.[1]).toBe(`Bearer ${token}`);
  expect(tokenRequests).toBe(1);
});

// F81: the pass that says which secrets a request needs read only an auth's
// credentials (the password, the secret key), so a secret in another field
// of the auth was never read from the vault.
for (const [field, auth, arrived] of [
  ["Basic's username", { type: "basic", username: "{{API_USER}}", password: "pw" }, (authorization: string) => Buffer.from(authorization.slice("Basic ".length), "base64").toString("utf8") === "user-in-vault-f81:pw"],
  ["the AWS access key", { type: "awsv4", accessKey: "{{API_USER}}", secretKey: "k", sessionToken: "", region: "eu-west-1", service: "s3" }, (authorization: string) => authorization.includes("Credential=user-in-vault-f81/")],
] as const) {
  test(`a vault secret in an auth field that is not its credential is read and sent: ${field}`, async ({ page }) => {
    await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo`, auth });
    await protectVariable(page, "API_USER", "user-in-vault-f81");

    const echo = await sendAndEcho(page);
    expect(arrived(echo.headers.find(([key]) => key === "authorization")?.[1] ?? "")).toBe(true);
    await expect(page.locator(".status-badge")).toHaveText("200");
    // It is a vault secret like any other: the server sent it back, and history holds it in no encoding.
    await expect.poll(async () => (await dumpIdb(page))["history"]?.length ?? 0).toBe(1);
    expect(found(JSON.stringify(await dumpIdb(page)), "user-in-vault-f81")).toEqual([]);
  });
}

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
  await page.goto("/app/");
  await openSettings(page, "History");
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
  await page.goto("/app/");
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
