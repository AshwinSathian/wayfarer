import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { requestContent } from "../../test/request-fixtures";
import type { Cookie } from "../cookies/jar";
import { MASK } from "../redact/redactor";
import type { RoutePolicy } from "../transport/route";
import type { ResolvedRequest, ResponseEnvelope, TransportOptions } from "../transport/transport";
import { exchange, type BuiltRequest, type ExchangeResult, type PastRequest } from "./exchange";
import { SENT_BODY_SHOWN, sentView } from "./sent-view";

const OK: ResponseEnvelope = {
  status: 200,
  statusText: "OK",
  headers: [["content-type", "text/plain"]],
  body: new ArrayBuffer(0),
  redirected: false,
  finalUrl: "",
  route: "direct",
  sizes: { decoded: 0 },
};

/** A real send through `exchange`, to a transport that answers 200: the entry history would keep, and the cookies a bridge would have sent. */
async function send(built: Partial<BuiltRequest>, jar: Cookie[] = []): Promise<ExchangeResult> {
  return exchange(
    {
      template: requestContent(),
      runScripts: false,
      preRequestScript: "",
      postRequestScript: "",
      tests: [],
      buildRequest: () => ({
        method: "GET",
        url: "https://example.com/",
        headers: [],
        secrets: [],
        credentials: [],
        ...built,
      }),
    },
    {
      runScript: () => Promise.reject(new Error("no script")),
      transport: {
        send: (_request: ResolvedRequest, options: TransportOptions, policy: RoutePolicy) => {
          policy.took = "bridge";
          options.cookies?.for("https://example.com/");
          return Promise.resolve({ ...OK, route: "bridge" as const });
        },
        route: () => "bridge",
        first: () => "bridge",
      },
      environment: () => undefined,
      globals: () => [],
      changeGlobals: () => Promise.resolve(),
      vault: {
        isUnlocked: () => false,
        readSecret: () => Promise.resolve(null),
        replaceSecret: () => Promise.resolve(false),
      },
      cookies: { for: () => jar, store: () => undefined },
      timeoutMs: () => 0,
      historyBodies: () => true,
    },
  );
}

const cookie = (value: string): Cookie => ({
  name: "sid",
  value,
  domain: "example.com",
  hostOnly: true,
  path: "/",
  secure: false,
  httpOnly: false,
  created: 0,
});

