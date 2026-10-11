import { createHash, createHmac } from "node:crypto";
import { test, expect } from "@playwright/test";
import { dumpIdb, seedAndOpen, send } from "./support/app";

// P4.8: AWS Signature Version 4. The request that arrives carries a
// signature, and the test computes it again, with Node's own crypto, from
// the method, address, headers and body that arrived. Run with CI=1.

const ECHO = "http://127.0.0.1:4300";
const ACCESS = "AKIDEXAMPLE";
const SECRET = "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY";
const TOKEN = "session-token-c061";

const strict = (text: string) => encodeURIComponent(text).replace(/[!'()*]/g, (mark) => `%${mark.charCodeAt(0).toString(16).toUpperCase()}`);
const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

/** The signature AWS would compute for a request that arrived like this, from its `Authorization` header's own scope and list of signed headers. */
function signatureOf(method: string, address: string, headers: Record<string, string>, body: string, secret: string): { signature: string; expected: string; signedHeaders: string[]; scope: string } {
  const [, scope, signedList, signature] = /^AWS4-HMAC-SHA256 Credential=[^/]+\/(\S+), SignedHeaders=(\S+), Signature=([0-9a-f]{64})$/.exec(headers["authorization"] ?? "") ?? [];
  const url = new URL(address);
  const signedHeaders = signedList.split(";");
  const path = `/${url.pathname.split("/").filter(Boolean).map(strict).join("/")}`;
  const query = url.search.slice(1).split("&").filter(Boolean).map((pair) => pair.split("=").map((part) => strict(decodeURIComponent(part))).join("=")).sort().join("&");
  const canonical = [method, path, query, ...signedHeaders.map((name) => `${name}:${(name === "host" ? url.host : headers[name]).trim()}`), "", signedList, sha256(body)].join("\n");
  const [day, region, service] = scope.split("/");
  const key = [day, region, service, "aws4_request"].reduce<string | Buffer>((made, part) => hmac(made, part), `AWS4${secret}`);
  const expected = hmac(key, ["AWS4-HMAC-SHA256", headers["x-amz-date"], scope, sha256(canonical)].join("\n")).toString("hex");
  return { signature, expected, signedHeaders, scope };
}

test("@claim:C-061 AWS Signature: the signature that arrives is the one computed again from the request that arrived, and history keeps neither the secret key nor the token", async ({ page }) => {
  const violations: string[] = [];
  await page.exposeFunction("reportViolation", (directive: string) => violations.push(directive));
  await page.addInitScript(() => addEventListener("securitypolicyviolation", (event) => void (window as unknown as { reportViolation: (directive: string) => void }).reportViolation(event.violatedDirective)));
  await seedAndOpen(page, { region: "eu-west-1" }, { method: "POST", url: `${ECHO}/echo?b=two words&a=1&a=(0)`, body: { name: "Rex", note: "é" } });

  // Chosen and typed in the Auth tab, as a user would.
  await page.getByRole("tab", { name: "Auth", exact: true }).first().click();
  await page.locator("#auth-type-select").click();
  await page.getByRole("option", { name: "AWS Signature", exact: true }).click();
  await page.locator("#auth-aws-access-key").fill(ACCESS);
  await page.locator("#auth-aws-secret-key").fill(SECRET);
  await expect(page.locator("#auth-aws-secret-key")).toHaveAttribute("type", "password");
  await page.locator("#auth-aws-session-token").fill(TOKEN);
  await page.locator("#auth-aws-region").fill("{{region}}");
  await page.locator("#auth-aws-service").fill("execute-api");

  const [sent] = await Promise.all([page.waitForRequest((candidate) => candidate.url().startsWith(`${ECHO}/echo?`) && candidate.method() === "POST"), send(page)]);
  await expect(page.locator(".status-badge")).toHaveText("200");
  const headers = await sent.allHeaders();
  const body = sent.postData() ?? "";
  expect(JSON.parse(body)).toEqual({ name: "Rex", note: "é" });
  const { signature, expected, signedHeaders, scope } = signatureOf(sent.method(), sent.url(), headers, body, SECRET);
  expect(signature).toBe(expected);
  expect(signedHeaders).toEqual(["content-type", "host", "x-amz-date", "x-amz-security-token"]);
  // The region was a variable, and today is the day signed.
  expect(scope).toBe(`${new Date().toISOString().slice(0, 10).replaceAll("-", "")}/eu-west-1/execute-api/aws4_request`);
  expect(headers["authorization"]).toContain(`Credential=${ACCESS}/`);
  expect(headers["x-amz-security-token"]).toBe(TOKEN);
  expect(headers["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/);

  // The server sent every header back. What is kept of the exchange holds no secret key, no token and no signature.
  const history = JSON.stringify((await dumpIdb(page))["history"]);
  expect(history).toContain("/echo?b=");
  for (const kept of [SECRET, TOKEN, signature]) expect(history).not.toContain(kept);
  expect(violations).toEqual([]);
});

test("@claim:C-061 AWS Signature cannot sign a multipart form: the send is refused with a message, and nothing is sent", async ({ page }) => {
  const arrived: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(ECHO)) arrived.push(request.url());
  });
  await seedAndOpen(page, {}, {
    method: "POST",
    url: `${ECHO}/echo`,
    storedBody: { mode: "multipart", multipart: [{ key: "name", enabled: true, kind: "text", value: "Rex" }] },
    auth: { type: "awsv4", accessKey: ACCESS, secretKey: SECRET, sessionToken: "", region: "us-east-1", service: "s3" },
  });
  await send(page);
  await expect(page.getByText("AWS Signature cannot sign a multipart form: the browser writes the form's boundary as it sends, so the app does not have the bytes to sign.")).toBeVisible();
  expect(arrived).toEqual([]);
});
