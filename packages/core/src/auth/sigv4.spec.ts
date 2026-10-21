import { describe, expect, it } from "vitest";
import { signV4 } from "./sigv4";

// What AWS's test suite does not ask (the suite is test/auth/sigv4-vectors.test.ts):
// a request as a browser sends it, S3, a body of bytes, and headers the signer writes itself.

const credentials = {
  accessKey: "AKIDEXAMPLE",
  secretKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  sessionToken: "",
  region: "us-east-1",
  service: "execute-api",
};
const at = new Date("2015-08-30T12:36:00Z");
const lines = async (request: Parameters<typeof signV4>[0], more: Partial<typeof credentials> = {}) =>
  (await signV4(request, { ...credentials, ...more }, at)).canonicalRequest.split("\n");

describe("signV4: the request as a browser sends it (P4.8)", () => {
  it("the path is encoded once more, as AWS's own example has it, and empty segments are dropped; for S3 it is the path as sent", async () => {
    // AWS's documentation: "/documents and settings/" is signed as "/documents%2520and%2520settings/".
    expect(
      (await lines({ method: "GET", url: "https://example.amazonaws.com/documents and settings/", headers: [] }))[1],
    ).toBe("/documents%2520and%2520settings/");
    expect((await lines({ method: "GET", url: "https://example.amazonaws.com//a//b(c)/", headers: [] }))[1]).toBe(
      "/a/b%28c%29/",
    );
    expect((await lines({ method: "GET", url: "https://example.amazonaws.com", headers: [] }))[1]).toBe("/");
    expect(
      (
        await lines(
          { method: "GET", url: "https://bucket.s3.amazonaws.com/my folder//it's (1).txt", headers: [] },
          { service: "s3" },
        )
      )[1],
    ).toBe("/my%20folder//it%27s%20%281%29.txt");
    // A percent sign that encodes nothing is read as written.
    expect(
      (await lines({ method: "GET", url: "https://bucket.s3.amazonaws.com/100%", headers: [] }, { service: "s3" }))[1],
    ).toBe("/100%25");
  });

  it("the query is sorted by name and then by value, each encoded strictly; a plus is a plus", async () => {
    expect(
      (
        await lines({
          method: "GET",
          url: "https://example.amazonaws.com/?b=2&a=2&a=1&a=(0)&c&d=x+y&e=two words&=empty",
          headers: [],
        })
      )[2],
    ).toBe("=empty&a=%280%29&a=1&a=2&b=2&c=&d=x%2By&e=two%20words");
  });

  it("Host is the address's, with a port that is not the scheme's own; a header of the request is signed, and one the signer writes replaces the request's", async () => {
    const signed = await signV4(
      {
        method: "POST",
        url: "https://example.amazonaws.com:8443/",
        headers: [
          ["Content-Type", " application/json "],
          ["X-Amz-Date", "typed"],
          ["Host", "typed.example"],
          ["x-amz-meta-a", "a   b"],
        ],
        body: "{}",
      },
      { ...credentials, sessionToken: "token-1" },
      at,
    );
    expect(signed.canonicalRequest.split("\n").slice(3, 9)).toEqual([
      "content-type:application/json",
      "host:example.amazonaws.com:8443",
      "x-amz-date:20150830T123600Z",
      "x-amz-meta-a:a b",
      "x-amz-security-token:token-1",
      "",
    ]);
    expect(signed.headers.map(([name]) => name)).toEqual(["X-Amz-Date", "X-Amz-Security-Token", "Authorization"]);
    expect(signed.headers[2][1]).toBe(
      `AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/execute-api/aws4_request, SignedHeaders=content-type;host;x-amz-date;x-amz-meta-a;x-amz-security-token, Signature=${signed.signature}`,
    );
    expect(signed.signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the body's bytes are hashed, as text or as bytes, and for S3 the hash is a header that is signed", async () => {
    const text = await signV4(
      { method: "PUT", url: "https://example.amazonaws.com/", headers: [], body: "é" },
      credentials,
      at,
    );
    const bytes = await signV4(
      { method: "PUT", url: "https://example.amazonaws.com/", headers: [], body: new Uint8Array([0xc3, 0xa9]) },
      credentials,
      at,
    );
    expect(text.signature).toBe(bytes.signature);
    expect(text.canonicalRequest.split("\n").at(-1)).toBe(
      "4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c",
    );
    expect(text.signature).not.toBe(
      (await signV4({ method: "PUT", url: "https://example.amazonaws.com/", headers: [], body: "e" }, credentials, at))
        .signature,
    );

    const s3 = await signV4(
      { method: "PUT", url: "https://bucket.s3.amazonaws.com/key", headers: [], body: "é" },
      { ...credentials, service: "s3" },
      at,
    );
    expect(s3.headers).toContainEqual([
      "X-Amz-Content-Sha256",
      "4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c",
    ]);
    expect(s3.canonicalRequest).toContain("\nhost;x-amz-content-sha256;x-amz-date\n");
    // No body is the hash of nothing.
    expect((await lines({ method: "GET", url: "https://example.amazonaws.com/", headers: [] })).at(-1)).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("the secret key, the region, the service and the day each change the signature", async () => {
    const request = { method: "GET", url: "https://example.amazonaws.com/", headers: [] };
    const base = (await signV4(request, credentials, at)).signature;
    for (const other of [{ secretKey: "other" }, { region: "eu-west-1" }, { service: "s3" }])
      expect((await signV4(request, { ...credentials, ...other }, at)).signature).not.toBe(base);
    expect((await signV4(request, credentials, new Date("2015-08-31T12:36:00Z"))).signature).not.toBe(base);
    expect((await signV4(request, credentials, new Date("2015-08-30T12:36:00.999Z"))).signature).toBe(base);
  });
});
