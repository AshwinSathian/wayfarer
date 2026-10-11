import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { dumpIdb, expectProdParity, seedAndOpen, send } from "./support/app";
import { ECHO } from "./support/echo";

// P4.7: OAuth 2.0 against the mock identity provider of the echo server, on
// the production build under its own headers (so `Cross-Origin-Opener-Policy:
// same-origin` is in force and the sign-in window has no opener). Run with CI=1.

interface Echo {
  headers: [string, string][];
}

const oauth = (patch: Record<string, unknown> = {}) => ({
  type: "oauth2",
  grant: "authorization_code",
  authUrl: `${ECHO}/oauth/authorize`,
  tokenUrl: `${ECHO}/oauth/token`,
  clientId: "wayfarer-e2e",
  clientSecret: "",
  scope: "read",
  username: "",
  password: "",
  clientAuth: "header",
  retryOn401: false,
  ...patch,
});

/** Every CSP and Trusted Types violation of every page of the context, the sign-in window included. */
async function violationsOf(context: BrowserContext): Promise<string[]> {
  const violations: string[] = [];
  await context.exposeFunction("reportViolation", (directive: string) => violations.push(directive));
  await context.addInitScript(() => addEventListener("securitypolicyviolation", (event) => void (window as unknown as { reportViolation: (directive: string) => void }).reportViolation(event.violatedDirective)));
  return violations;
}

/** The token requests the page makes, as the forms they carry. */
function tokenRequests(page: Page): Record<string, string>[] {
  const forms: Record<string, string>[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(`${ECHO}/oauth/token`) && request.method() === "POST") forms.push(Object.fromEntries(new URLSearchParams(request.postData() ?? "")));
  });
  return forms;
}

async function openAuth(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Auth", exact: true }).first().click();
}

async function sendAndEcho(page: Page, path = "/echo"): Promise<Echo> {
  const response = page.waitForResponse((r) => r.url().startsWith(`${ECHO}${path}`) && r.request().method() !== "OPTIONS");
  await send(page);
  return (await (await response).json()) as Echo;
}

const bearer = (echo: Echo) => echo.headers.find(([name]) => name === "authorization")?.[1] ?? "";
const status = (page: Page) => page.locator(".oauth-token-status");

