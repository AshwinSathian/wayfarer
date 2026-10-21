import { describe, expect, it, vi } from "vitest";
import { requestContent, rowsOf } from "../../test/request-fixtures";
import { OAuthError } from "../auth/oauth2";
import { emptyAuth, type AuthConfig, type RequestContent } from "../model/request";
import type { ScopeStack } from "../variables/resolver";
import {
  appendQueryParam,
  bodyContentType,
  bodyTexts,
  buildRequest,
  hostOf,
  normalizeUrl,
  oauthOf,
  UnresolvedVariablesError,
  type BuildContext,
} from "./build";
import { SendBlockedError, SendDeclinedError, type BuiltRequest } from "./exchange";

const oauth: AuthConfig = {
  ...(emptyAuth("oauth2") as Extract<AuthConfig, { type: "oauth2" }>),
  grant: "client_credentials",
  tokenUrl: "https://auth.test/token",
  clientId: "app",
};

function context(fields: Partial<BuildContext> & { scopes?: () => ScopeStack } = {}): BuildContext {
  return {
    scopes: () => ({ environment: rowsOf({ host: "api.test" }) }),
    ancestors: [],
    readSecrets: (ids) => Promise.resolve(new Map(ids.map((id) => [id, `plain-${id}`]))),
    readFile: (ref) => Promise.resolve(new Blob([`bytes of ${ref.fileName}`], { type: "text/plain" })),
    blockUnresolved: false,
    ...fields,
  };
}

const built = (request: RequestContent, fields: Partial<BuildContext> = {}): Promise<BuiltRequest> =>
  Promise.resolve().then(() => buildRequest(request, context(fields)));

