# Import

Every file reaches the app by one road, whichever Import button you press
(the Collections panel, the Environments panel, or Settings):

1. **Read.** The page reads the file, at most 10 MB of it. A larger file is
   refused before it is parsed.
2. **Map and check.** The text goes to a worker, which works out the
   format from the file's content, turns it into the app's own model, and
   checks every field against what the app itself writes. The page stays
   responsive while a large file is read. The worker fetches nothing: a
   file that refers to another file or to an address is not followed.
3. **Report.** A dialog shows what the file is, what it will add (how many
   collections, folders, requests and environments), and what of it could
   not be kept. **Nothing is stored yet.** <!-- claim:C-054 -->
4. **Confirm.** *Import* stores it: each collection in one transaction, all
   of it or none. *Cancel*, Escape or closing the dialog stores nothing.

## What the report warns about

- **A script that uses something the app does not have.** Each script of
  the file is searched for the parts of Postman's script API that
  [`postman-compatibility.md`](postman-compatibility.md) lists as not
  supported (`pm.cookies.jar`, `pm.visualizer.set`, `require('xml2js')` and
  so on). The warning names the request, folder or collection and what was
  found. The script is imported as it is, and would end in an error at that
  call. The search reads text: a name in a comment or in a string is found
  too. `pm.sendRequest` with a form or a file as its body is not looked
  for, since the text does not say which body a call is given.

More kinds of warning arrive with the formats that need them (an auth type
or a body mode the app does not have, a field that is dropped).

## What an import never does

- **It does not approve scripts.** An imported collection is untrusted, and
  its scripts, its folders' and its requests' do not run until you have
  read them in the review dialog ([`scripts.md`](scripts.md)).
- **It does not fetch.** Nothing is requested from the network for an import.
- **It does not store before you confirm.**

## Formats

| Format | Recognised by | Notes |
|---|---|---|
| Wayfarer collection | `"$id": "wayfarer/collection/3"` | See [`collections-schema.md`](collections-schema.md). "Import as duplicate" stores it under new ids beside the collection it came from; otherwise a collection, folder or request here with the same id is replaced. |
| Wayfarer environments | `"$id": "wayfarer/environments/2"` | Each environment is added, or replaces the environment of the same name: the report lets you choose per environment. |
| Postman collection, v2.0 or v2.1 | it has `item`: the list of requests and folders | See below. A Collection v1 file is refused with a message that says to export v2.1 from Postman. |
| Postman environment or globals | `values`, each with a `key`; or the bare list of them an older Postman wrote for globals | One environment. See below. |
| HAR 1.2 | `log.entries` | One request per entry, in the file's order, in a new collection "Imported from HAR". See below. |
| cURL command | the text starts with `curl` | One request, in a new collection "Imported from cURL". See below. |

## A cURL command

<!-- claim:C-056 -->

Two ways in:

- **Paste it into the address field.** The composer becomes the request
  the command describes: method, address, headers, body, and Basic auth
  from `-u`. Nothing is stored; it is a new request, and a saved request
  that was open is no longer what Save writes to. What the command asked
  for that the app does not do is listed under the address until you send.
  Text that does not start with `curl` is pasted as text.
- **Import it.** The terminal button in the Collections panel opens the
  import dialog with a box for the command. It then takes the road above:
  a report, and on Import a collection with the one request.

The command is **read, never run**, and no file it names is opened.

| In the command | Becomes |
|---|---|
| `-X`, `--request` | the method, in upper case |
| `-H`, `--header` | a header row |
| `-d`, `--data`, `--data-raw`, `--data-binary`, `--data-ascii` | the body. Without a `Content-Type` of its own it is a form, as curl sends it; several are joined with `&` |
| `--data-urlencode` | a form field, in each of curl's forms (`name=content`, `=content`, `content`) |
| `-F`, `--form`, `--form-string` | a multipart part; `name=@file` is a file part |
| `-u`, `--user` | Basic auth in the Auth tab |
| `-b`, `--cookie` | a `Cookie` header row, which the composer's note says a browser will not send |
| `-A`, `-e` | `User-Agent` and `Referer` rows |
| `-G`, `--get` | the data goes into the query |
| `-I`, `--head` | `HEAD` |
| `--url` | the address |
| `--compressed` | left out, with a note: the browser asks for a compressed answer by itself |
| `-k`, `--insecure` | left out, with a warning: a browser always checks the certificate, and the Local Bridge cannot skip the check yet |
| `-o`, `--max-time`, `--proxy` and other options with a value | left out with their value, and said |
| an option the app does not know | left out, and said |

**A file is named, not read.** `--data-binary @pixel.png` and
`-F 'upload=@report.pdf'` give a body or a part that names the file; choose
it again in the Body tab. `-d @file`, `-F 'x=<file'` and `-b cookies.txt`
would read a file's text: that part is left out, and said.