test("@claim:C-062 Authorization Code with PKCE: the sign-in window answers over a channel, the code is exchanged with its verifier, and the token reaches the server", async ({ page, context }) => {
  const violations = await violationsOf(context);
  const tokens = tokenRequests(page);
  await expectProdParity(await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` }));

  // Chosen and typed in the Auth tab, as a user would.
  await openAuth(page);
  await page.locator("#auth-type-select").click();
  await page.getByRole("option", { name: "OAuth 2.0", exact: true }).click();
  await page.locator("#auth-oauth-auth-url").fill(`${ECHO}/oauth/authorize`);
  await page.locator("#auth-oauth-token-url").fill(`${ECHO}/oauth/token`);
  await page.locator("#auth-oauth-client-id").fill("wayfarer-e2e");
  await page.locator("#auth-oauth-scope").fill("read");
  await expect(page.locator(".oauth-redirect-uri")).toHaveText("http://localhost:4200/oauth/callback");
  await expect(status(page)).toContainText("No token yet.");

  const authorize = context.waitForEvent("request", (request) => request.url().startsWith(`${ECHO}/oauth/authorize`));
  const [popup, issued] = await Promise.all([
    context.waitForEvent("page"),
    page.waitForResponse((response) => response.url().startsWith(`${ECHO}/oauth/token`) && response.request().method() === "POST"),
    page.getByRole("button", { name: "Get token", exact: true }).click(),
  ]);
  const { access_token: token } = (await issued.json()) as { access_token: string };
  await expect(status(page)).toContainText("There is a token, good until");
  // The window had no opener to post to (COOP), said what it did, and the code is gone from its address.
  const asked = new URL((await authorize).url()).searchParams;
  expect(asked.get("response_type")).toBe("code");
  expect(asked.get("redirect_uri")).toBe("http://localhost:4200/oauth/callback");
  expect(asked.get("code_challenge_method")).toBe("S256");
  expect(asked.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(asked.get("state")).toMatch(/^[0-9a-f-]{36}$/);
  if (!popup.isClosed()) {
    await expect(popup.getByText("Signed in. You can close this window.")).toBeVisible();
    expect(await popup.evaluate(() => [window.opener === null, location.search])).toEqual([true, ""]);
  }
  // One exchange: the code with the verifier, the client named in the form (it has no secret).
  expect(tokens).toHaveLength(1);
  expect(tokens[0]).toMatchObject({ grant_type: "authorization_code", redirect_uri: "http://localhost:4200/oauth/callback", client_id: "wayfarer-e2e" });
  expect(tokens[0]["code_verifier"]).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);

  const echo = await sendAndEcho(page);
  expect(bearer(echo)).toBe(`Bearer ${token}`);
  await expect(page.locator(".status-badge")).toHaveText("200");
  expect(tokens).toHaveLength(1);

  // No vault: the token is in this tab's memory, and in nothing stored. The server sent it back, and history holds a mask.
  await expect(status(page)).toContainText("kept in this tab's memory only");
  await expect.poll(async () => (await dumpIdb(page))["history"]?.length ?? 0).toBe(1);
  const stored = JSON.stringify([await dumpIdb(page), await page.evaluate(() => [{ ...localStorage }, { ...sessionStorage }])]);
  expect(stored).not.toContain(token);
  expect(stored).not.toContain(tokens[0]["code_verifier"]);
  expect(violations).toEqual([]);
});

for (const [grant, auth, sentAs] of [
  // A client with a secret is named in a Basic header, each part form-encoded (RFC 6749, 2.3.1).
  ["Client Credentials", oauth({ grant: "client_credentials", clientSecret: "s3:cret" }), { form: { grant_type: "client_credentials", scope: "read" }, basic: "wayfarer-e2e:s3%3Acret" }],
  ["Password", oauth({ grant: "password", username: "alice", password: "correct-password", clientAuth: "body" }), { form: { grant_type: "password", username: "alice", password: "correct-password", scope: "read", client_id: "wayfarer-e2e" }, basic: null }],
] as const) {
  test(`@claim:C-062 ${grant}: the token is asked for when the request is sent, and reaches the server`, async ({ page, context }) => {
    const violations = await violationsOf(context);
    const tokens = tokenRequests(page);
    const headers: (string | null)[] = [];
    page.on("request", (request) => {
      if (request.url().startsWith(`${ECHO}/oauth/token`) && request.method() === "POST") headers.push(request.headers()["authorization"] ?? null);
    });
    await expectProdParity(await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo`, auth }));
    await openAuth(page);
    await expect(status(page)).toContainText("No token yet. One is asked for when the request is sent.");

    const issued = page.waitForResponse((response) => response.url().startsWith(`${ECHO}/oauth/token`) && response.request().method() === "POST");
    const echo = await sendAndEcho(page);
    const { access_token: token } = (await (await issued).json()) as { access_token: string };
    expect(bearer(echo)).toBe(`Bearer ${token}`);
    await expect(page.locator(".status-badge")).toHaveText("200");
    expect(tokens).toEqual([sentAs.form]);
    expect(headers.map((value) => value && Buffer.from(value.slice("Basic ".length), "base64").toString("utf8"))).toEqual([sentAs.basic]);
    await expect(status(page)).toContainText("There is a token, good until");

    // The token is held: a second send asks for none. Forgotten, the next send asks again.
    await sendAndEcho(page);
    expect(tokens).toHaveLength(1);
    await page.getByRole("button", { name: "Forget token", exact: true }).click();
    await expect(status(page)).toContainText("No token yet.");
    expect(bearer(await sendAndEcho(page))).not.toBe(`Bearer ${token}`);
    expect(tokens).toHaveLength(2);
    // Token requests are not history: three sends, three entries.
    await expect.poll(async () => (await dumpIdb(page))["history"]?.length ?? 0).toBe(3);
    // And what history keeps of the auth has the client's secret and the user's password masked, and no token.
    const history = JSON.stringify((await dumpIdb(page))["history"]);
    for (const kept of [token, "s3:cret", "correct-password"]) expect(history).not.toContain(kept);
    expect(violations).toEqual([]);
  });
}