describe("buildRequest", () => {
  it("replaces the variables and builds at once when nothing is read from the vault or a file", () => {
    const result = buildRequest(
      requestContent({ url: "{{host}}/x", headers: rowsOf({ "X-Host": "{{host}}" }) }),
      context(),
    );
    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toMatchObject({
      method: "GET",
      url: "https://api.test/x",
      headers: [["X-Host", "api.test"]],
      secrets: [],
    });
  });

  it("reads the vault only for the secrets the request names, and lists their plaintext for the redactor", async () => {
    const readSecrets = vi.fn((ids: string[]) => Promise.resolve(new Map(ids.map((id) => [id, `plain-${id}`]))));
    const result = await built(requestContent({ url: "https://api.test/?k={{$secret.abc}}" }), { readSecrets });
    expect(readSecrets).toHaveBeenCalledExactlyOnceWith(["abc"]);
    expect(result.url).toBe("https://api.test/?k=plain-abc");
    expect(result.secrets).toEqual(["plain-abc"]);
  });

  it("holds a request with a variable without a value back when asked to, and names it", () => {
    expect(() =>
      buildRequest(requestContent({ url: "https://api.test/{{missing}}" }), context({ blockUnresolved: true })),
    ).toThrow(UnresolvedVariablesError);
    expect(() =>
      buildRequest(requestContent({ url: "https://api.test/{{a}}/{{b}}" }), context({ blockUnresolved: true })),
    ).toThrow("{{a}}, {{b}} have no value. The request was not sent.");
    expect(buildRequest(requestContent({ url: "https://api.test/{{missing}}" }), context())).toMatchObject({
      url: "https://api.test/{{missing}}",
    });
  });

  describe("C-053: a script that moved a request with a vault secret to another host", () => {
    const request = requestContent({ url: "https://{{host}}/?k={{$secret.abc}}" });
    const composed = { url: "https://{{host}}/", scopes: { environment: rowsOf({ host: "before.test" }) } };

    it("asks, and reads the vault after a yes", async () => {
      const askHost = vi.fn(() => Promise.resolve(true));
      const result = await built(request, { composed, askHost });
      expect(askHost).toHaveBeenCalledExactlyOnceWith("before.test", "api.test");
      expect(result.url).toBe("https://api.test/?k=plain-abc");
    });

    it("sends nothing after a no, and with no one to ask", async () => {
      const readSecrets = vi.fn();
      await expect(
        built(request, { composed, askHost: () => Promise.resolve(false), readSecrets }),
      ).rejects.toBeInstanceOf(SendDeclinedError);
      await expect(built(request, { composed, readSecrets })).rejects.toBeInstanceOf(SendDeclinedError);
      expect(readSecrets).not.toHaveBeenCalled();
    });

    it("asks once for a host in a run: a yes is kept", async () => {
      const accepted = new Set<string>();
      const askHost = vi.fn(() => Promise.resolve(true));
      await built(request, { composed: { ...composed, accepted }, askHost });
      await built(request, { composed: { ...composed, accepted }, askHost });
      expect(askHost).toHaveBeenCalledTimes(1);
      expect([...accepted]).toEqual(["api.test"]);
    });

    it("does not ask when the host stayed", async () => {
      const askHost = vi.fn();
      await built(request, {
        composed: { ...composed, scopes: { environment: rowsOf({ host: "api.test" }) } },
        askHost,
      });
      expect(askHost).not.toHaveBeenCalled();
    });
  });

  describe("the body, by mode", () => {
    const post = (body: RequestContent["body"]) => requestContent({ method: "POST", url: "https://api.test/", body });

    it("raw text with its type, none when blank; no body for GET", async () => {
      expect(await built(post({ mode: "raw", raw: { language: "json", text: '{"h":"{{host}}"}' } }))).toMatchObject({
        body: '{"h":"api.test"}',
        headers: [["Content-Type", "application/json"]],
      });
      expect((await built(post({ mode: "raw", raw: { language: "json", text: "" } }))).body).toBeUndefined();
      expect(
        (
          await built(
            requestContent({ url: "https://api.test/", body: { mode: "raw", raw: { language: "text", text: "x" } } }),
          )
        ).body,
      ).toBeUndefined();
      expect((await built(post({ mode: "none" }))).body).toBeUndefined();
    });

    it("a request's own Content-Type wins over the mode's", async () => {
      const request = {
        ...post({ mode: "raw", raw: { language: "json", text: "{}" } }),
        headers: rowsOf({ "content-type": "application/vnd.x+json" }),
      };
      expect((await built(request)).headers).toEqual([["content-type", "application/vnd.x+json"]]);
    });

    it("GraphQL as one JSON object, and a refusal for variables that are not JSON", async () => {
      expect(
        (await built(post({ mode: "graphql", graphql: { query: "{ a }", variables: '{"h":"{{host}}"}' } }))).body,
      ).toBe('{"query":"{ a }","variables":{"h":"api.test"}}');
      await expect(
        built(post({ mode: "graphql", graphql: { query: "{ a }", variables: "{" } })),
      ).rejects.toBeInstanceOf(SendBlockedError);
    });

    it("a URL-encoded form of its enabled rows", async () => {
      const result = await built(
        post({
          mode: "urlencoded",
          urlencoded: [...rowsOf({ a: "{{host}}", b: "x y" }), { key: "off", value: "1", enabled: false }],
        }),
      );
      expect(result).toMatchObject({
        body: "a=api.test&b=x+y",
        headers: [["Content-Type", "application/x-www-form-urlencoded"]],
      });
    });

    it("a multipart form with its text and its files", async () => {
      const result = await built(
        post({
          mode: "multipart",
          multipart: [
            { kind: "text", key: "k", value: "{{host}}", enabled: true },
            { kind: "file", key: "f", fileId: "1", fileName: "a.txt", enabled: true },
          ],
        }),
      );
      const form = result.body as FormData;
      expect(form.get("k")).toBe("api.test");
      expect(await (form.get("f") as File).text()).toBe("bytes of a.txt");
    });

    it("a file with its own type, else the file's, and a refusal without one", async () => {
      expect(
        (await built(post({ mode: "binary", binary: { fileId: "1", fileName: "a.bin", contentType: "image/png" } })))
          .headers,
      ).toEqual([["Content-Type", "image/png"]]);
      expect((await built(post({ mode: "binary", binary: { fileId: "1", fileName: "a.txt" } }))).headers).toEqual([
        ["Content-Type", "text/plain"],
      ]);
      await expect(built(post({ mode: "binary" }))).rejects.toThrow("Choose a file for the body");
    });
  });

  describe("the auth", () => {
    it("an API key in the query, and the credentials for the redactor", async () => {
      const result = await built(
        requestContent({ url: "https://api.test/?a=1", auth: { type: "apikey", key: "k", value: "v1", in: "query" } }),
      );
      expect(result.url).toBe("https://api.test/?a=1&k=v1");
      expect(result.credentials).toEqual(["v1"]);
    });

    it("inherits from its ancestors", async () => {
      const ancestors = [
        {
          name: "Collection",
          variables: [],
          auth: { type: "bearer", token: "t-1" } as AuthConfig,
          scripts: { pre: "", post: "" },
        },
      ];
      const result = await built(requestContent({ url: "https://api.test/", auth: { type: "inherit" } }), {
        ancestors,
      });
      expect(result.headers).toEqual([["Authorization", "Bearer t-1"]]);
    });

    it("OAuth 2.0: the token goes in as it is, and is a secret to the redactor", async () => {
      const oauthToken = vi.fn(() => Promise.resolve("tok-{{host}}"));
      const result = await built(requestContent({ url: "https://api.test/", auth: oauth }), {
        oauthToken,
        renewToken: true,
      });
      expect(oauthToken).toHaveBeenCalledWith(oauth, expect.any(String), true);
      expect(result.headers).toEqual([["Authorization", "Bearer tok-{{host}}"]]);
      expect(result.secrets).toEqual(["tok-{{host}}"]);
    });

    it("OAuth 2.0: no token without the means to get one, or with a variable without a value, and a failure says why", async () => {
      await expect(built(requestContent({ url: "https://api.test/", auth: oauth }))).rejects.toThrow(
        "OAuth 2.0 tokens are not fetched here. Nothing was sent.",
      );
      expect(() =>
        buildRequest(
          requestContent({ url: "https://api.test/", auth: { ...oauth, clientId: "{{nope}}" } }),
          context({ oauthToken: vi.fn() }),
        ),
      ).toThrow("which has no value");
      await expect(
        built(requestContent({ url: "https://api.test/", auth: oauth }), {
          oauthToken: () => Promise.reject(new OAuthError("The server said no.")),
        }),
      ).rejects.toThrow("The server said no. Nothing was sent.");
      const other = new Error("boom");
      await expect(
        built(requestContent({ url: "https://api.test/", auth: oauth }), { oauthToken: () => Promise.reject(other) }),
      ).rejects.toBe(other);
    });

    it("AWS Signature signs last, the body's bytes too, and refuses a multipart form", async () => {
      const aws: AuthConfig = {
        type: "awsv4",
        accessKey: "AKID",
        secretKey: "secret",
        sessionToken: "",
        region: "us-east-1",
        service: "s3",
      };
      const signed = await built(
        requestContent({
          method: "PUT",
          url: "https://api.test/k",
          auth: aws,
          body: { mode: "binary", binary: { fileId: "1", fileName: "a.txt" } },
        }),
      );
      expect(signed.headers.map(([name]) => name.toLowerCase())).toEqual(
        expect.arrayContaining(["authorization", "x-amz-date", "x-amz-content-sha256"]),
      );
      expect(signed.credentials.some((value) => value.startsWith("AWS4-HMAC-SHA256"))).toBe(true);
      await expect(
        built(
          requestContent({
            method: "POST",
            url: "https://api.test/",
            auth: aws,
            body: { mode: "multipart", multipart: [] },
          }),
        ),
      ).rejects.toThrow("cannot sign a multipart form");
    });
  });

  it("puts a reconnecting stream's last id in as the server sent it", () => {
    expect(
      buildRequest(requestContent({ url: "https://api.test/" }), context({ lastEventId: "{{host}}" })),
    ).toMatchObject({ headers: [["Last-Event-ID", "{{host}}"]] });
  });
});

