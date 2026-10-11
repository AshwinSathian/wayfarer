# Export: cURL, code and Postman files

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

- **The comment that stands for a command runs nothing.** It is one line
  that starts with `#`, and the name it quotes is in single quotes. bash
  reads the line as a comment. zsh at a prompt does not: it looks for a
  command called `#`, finds none, and has expanded nothing on the way,
  since a `$(…)` or a backtick in single quotes is text.

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

## A collection or an environment for Postman

<!-- claim:C-057 -->

**A collection.** Right-click a collection and choose **Export for
Postman…**. The file is a Postman Collection v2.1 file
(`<name>.postman_collection.json`), which Postman, Newman and most other
API clients read.

| In the app | In the file |
|---|---|
| The collection's name and description | `info` |
| Its variables | `variable`; one that is switched off is `disabled` |
| A folder, in a folder | an item that holds items |
| Auth of the collection, a folder or a request | `auth`: `bearer`, `basic`, `apikey`. "No auth" is `noauth`. "Inherit from parent" is no `auth` at all, which is how Postman says it |
| A pre-request and a post-response script, at each of the three levels | `event`: `prerequest` and `test` |
| The address | `url`, as typed and in the parts Postman sends by. A `{{variable}}` stays as typed. The query is the one in the address; a Params row that is switched off is there too, `disabled` |
| Headers | `header`; a row that is switched off is `disabled` |
| A text body, with its language | `body.raw` and `body.options.raw.language` |
| A form | `body.urlencoded` |
| A multipart form | `body.formdata`; a file part is `type: "file"` with the file's name as `src` |
| A file body | `body.file.src`, the file's name. The type you gave it is written as a `Content-Type` header, since that is where Postman has it |

The dialog lists, before the file is written, what Postman's format has no
place for:

- **Assertions** (the rows of the Tests tab). Postman has tests only as
  scripts.
- **A folder's variables.** They are written (`variable` on the folder),
  and the app reads them back, but Postman's runner does not read them
  (checked with Newman 6.2.3): move them to the collection or to an
  environment there.
- **Files.** A file is named, not included. Choose it again in Postman, or
  run Newman in the folder that holds it.

**Masking** is that of the app's own collection file: a token, password or
key you typed is written as `***` unless you tick "Include credentials",
and a `{{variable}}` is left as the reference it is. A vault secret is
never written: what the file holds of one is its `{{$secret.…}}` reference,
which means nothing to Postman.

**It is tested by running it.** A collection with every body mode, and
with auth and scripts at all three levels, is exported; Newman, Postman's
own runner, runs the file against a local server, and its 26 test results
are the ones the app's engine gives for the collection itself. The tests
assert what the server received, so the same results mean the same
requests were sent.

**It comes back as it went.** Every one of the 51 Postman collections the
importer is tested with ([`import.md`](import.md)) is imported, exported
as a Postman file and imported again, and is the same collection. A
collection made in the app comes back the same but for what the list above
names, and for a file body's type, which comes back as a header row.

**An environment.** In the Environments panel, **Export environments**,
then "File for: Postman". A Postman environment file holds one
environment, so the dialog asks which. A protected variable is of
Postman's type `secret`; its value is left out, or written in plain text
after you type the confirmation. "With the vault" is not offered: a
Postman file has no place for the vault.