test("@claim:C-062 an answer with a state the app did not issue is not taken: no code is exchanged, and the wait ends with Cancel", async ({ page, context }) => {
  const tokens = tokenRequests(page);
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo`, auth: oauth({ authUrl: `${ECHO}/oauth/authorize?mock_wrong_state=1` }) });
  await openAuth(page);

  const [popup] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "Get token", exact: true }).click()]);
  await expect(page.locator(".oauth-token-notice")).toHaveText("An answer came back with a state this app did not issue, and was ignored.");
  // The window was told nothing, and says so. The app still waits.
  await expect(popup.getByText("Wayfarer has not answered.")).toBeVisible();
  await expect(page.getByText("Waiting for the sign-in window.")).toBeVisible();
  await expect(status(page)).toContainText("No token yet.");

  await page.getByRole("button", { name: "Cancel sign-in", exact: true }).click();
  await expect(page.locator(".oauth-token-error")).toHaveText("The sign-in was cancelled.");
  await expect(page.getByText("Waiting for the sign-in window.")).toHaveCount(0);
  expect(tokens).toEqual([]);

  // Sent now, the request is refused: there is no token to send it with.
  let arrived = 0;
  page.on("request", (request) => {
    if (request.url().startsWith(`${ECHO}/echo`)) arrived += 1;
  });
  await send(page);
  await expect(page.getByText("There is no OAuth 2.0 token yet. Choose Get token in the Auth tab. Nothing was sent.")).toBeVisible();
  expect(arrived).toBe(0);
});

test("@claim:C-062 a token that has expired is renewed once, with its refresh token, when the request is sent", async ({ page }) => {
  const tokens = tokenRequests(page);
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo`, auth: oauth({ tokenUrl: `${ECHO}/oauth/token?expires_in=1` }) });
  await openAuth(page);
  const [, first] = await Promise.all([
    page.context().waitForEvent("page"),
    page.waitForResponse((response) => response.url().startsWith(`${ECHO}/oauth/token`) && response.request().method() === "POST"),
    page.getByRole("button", { name: "Get token", exact: true }).click(),
  ]);
  const got = (await first.json()) as { access_token: string; refresh_token: string; expires_in: number };
  expect(got.expires_in).toBe(1);
  // The server's second passes; the panel says so by itself.
  await expect(status(page)).toContainText("The token expired at");
  await expect(status(page)).toContainText("A new one is asked for when the request is sent.");

  const renewed = page.waitForResponse((response) => response.url().startsWith(`${ECHO}/oauth/token`) && response.request().method() === "POST");
  const echo = await sendAndEcho(page);
  const next = (await (await renewed).json()) as { access_token: string };
  expect(bearer(echo)).toBe(`Bearer ${next.access_token}`);
  expect(next.access_token).not.toBe(got.access_token);
  expect(tokens.map((form) => form["grant_type"])).toEqual(["authorization_code", "refresh_token"]);
  // The refresh token the first answer gave; the public client is named in the form.
  expect(tokens[1]).toEqual({ grant_type: "refresh_token", refresh_token: got.refresh_token, client_id: "wayfarer-e2e" });
});

test("@claim:C-062 a 401 gets one more send with a renewed token when the auth asks for it, and is the response when it does not", async ({ page }) => {
  const tokens = tokenRequests(page);
  let resource = 0;
  page.on("request", (request) => {
    if (request.url().startsWith(`${ECHO}/oauth/resource`) && request.method() === "GET") resource += 1;
  });
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/oauth/resource`, auth: oauth({ grant: "client_credentials", clientSecret: "s3cret" }) });
  await openAuth(page);
  const [issued] = await Promise.all([
    page.waitForResponse((response) => response.url().startsWith(`${ECHO}/oauth/token`) && response.request().method() === "POST"),
    page.getByRole("button", { name: "Get token", exact: true }).click(),
  ]);
  const { access_token: token } = (await issued.json()) as { access_token: string };
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");

  // The server stops taking the token, while the app still holds it as good.
  await page.request.post(`${ECHO}/oauth/revoke`, { form: { token } });
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("401");
  expect(tokens).toHaveLength(1);
  expect(resource).toBe(2);

  await page.getByRole("checkbox", { name: "On a 401, get a new token and send once more" }).check();
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  expect(tokens.map((form) => form["grant_type"])).toEqual(["client_credentials", "refresh_token"]);
  // The 401 and the one more send.
  expect(resource).toBe(4);
});

test("@claim:C-062 a token endpoint without CORS headers: sent from the page, the error names Access-Control-Allow-Origin and the Local Bridge", async ({ page }) => {
  let arrived = 0;
  page.on("request", (request) => {
    if (request.url().startsWith(`${ECHO}/echo`)) arrived += 1;
  });
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo`, auth: oauth({ grant: "client_credentials", clientSecret: "s3cret", tokenUrl: `${ECHO}/oauth/token-no-cors` }) });
  await openAuth(page);
  const message =
    "The token request got no answer the page could read. A token endpoint that does not send Access-Control-Allow-Origin for this page cannot be called from a browser: switch on the Local Bridge, which has no such limit. See docs/browser-limits.md#oauth.";
  await page.getByRole("button", { name: "Get token", exact: true }).click();
  await expect(page.locator(".oauth-token-error")).toHaveText(message);
  await expect(status(page)).toContainText("No token yet.");

  await send(page);
  await expect(page.getByText(`${message} Nothing was sent.`)).toBeVisible();
  expect(arrived).toBe(0);
});