**Quoting.** Both shells a browser writes for are read: bash (single
quotes, double quotes, `$'…'` with its escapes, a backslash at a line's
end) and cmd (`^` before a character and at a line's end, `\"` and `""`
inside double quotes). Nothing is expanded: `$HOME` and a backtick are
that text. A command is read as cmd when it escapes with `^` and has no
single quote.

A command written by the app's own "Copy as cURL" is read back as the same
request; a test generates requests of every body mode and checks it.

## A HAR file

Each entry's request becomes a request named for its method and path:
the method, the address, the headers (HTTP/2's `:authority` and the other
pseudo-headers are left out; a cookie that was sent is in its `Cookie`
header), and the body: a form's fields, a multipart form's parts, or text.
The responses and the timings are not imported. A binary body (base64 in
the file) is left out, and a multipart body that the file holds only as
text is kept as that text; the report says so for each.

## A Postman collection

<!-- claim:C-058 -->

A Postman Collection v2.0 or v2.1 file becomes a collection, under new ids.

| In the file | Becomes |
|---|---|
| `info.name`, `info.description` | the collection's name and description |
| `variable` | the collection's variables; one that is `disabled` is switched off |
| a folder, in a folder | a folder. A folder's `variable` is its variables |
| `auth` of the collection, a folder or a request | the auth, for `bearer`, `basic`, `apikey` and `noauth`. **No `auth` at all is "Inherit from parent"**, as in Postman |
| `event` | the scripts: `prerequest` and `test`, at each of the three levels |
| `url` | the address, put together from the parts Postman sends by (`raw` when the file has no parts). The query is in the address |
| `header` | header rows; v2.0's headers as one text are read line by line |
| `body` | `raw` with its language, `urlencoded`, `formdata`, `file`. Every part the file holds is kept, and `mode` says which is sent |
| a description of a folder or a request | kept, and written back by an export. The app does not show it yet |

What the report says could not be kept:

- **An auth type the app does not have**: OAuth 2.0 and AWS Signature
  until they are built, and Digest, NTLM, Hawk and OAuth 1.0. It is left
  out and the request is sent with no auth. It does not start to inherit:
  that would send another level's credentials where the file had its own.
- **A path variable** (`/users/:id`). The app has `{{variables}}` only. One
  with a value in the file is replaced by the value; one without becomes
  `{{id}}`, which the composer asks you for before it sends.
- **A query parameter that is switched off.** It is kept and an export
  writes it back, but the composer has no switch for a parameter: it does
  not show one, and saving the request there drops it.
- **A GraphQL body.** It is kept as the JSON text it is sent as.
- **Files.** A file is named, not included: choose it again in the Body tab.
- **Saved responses** (examples). The app keeps responses in its history.
- **A request with no address**, or with a method that is not an HTTP
  method. It is left out.
- **The order of a folder's contents**, where requests stand before
  folders: the app lists a folder's folders first.
- **A script that uses what the app does not have**, as for every import.

Not read, and not in the report: a request's own settings in Postman
(`protocolProfileBehavior`: redirects, certificate checks), the type of a
single form part, and a script that is given by a file's name (`src`).

**Scripts are imported, not approved.** They wait for your review like the
scripts of any imported collection.

**It is tested with files other people wrote**: all of Newman's own
integration collections, six of Adyen's API collections and Microsoft
Graph's, 51 collections and 12 environments. Each imports. Each
collection, exported as a Postman file ([`export.md`](export.md)) and
imported again, is the same collection. And twelve of Newman's collections
are run, as imported, by the app's engine against a local server, and give
exactly the test results Newman gives for the files themselves. The others
are listed with the reason each is not compared: 15 that Newman cannot run
without another server, a data file or a file to upload; 11 that use what
the app does not have (an auth type, a library); and 7 where the app's
engine differs from Newman in a way that is a known fault, not a missing
feature ([#248](https://github.com/AshwinSathian/wayfarer/issues/248)): a
variable whose name holds a slash, `return` outside a function, a number
kept as a number between requests, and three parts of Postman's older
sandbox.

## A Postman environment or globals file

<!-- claim:C-058 -->

Becomes one environment: its `values`, one that is switched off as a row
that is switched off. **Postman's globals become an environment too**,
named "Postman globals", and the report says so: an import adds, and does
not write over the app's own globals. Choose it as the active environment,
or copy what you need.

A file that starts with a byte order mark is read, and so is one in
UTF-16, which Postman on Windows has written.

A file of any other format is refused with a message that names these. A
workspace backup (`wayfarer/workspace/3`) is not imported here: it replaces
everything, and is restored in Settings.

A file that says it is one of these formats and is not what the app writes
is refused whole, with each wrong field and its path.
