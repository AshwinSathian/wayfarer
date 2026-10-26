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
| OAuth 2.0 | `Authorization: Bearer <token>`, with a token the app gets from the identity provider and renews. See below |

Every field may hold `{{variables}}`, and any of them may be a vault secret
([`secrets.md`](secrets.md)): a username or an access key as well as the
token, the password, the key's value, the AWS secret key and the session
token, an OAuth 2.0 client's secret.

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

## OAuth 2.0

<!-- claim:C-062 -->

The app gets an access token from your identity provider, sends it as
`Authorization: Bearer <token>`, and renews it. Three grants:

| Grant | What you give | How the token is got |
|---|---|---|
| Authorization Code (PKCE) | the authorization URL, the token URL, the client ID, a scope | **Get token** opens the provider's sign-in in a window. You sign in there; the app exchanges the code that comes back |
| Client Credentials | the token URL, the client ID and secret, a scope | asked for when the request is sent, or with **Get token** |
| Password (legacy) | the token URL, the client ID, the user's name and password | the same. OAuth 2.1 leaves this grant out: it gives the client the account's password. Use it only where nothing else is offered |

The implicit grant is not offered. The code grant is always sent with PKCE
(`S256`), with a client secret or without one.

**Register the redirect URI.** For the code grant the provider must know
where to send the sign-in window back: the Auth tab shows the address,
`<the app's address>oauth/callback` (`https://wayfarer.ashwinsathian.com/app/oauth/callback`
on the hosted app). Register exactly that with your
client.

**The sign-in window.** The provider sends the window back to a small page
of the app, which hands the code to the tab that asked and closes. That
page loads nothing but its own script and style, and stores nothing. The
app takes an answer only when it carries the `state` value the app made
for this sign-in; anything else is ignored, and the Auth tab says that
something was. The app cannot see the window close: **Cancel sign-in**
ends the wait, and so do five minutes. If the browser blocks the window,
allow pop-ups for the app and choose Get token again.

**The client secret** goes to the token endpoint in a Basic header, which
every provider must accept, or in the request's body if you choose
"Request body". A client with no secret (a public client) is named in the
body.

**Where the token is kept.** With the vault unlocked, the token and its
refresh token are a vault secret, encrypted like any other and listed
under Manage secrets as "OAuth 2.0 token" with the grant, the token URL,
the client ID and the scope: that name is how the app finds it again, and
it holds no secret. With the vault locked, or with no vault, the token is
in this tab's memory only and is gone when the tab closes or reloads.
Nothing else stores it: history holds `Bearer ***`, and so does every
export and copy, "with credentials" included. A script is shown the mask
too. **Forget token** removes it from memory and from the vault.

One token serves every request whose auth has the same grant, token URL,
client ID and scope (and user, for the password grant), in a collection's
settings or in a request's own Auth tab. A request that inherits OAuth 2.0
from its collection or folder gets and shows the token in its own Auth
tab.

**Renewal.** A token whose time is up is renewed when the request is
sent: with its refresh token if it has one, otherwise by asking again
(Client Credentials and Password). A provider that gives a new refresh
token with each renewal has the old one replaced. When a token of the code
grant cannot be renewed, the send is refused with a message and you sign
in again. **"On a 401, get a new token and send once more"** does that
when the server refuses a token the app still thought good; the response
you see is the second one.

**Token requests are sent like your own requests**: from the page, or
through the Local Bridge when it is on, with the request timeout from
Settings. They are not written to history. Sent from the page, a token
endpoint must allow the app's origin (CORS); many do not. See
[`browser-limits.md`](browser-limits.md#oauth).

**The page must be served over https, or from localhost**, for the code
grant: PKCE uses the browser's own cryptography.

**A copied command carries no token.** "Copy as cURL" and the request as
code write the request without an `Authorization` header: the token is
fetched when a request is sent, and it is kept like a vault secret. The
response's own Export menu writes the request as it was sent, with
`Bearer ***`.

**Not built:** the implicit and device grants, a token sent in the query,
a header prefix other than `Bearer`, `audience` and `resource` parameters,
and the provider's discovery document. Not checked by hand in Safari
itself: the tests run in Playwright's WebKit.

Imported and exported: a Postman file's `oauth2` auth, an Insomnia
export's OAuth 2 auth and an OpenAPI description's `oauth2` security scheme
become this type, each by its grant, and the Postman export writes it back
([`import.md`](import.md), [`export.md`](export.md)). A token held in such
a file is not imported.