test("through the Local Bridge the same token endpoint answers, and the token reaches the server", async ({ page, browserName }) => {
  // The bridge is a Node process: what it does is the same from any browser. Phase 6 runs it in three.
  test.skip(browserName !== "chromium", "the Local Bridge is started for Chromium only (plan P4.7)");
  const port = 7700 + test.info().parallelIndex;
  const token = "bridge-token-for-the-oauth-e2e-0123456789";
  const bridge = spawn(process.execPath, ["local-bridge/bin/cli.js", "--port", String(port), "--token", token, "--allow-origin", "http://localhost:4200"], { stdio: ["ignore", "pipe", "inherit"] });
  try {
    await new Promise<void>((resolve, reject) => {
      bridge.once("exit", (code) => reject(new Error(`the bridge exited with ${code}`)));
      bridge.stdout.on("data", (chunk: Buffer) => {
        if (String(chunk).includes("listening on")) resolve();
      });
    });
    await page.addInitScript(([url, secret]) => localStorage.setItem("wayfarer:bridge", JSON.stringify({ enabled: true, url, token: secret })), [`http://127.0.0.1:${port}`, token]);
    const direct: string[] = [];
    page.on("request", (request) => {
      if (request.url().startsWith(ECHO)) direct.push(request.url());
    });
    await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo`, auth: oauth({ grant: "client_credentials", clientSecret: "s3cret", tokenUrl: `${ECHO}/oauth/token-no-cors` }) });
    await openAuth(page);
    await page.getByRole("button", { name: "Get token", exact: true }).click();
    await expect(status(page)).toContainText("There is a token, good until");

    await send(page);
    await expect(page.locator(".status-badge")).toHaveText("200");
    // The echo's answer, as the page shows it: the request arrived with a token of the mock's.
    await expect.poll(async () => (await page.locator("app-response-viewer").innerText()).replace(/\s+/g, "")).toMatch(/"Bearerat-[A-Za-z0-9_-]{16}"/);
    // Neither the token request nor the user's own left from the page.
    expect(direct).toEqual([]);
  } finally {
    bridge.kill();
  }
});

test("a request that inherits OAuth 2.0 from its collection gets its token in its own Auth tab, and is sent with it", async ({ page }) => {
  const tokens = tokenRequests(page);
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo`, auth: { type: "inherit" }, collection: { auth: oauth({ grant: "client_credentials", clientSecret: "s3cret" }) } });
  await openAuth(page);
  await expect(page.locator(".auth-inherited")).toHaveText('OAuth 2.0 is sent, from collection "Tripwire collection".');
  const [issued] = await Promise.all([
    page.waitForResponse((response) => response.url().startsWith(`${ECHO}/oauth/token`) && response.request().method() === "POST"),
    page.getByRole("button", { name: "Get token", exact: true }).click(),
  ]);
  const { access_token: token } = (await issued.json()) as { access_token: string };
  expect(bearer(await sendAndEcho(page))).toBe(`Bearer ${token}`);
  expect(tokens).toHaveLength(1);
});

test("@claim:C-001 an OAuth 2.0 sign-in talks to the app, to the two addresses the user gave for it, and to the request's own target: nothing else", async ({ page, context, baseURL }) => {
  // The identity provider on one origin and the API on another, so that each request can be told from the others.
  const IDP = "http://127.0.0.1:4301";
  const app = new URL(baseURL ?? "http://localhost:4200").origin;
  const elsewhere: string[] = [];
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== app && !/^(blob|data):$/.test(url.protocol)) elsewhere.push(`${request.method()} ${url.origin}${url.pathname}`);
  });
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo`, auth: oauth({ authUrl: `${IDP}/oauth/authorize`, tokenUrl: `${IDP}/oauth/token` }) });
  await openAuth(page);
  await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "Get token", exact: true }).click()]);
  await expect(status(page)).toContainText("There is a token, good until");
  await sendAndEcho(page);
  await expect(page.locator(".status-badge")).toHaveText("200");

  // The sign-in window, the code's exchange, and the user's request: one of each.
  expect(elsewhere.sort()).toEqual([`GET ${ECHO}/echo`, `GET ${IDP}/oauth/authorize`, `POST ${IDP}/oauth/token`]);
});

test("a variable without a value in the OAuth 2.0 auth: no token is asked for with its name in its place, at Get token or at Send", async ({ page }) => {
  const tokens = tokenRequests(page);
  let arrived = 0;
  page.on("request", (request) => {
    if (request.url().startsWith(`${ECHO}/echo`)) arrived += 1;
  });
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo`, auth: oauth({ grant: "client_credentials", clientId: "{{CLIENT}}", clientSecret: "s3cret" }) });
  await openAuth(page);
  await page.getByRole("button", { name: "Get token", exact: true }).click();
  await expect(page.locator(".oauth-token-error")).toHaveText("{{CLIENT}} has no value. No token was asked for.");

  await send(page);
  await expect(page.getByText("The OAuth 2.0 auth uses {{CLIENT}}, which has no value. No token was asked for, and nothing was sent.")).toBeVisible();
  expect(tokens).toEqual([]);
  expect(arrived).toBe(0);
});