/** Every text `secret` takes in a request, written here and not by the redactor: the scan must not share its blind spots. */
function forms(secret: string): string[] {
  const bytes = new TextEncoder().encode(secret);
  const b64 = (offset: number) => btoa(String.fromCharCode(...new Uint8Array(offset), ...bytes)).replace(/=+$/, "");
  const json = JSON.stringify(secret).slice(1, -1);
  return [
    secret,
    encodeURIComponent(secret),
    new URLSearchParams({ k: secret }).toString().slice(2),
    json,
    new URL(`http://h/?${secret}`).search.slice(1),
    new URL(`http://h/${secret}`).pathname.slice(1),
    // The base64 of the secret as a whole value, and its middle: what a reader can decode from either end is the whole.
    b64(0),
    b64(0).replace(/\+/g, "-").replace(/\//g, "_"),
  ].filter((form) => form.length >= 6);
}

/** What a reader of the page can see: all of the view as text. */
const shown = (view: ReturnType<typeof sentView>) => JSON.stringify(view);

// A secret of printable characters, long enough to be looked for, and unlike the scaffolding around it.
const secrets = fc
  .string({ unit: fc.constantFrom(..."abcXYZ019-_.~!*'()/+= &?#%:@,;$\"\\é€"), minLength: 8, maxLength: 24 })
  .filter((text) => text.trim() === text && !/^[-_.~!*'()/+=&?#%:@,;$"\\]+$/.test(text));

describe("sentView", () => {
  it("shows the method, the address, the headers and the body as history keeps them", async () => {
    const { history } = await send({
      method: "POST",
      url: "https://example.com/pets?x=1",
      headers: [["Content-Type", "application/json"]],
      body: '{"a":1}',
    });
    expect(sentView(history)).toEqual({
      method: "POST",
      address: "https://example.com/pets?x=1",
      headers: [{ name: "Content-Type", value: "application/json" }],
      body: { text: '{"a":1}', shown: 7, of: 7 },
      route: "bridge",
      secrets: [],
    });
  });

  it("has no body for a request without one, and says a cut body is cut", () => {
    const entry: PastRequest = {
      createdAt: 0,
      template: requestContent(),
      sent: { method: "GET", url: "https://e.test/", headers: [] },
      route: "direct",
    };
    expect(sentView(entry).body).toBeUndefined();
    const long = "x".repeat(SENT_BODY_SHOWN + 5);
    expect(sentView({ ...entry, sent: { ...entry.sent, bodyPreview: long } }).body).toMatchObject({
      shown: SENT_BODY_SHOWN,
      of: SENT_BODY_SHOWN + 5,
    });
  });

  it("is not recorded where the entry holds no record: secrets are null, and nothing else is guessed", () => {
    const view = sentView({
      sent: { method: "GET", url: "https://e.test/", headers: [] },
      route: "direct",
    });
    expect(view.secrets).toBeNull();
  });

  it("names a vault secret by its variable and never by its value", async () => {
    const { history } = await send({
      headers: [["X-Thing", "plain-secret-1"]],
      secrets: ["plain-secret-1"],
      vaulted: [{ name: "API_KEY", scope: "environment" }],
    });
    const view = sentView(history);
    expect(view.headers).toEqual([{ name: "X-Thing", value: MASK }]);
    expect(view.secrets).toEqual([{ name: "API_KEY", scope: "environment" }]);
    expect(shown(view)).not.toContain("plain-secret-1");
  });

  it("masks a credential header whole and the cookies of the jar, which the page did not write", async () => {
    const { history } = await send(
      {
        headers: [
          ["Authorization", "Basic dXNlcjpwYXNz"],
          ["Accept", "*/*"],
        ],
        credentials: ["dXNlcjpwYXNz"],
      },
      [cookie("jar-cookie-value-1")],
    );
    const view = sentView(history);
    expect(view.headers).toEqual([
      { name: "Authorization", value: MASK },
      { name: "Accept", value: "*/*" },
      { name: "Cookie", value: MASK },
    ]);
    expect(shown(view)).not.toMatch(/dXNlcjpwYXNz|jar-cookie-value-1/);
  });

  describe("property: a secret, credential, cookie or token is in no place of the view, in no encoding", () => {
    const run = (name: string, make: (secret: string) => Partial<BuiltRequest>, jar?: (secret: string) => Cookie[]) =>
      it(name, async () => {
        await fc.assert(
          fc.asyncProperty(secrets, async (secret) => {
            const { history } = await send(make(secret), jar?.(secret));
            const text = shown(sentView(history));
            for (const form of forms(secret)) expect(text, `${form} in ${text}`).not.toContain(form);
          }),
          { numRuns: 150 },
        );
      });

    run("in a query value, written as a browser writes it", (secret) => ({
      url: `https://example.com/p?k=${encodeURIComponent(secret)}&u=${new URLSearchParams({ k: secret }).toString().slice(2)}`,
      secrets: [secret],
    }));
    run("in the path and in the query as a URL object writes them", (secret) => {
      const url = new URL("https://example.com/");
      url.pathname = `/${secret}`;
      url.search = secret;
      return { url: url.href, secrets: [secret] };
    });
    run("in a header named by the user, and in a header with a name that says nothing", (secret) => ({
      headers: [
        ["X-Plain", secret],
        ["X-Quoted", JSON.stringify(secret)],
        ["X-Enc", encodeURIComponent(secret)],
      ],
      secrets: [secret],
    }));
    run("in Basic's base64, with a user name before it", (secret) => ({
      headers: [
        [
          "Authorization",
          `Basic ${btoa(Array.from(`user:${secret}`, (char) => (char.charCodeAt(0) > 255 ? "?" : char)).join(""))}`,
        ],
      ],
      credentials: [secret],
    }));
    run("as a bearer token or an API key in a header the app built", (secret) => ({
      headers: [
        ["Authorization", `Bearer ${secret}`],
        ["X-Api-Key", secret],
        ["Cookie", `a=${secret}`],
      ],
      credentials: [secret],
    }));
    run("as a credential in the query (an API key placed there by Auth)", (secret) => ({
      url: `https://example.com/p?api_key=${encodeURIComponent(secret)}`,
      credentials: [secret],
    }));
    run("in a JSON body, a form body and a text body", (secret) => ({
      method: "POST",
      headers: [["Content-Type", "application/json"]],
      body: `${JSON.stringify({ token: secret, list: [secret] })}\n${new URLSearchParams({ f: secret })}\n${secret}`,
      secrets: [secret],
    }));
    run("in the text part of a multipart form, and in a file's name", (secret) => {
      const form = new FormData();
      form.append("field", secret);
      form.append("upload", new File(["x"], `${secret}.txt`, { type: "text/plain" }));
      return { method: "POST", body: form, secrets: [secret] };
    });
    run("as an OAuth 2.0 token, which is a secret of the request", (secret) => ({
      headers: [["Authorization", `Bearer ${secret}`]],
      url: `https://example.com/?access_token=${encodeURIComponent(secret)}`,
      secrets: [secret],
      vaulted: [{ name: "OAuth 2.0 token" }],
    }));
    run(
      "as a cookie's value, wherever the request repeats it",
      (secret) => ({ headers: [["X-Echo", secret]], url: `https://example.com/?c=${encodeURIComponent(secret)}` }),
      (secret) => [cookie(secret)],
    );
    run("as an AWS key's secret and session token in the signed headers", (secret) => ({
      headers: [
        ["Authorization", `AWS4-HMAC-SHA256 Credential=AKIA/20260101/eu-west-1/s3/aws4_request, Signature=${secret}`],
        ["X-Amz-Security-Token", secret],
        ["X-Amz-Date", "20260101T000000Z"],
      ],
      credentials: [secret],
    }));
  });
});