describe("the helpers of a build", () => {
  it("normalizeUrl adds https and encodes a line break; appendQueryParam leaves what does not parse", () => {
    expect(normalizeUrl("api.test/a\tb")).toBe("https://api.test/a%09b");
    expect(normalizeUrl("http://api.test")).toBe("http://api.test");
    expect(appendQueryParam("https://api.test/?a=1", "b", "2")).toBe("https://api.test/?a=1&b=2");
    expect(appendQueryParam("http://[", "b", "2")).toBe("http://[");
  });

  it("hostOf names the host and a port that is not the scheme's, or the text itself", () => {
    expect(hostOf("{{host}}:8080/x", { environment: rowsOf({ host: "api.test" }) })).toBe("api.test:8080");
    expect(hostOf("http://[", {})).toBe("http://[");
  });

  it("bodyContentType and bodyTexts read each mode", () => {
    expect(bodyContentType({ mode: "multipart" })).toBe("multipart/form-data");
    expect(bodyContentType({ mode: "binary" })).toBe("application/octet-stream");
    expect(bodyContentType({ mode: "urlencoded" })).toBe("application/x-www-form-urlencoded");
    expect(bodyContentType({ mode: "graphql" })).toBe("application/json");
    expect(bodyContentType({ mode: "raw", raw: { language: "xml", text: "" } })).toBeUndefined();
    expect(bodyContentType({ mode: "none" })).toBeUndefined();
    expect(
      bodyTexts({
        mode: "multipart",
        multipart: [
          { kind: "text", key: "a", value: "b", enabled: true },
          { kind: "file", key: "f", fileId: "1", fileName: "n", enabled: true },
        ],
      }),
    ).toEqual(["a", "b", "f", ""]);
    expect(bodyTexts({ mode: "graphql", graphql: { query: "q", variables: "v" } })).toEqual(["q", "v"]);
    expect(bodyTexts({ mode: "urlencoded", urlencoded: rowsOf({ a: "b" }) })).toEqual(["a", "b"]);
    expect(bodyTexts({ mode: "none" })).toEqual([]);
  });

  it("oauthOf names the token by the auth with its variables replaced, and has none for variables in a circle", () => {
    const named = oauthOf({ ...oauth, clientId: "{{id}}" } as AuthConfig, [], { environment: rowsOf({ id: "app" }) });
    expect(named?.key).toBe(oauthOf(oauth, [], {})?.key);
    expect(oauthOf({ type: "none" }, [], {})).toBeNull();
    expect(
      oauthOf({ ...oauth, clientId: "{{a}}" } as AuthConfig, [], { environment: rowsOf({ a: "{{b}}", b: "{{a}}" }) }),
    ).toBeNull();
  });
});
