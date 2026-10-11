# Auth

The Auth tab of a request, and the Settings of a collection or a folder,
set how a request signs in. A request set to **Inherit from parent** is
sent with the auth of the nearest folder that sets one, and otherwise with
its collection's; the tab says what will be sent and where it comes from.

| Type | What is sent |
|---|---|
| None | nothing |
| Bearer Token | `Authorization: Bearer <token>` |
| Basic Auth | `Authorization: Basic <base64 of username:password>`, the text as UTF-8 |
| API Key | a header or a query parameter with the name and the value you give |
| AWS Signature | the request signed with AWS Signature Version 4. See below |

Every field may hold `{{variables}}`, and any of them may be a vault secret
([`secrets.md`](secrets.md)): a username or an access key as well as the
token, the password, the key's value, the AWS secret key and the session
token.

## AWS Signature

<!-- claim:C-061 -->

For AWS's own APIs and for anything else that checks Signature Version 4.
You give the access key, the secret key, the region (`us-east-1`) and the
service (`s3`, `execute-api`), and a session token when the credentials are
temporary ones.

**The request is signed as it is sent**, after everything else is done to
it: variables replaced, the pre-request scripts run, the body made. The app
adds three headers, or four:

- `X-Amz-Date`, the time of the send;
- `X-Amz-Security-Token`, when there is a session token;
- `X-Amz-Content-Sha256`, the body's hash, for the service `s3`, which asks for it;
- `Authorization`, with the signature.

A header of those names that you typed yourself is replaced.

**What is signed:** the method; the path and the query as the browser sends
them; `Host`, which the browser writes from the address; the three headers
above; `Content-Type`, when the request has one; every header of yours
whose name starts with `x-amz-`; and the body's bytes. Other headers of
yours are sent and not signed: a browser adds headers of its own
(`Origin`, `User-Agent`), and a signature over a list the app does not
fully write would not hold.

**What it cannot sign:**

- **A multipart form.** The browser writes the form's boundary as it sends,
  so the app never has the bytes that go out. The send is refused with a
  message, and nothing is sent. Send a file as a File body (how S3 takes an
  upload), or the fields as a URL-encoded form.
- **A signature in the address** (a presigned URL) is not made: the
  signature goes in the headers.

**The page must be served over https, or from localhost.** The signature
is made with the browser's own cryptography, which a page served over
plain http does not have; there the send is refused with a message.

**The clock matters.** AWS refuses a signature whose time is more than a
few minutes from its own. The app signs with this computer's clock.

**In a browser, AWS must allow the request.** Sent directly, the request
is a cross-origin one with headers of its own, so the browser asks the
server first (CORS, [`browser-limits.md`](browser-limits.md)). An S3 bucket
or an API Gateway stage without a CORS rule for this origin refuses that
question, and the request is not sent. The Local Bridge has no such limit.

**What is kept.** The secret key and the session token are credentials:
history and an exported collection hold `***` in their place (an export
"with credentials" excepted), and the `Authorization` header of the request
that was sent is masked in history like any other.

**A copied command carries no signature.** "Copy as cURL" and the request
as code write the request without one: a signature is of one moment and of
the body's bytes, and a copied one would be refused minutes later. The
command has the method, the address, your headers and the body.

**It is tested against AWS's own test suite**: twenty cases of it, at a
pinned commit, give the canonical request, the string to sign and the
signature the suite gives. And in the built app, in three browsers, a
signed request is sent to a local server and the signature that arrived is
computed again, by other code, from the request that arrived.

Imported and exported: a Postman file's `awsv4` auth and an Insomnia
export's AWS IAM auth become this type, and the Postman export writes it
back ([`import.md`](import.md), [`export.md`](export.md)). An OpenAPI
description has no scheme for it.
