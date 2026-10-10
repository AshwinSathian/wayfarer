# Export: cURL and code

The button beside the address copies the request in the composer, as it
would be built now: `{{variables}}` replaced, the auth it would be sent
with (its own or inherited), and the `Content-Type` its body implies.

| Menu item | What is copied |
|---|---|
| Copy as cURL | A `curl` command for a POSIX shell, credentials masked |
| Copy as cURL with credentials | The same, with the credentials you typed |
| Copy as JavaScript (fetch) | Code for Node 20 or a browser, masked |
| Copy as Python (requests) | Code for the `requests` library, masked |
| Copy as HTTPie | An `http` command, masked |

The response's **Export** menu copies the request that was sent, as cURL.

## The body, in every mode

<!-- claim:C-020 -->

| Body | cURL |
|---|---|
| None, or a `GET` or `HEAD` | nothing: the app sends no body with those either |
| Text (JSON, XML, …) | `--data-raw '…'` |
| Form | one `--data-urlencode 'name=value'` per field that is switched on |
| Multipart | `--form-string 'name=value'` for a text part, `-F 'name=@"file name"'` for a file |
| File | `--data-binary '@file name'` |

`HEAD` is written as `--head`: with `-X HEAD` curl sends the method and then
waits for a body that never comes.

**A file is named, not embedded.** The command says `@report.pdf`; run it
in the folder that holds the file. The app does not read a file to copy a
command.

Run by bash, the command sends what the app sends: the same method, path
and query, the headers the request sets, and the same body. This is tested
for twelve requests that cover every mode, against a local server. What
differs is what each sender adds by itself: `User-Agent`, `Accept`, the
browser's `Origin` and `Sec-Fetch-*`, the boundary of a multipart form, and
a file part's type, which curl guesses from the file's name. A form's
spaces are `%20` from curl and `+` from the app; a server reads both alike.

## What you typed is never read as something else

Every value is written so that the shell and the tool take it as text:

- In a shell command, each argument is in single quotes, and a quote in
  your text is closed, escaped and opened again. `$(…)` and backticks in a
  body are text.
- `--data-raw` and `--form-string` are used where `-d` and `-F` would read a
  value that starts with `@` as the name of a file to send.
- In code, a value is a string literal.
- **HTTPie** reads `name=@path` as a file and `name==value` as a query
  parameter, and has no way to mark a value as text. When a header's or a
  multipart text part's value starts with `@` or `=`, no command is copied:
  a comment says why and points to cURL. A form is sent as its encoded text
  with `--raw`, for the same reason.

- **A name or an address cannot become an option or a file either.** curl
  splits a multipart part at the first `=` in it and reads what follows by
  its own rules, so a part *named* `x=@/etc/passwd;` would send that file.
  For a part whose name holds `=`, `;`, a quote or a line break, no curl
  command is copied: a comment says why. An address that starts with `-`
  is given to curl as `--url '…'`. HTTPie reads its method, its address
  and its items by position, so when one of them starts with `-` no HTTPie
  command is copied.

This matters most for a request that came from someone else's file: its
names and values are theirs, and the command is run on your machine.

## Masking

<!-- claim:C-055 -->

As everywhere something leaves the app ([Trust Center](trust-center.md)):
a credential (the auth's token, password or key, and any credential
header) is copied as `***` unless you choose "with credentials", which only
the cURL items offer. A vault secret is never read for a copy from the
composer: its `{{$secret.…}}` reference is what the request holds there,
and in the export of a sent request its value is masked.

The generated code is text. The app runs none of it. The Python and HTTPie
output is checked against stored snapshots; the `fetch` code and the cURL
command are run in the tests.
