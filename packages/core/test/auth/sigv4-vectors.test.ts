import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { signV4 } from "../../src/auth/sigv4";

// P4.8: AWS's own Signature Version 4 test suite, twenty of its cases,
// vendored at a pinned commit (packages/core/test/fixtures/aws-sigv4/SOURCES.md).
// For each, the canonical request, the string to sign and the signature are
// the ones the suite gives.

const ROOT = join(__dirname, "../fixtures/aws-sigv4");
const cases = readdirSync(ROOT).filter((name) => statSync(join(ROOT, name)).isDirectory()).sort();
const read = (name: string, file: string): string => readFileSync(join(ROOT, name, file), "utf8");

interface Context {
  credentials: { access_key_id: string; secret_access_key: string; token?: string };
  region: string;
  service: string;
  timestamp: string;
}

/** A case's request as the signer takes one: the address a browser would be given, the headers the request sets, the body. */
function request(name: string) {
  const [head, ...rest] = read(name, "request.txt").split(/\r?\n\r?\n/);
  const [line, ...headerLines] = head.split(/\r?\n/);
  const [method, target] = [line.slice(0, line.indexOf(" ")), line.slice(line.indexOf(" ") + 1, line.lastIndexOf(" HTTP/"))];
  const headers = headerLines.filter(Boolean).map((header): [string, string] => [header.slice(0, header.indexOf(":")), header.slice(header.indexOf(":") + 1)]);
  const host = headers.find(([key]) => key.toLowerCase() === "host")?.[1] ?? "";
  // The browser writes Host, and the signer the date and the token: the rest is what the request sets.
  const own = headers.filter(([key]) => !["host", "x-amz-date", "x-amz-security-token"].includes(key.toLowerCase()));
  return { method, url: `https://${host}${target}`, headers: own, body: rest.join("\n\n") };
}

describe("AWS Signature Version 4, against AWS's test suite (P4.8)", () => {
  it("the set is here, with its licence: twenty cases", () => {
    expect(statSync(join(ROOT, "LICENSE")).size).toBeGreaterThan(1000);
    expect(cases).toHaveLength(20);
  });

  it.each(cases)("@claim:C-061 %s: the canonical request, the string to sign and the signature are the suite's", async (name) => {
    const context = JSON.parse(read(name, "context.json")) as Context;
    const signed = await signV4(
      request(name),
      { accessKey: context.credentials.access_key_id, secretKey: context.credentials.secret_access_key, sessionToken: context.credentials.token ?? "", region: context.region, service: context.service },
      new Date(context.timestamp),
    );
    expect(signed.canonicalRequest).toBe(read(name, "header-canonical-request.txt"));
    expect(signed.stringToSign).toBe(read(name, "header-string-to-sign.txt"));
    expect(signed.signature).toBe(read(name, "header-signature.txt").trim());
    const authorization = signed.headers.find(([key]) => key === "Authorization")?.[1];
    expect(authorization).toMatch(new RegExp(`^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=${signed.signature}$`));
    expect(signed.headers.find(([key]) => key === "X-Amz-Date")?.[1]).toBe("20150830T123600Z");
  });
});
