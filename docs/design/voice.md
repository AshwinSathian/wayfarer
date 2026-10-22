# Voice

How Wayfarer's interface words things: what it calls each thing, how it
says an error, asks a question and explains a limit, which case a label
takes and how a shortcut is written. This is D2.2 of
[the design plan](../../PLAN-design.md). Every string written from D4-d on
follows it; each view's session rewrites that view's strings as it
rebuilds the view. The guide changes no string by itself.

The person reading is at work. They came to send a request, and every word
between them and the response costs them a moment. The app says what is
true, in the words they already use, and stops.

## Words

**One name for each thing, the same everywhere.** A person who reads
"request" in the tree and "call" in a dialog asks whether they are two
things.

| Say | Not | Note |
|---|---|---|
| request | call, item, entry | What is sent. "Item" only when the sentence covers requests, folders and collections at once, and then name the kind when it is known. |
| response | result, reply | What came back. |
| collection, folder | workspace, project, group | |
| address | URL, endpoint, link | The field holds variables (`{{baseUrl}}/pets`), so it is not always a URL yet. "URL" stays in a format's own name ("URL-encoded"). |
| environment | profile, context | |
| variable | parameter, placeholder | A query's key and value are a *parameter*; "Params" is the tab's name. |
| secret | password, credential | A value kept in the vault. "Credentials" is what an auth type holds: a token, a key, a password. |
| vault | keychain, store | Locked or unlocked, never "closed". |
| passphrase | password, PIN | The vault's. |
| history | log, activity | Requests sent from this browser. |
| tab | page, window | |
| run | test run, execution | A collection run. Its parts are requests and tests. |
| Local Bridge | bridge app, proxy, agent | Its name, with capitals. "The bridge" after the first mention in a pane. |
| route | path, mode | How a request leaves: from the page, or through the Local Bridge. |
| import, export | upload, download, load | "Download" only for a file the browser saves. |

Use the plain word. "Use", not "utilise"; "is", not "serves as"; "can",
not "is able to". A term of the trade stays when the reader knows it:
header, body, query, status, cURL, CORS, OAuth 2.0, HAR.

Names of other things keep their own spelling: Postman, Insomnia, OpenAPI,
cURL, GraphQL, WebSocket, JSON, YAML, HTTP, macOS. Wayfarer is written in
British English, as its docs are: colour, organise, licence (the noun).

No contractions: "cannot", "does not", "is not", as in the docs. No "please",
"sorry", "oops" or exclamation marks. No "simply", "just" or "easily": if
it were simple, it would not need saying. The app does not speak as "I" or
"we"; it says what happens ("The request was saved"), and addresses the
person as "you" only where a sentence needs a subject.

## Case

**Sentence case for every label: buttons, menu items, tabs, headings,
dialog titles, tooltips, the palette's commands, column headers and the
names of fields.** Only the first word and proper names take a capital:
"New collection", "Add header", "Copy as cURL", "Save changes",
"Settings › Local Bridge". This decides U-054.

No label is drawn in capitals by CSS (`text-transform: uppercase`), and none
is letter-spaced to look like a heading: a section's name is a heading in
sentence case ("Collections", not "COLLECTIONS"). An HTTP method is the
exception: `GET` and `POST` are written so by the protocol.

A label ends without a full stop. A sentence ends with one, also in a
tooltip, so that a tooltip of one phrase ("Copy as cURL") and one of two
sentences can be told apart.

## Buttons and menu items

A button says what it does, as a verb and, if it is not obvious, what it
acts on: "Send", "Save", "Add header", "Delete request". Never "OK",
"Yes", "Submit" or "Proceed": a person who reads only the button must
know what happens.

An item that asks for more before it acts ends in an ellipsis, one
character (…): "Import…", "Export…", "Run…". One that acts at once has
none: "Duplicate", "Delete" (which then asks; the question is not "more").

A pair of buttons in a dialog is the action and "Cancel", the action on the
right as the filled button. When the action cannot be undone, its button
is the danger tone, and the dialog's text says so.

A shortcut is never written inside a label ("New Tab (Alt+T)"): it is shown
beside it (see [Shortcuts](#shortcuts)).

## Saying an error

An error says what happened, then why if the app knows, then what to do.
It names the thing it is about. It does not apologise, blame the person,
or say "Error:", "invalid", "failed to" or "something went wrong".

- **What happened**, as a fact in the past tense or a state: "The request
  did not reach the server." "This file is not a collection."
- **Why**, only what the app knows. When the browser hides the cause,
  say so and list what it can be, most likely first; do not guess one.
- **What to do**, as an action the person can take now, best as a button
  beside the text ("Send through the Local Bridge"), else as a sentence.

A server's own words are quoted as they came, in monospace, apart from the
app's: the app's sentence explains, the server's text is evidence.

An error stays where it happened: under the field it is about, in the
response pane for a send, in the dialog for an import. It is not a toast
that leaves before it is read.

## Asking a question

A confirmation asks a question that names the thing and the act: "Delete
the request Health?", "Delete the folder Pets and its 3 requests?". Its
text says what follows that is not obvious ("This cannot be undone." only
when it cannot). Its buttons are the act ("Delete") and "Cancel"; focus
starts on Cancel, as `Confirm` does.

Ask only when the act loses something. A thing that can be undone is done
at once.

## Explaining a limit

A limit says the number with its unit, why it is there in a clause, and
what to do instead. A limit the person did not reach is not mentioned.

"A file in a request body can be 50 MB at most." is the pattern: the
number, then (when it is the person's file) the size they had.

## Empty states

An empty place says, in one line, what will be there, and offers the step
that fills it as a button. It does not say "nothing here" or "no items",
and does not draw a dashed box around nothing. Where there are two ways to
fill it (write one, or import one), it offers both.

## States and numbers

A state is a fact of two or three words: "Vault locked", "Saved in this
browser only", "Sending…". A number has its unit after a space: "16 ms",
"2.4 kB", "50 MB". Thousands take a comma: "1,440 px". A count is written
in figures ("3 requests"), and its noun agrees with it ("1 request").

## Shortcuts

**The app shows the keys of the system it runs on, and only those.** On a
Mac, the symbols, with no plus: ⌘K, ⌥T, ⌘↵, ⌘S, ⇧F10. Elsewhere, the
names, joined by a plus: Ctrl+K, Alt+T, Ctrl+Enter, Ctrl+S, Shift+F10. A
single key is its name: Enter, Escape, Delete, C. Today's "⌘K / Ctrl+K",
both systems at once, is retired: half of it is always wrong for the
reader.

A shortcut is shown where its control is: as keycaps (`<kbd>`) after a
tooltip's text ("Send request ⌘↵"), at the right of a palette's command and
of a menu's item, and in Settings › Shortcuts. The control also carries
`aria-keyshortcuts`, so a screen reader announces it.

The docs, which do not know the reader's system, write both, the Mac's
first: "⌘↵ or Ctrl+Enter".

## The twenty most-shown strings

**How they were chosen.** Each of the 49 screens of the design baseline
([`baseline/index.md`](baseline/index.md)) was opened at 1,440 × 900 in
the light theme, on `main` at `89cac7c`, and every string drawn on it was
listed: the text of each element, and each field's placeholder.
Accessible names that are not drawn (an icon button's) were left out, and
so were the screens' own data (the seeded collection's names, the
methods, the echo server's address). The twenty below are the strings
drawn on the most screens; the count is how many of the 49 show each.

| # | Screens | Today | Rewritten | Why |
|---|---|---|---|---|
| 1 | 49 | COLLECTIONS | Collections | Sentence case; no capitals by CSS. |
| 2 | 49 | Route: Auto | Route: auto | A setting's value is a word in a sentence, not a name. |
| 3 | 49 | Vault locked | Vault locked | Kept: a state in two words. |
| 4 | 49 | Secrets | Secrets | Kept. |
| 5 | 49 | Saved in this browser only | Saved in this browser only | Kept: the fact a person needs, and no more. |
| 6 | 49 | No environment | No environment | Kept: a select's value, not an empty state. |
| 7 | 48 | https://api.example.com/v1/endpoint, or paste a cURL command | Type an address, or paste a cURL command | The field has no visible label: its placeholder says what to do with it. |
| 8 | 47 | Params | Params | Kept: the word every API client uses for the query's parameters. |
| 9 | 47 | Headers | Headers | Kept. |
| 10 | 47 | Auth | Auth | Kept: the trade's short form, as Postman's tab. |
| 11 | 47 | Scripts | Scripts | Kept. |
| 12 | 47 | Settings | Settings | Kept. |
| 13 | 46 | Send | Send | Kept; its tooltip shows its keys ("Send request ⌘↵"). |
| 14 | 39 | value | Value | Sentence case. |
| 15 | 38 | name | Name | Sentence case. |
| 16 | 38 | Bulk edit | Edit as text | Says what it does: the rows become lines of text. |
| 17 | 38 | Add Header | Add header | Sentence case (U-054). |
| 18 | 38 | Send a request to see the response here | Send a request and its response shows here. With two buttons: Paste a cURL command, Import… | An empty state offers the next step, as buttons (U-022). |
| 19 | 27 | New request | New request | Kept: the name of a tab whose request has none. |
| 20 | 23 | No collections yet. Create one to organise your requests. | Requests you save are kept here, in collections. With two buttons: New collection, Import… | Says what goes there, and offers both ways in. |

## More examples

What each part of the guide does to strings the app shows today.

| Kind | Today | Rewritten |
|---|---|---|
| Error | 0 Unknown Error. The host may not resolve (DNS), may have refused the connection, or may not allow cross-origin requests from this site (CORS). The browser does not reveal which. | The request got no response. The browser does not say why: the name may not resolve, the server may have refused the connection, or it does not allow requests from this site (CORS). Send it through the Local Bridge to see which. |
| Error | Enter a URL first to copy as cURL | Type an address to copy the request. |
| Error | The file is larger than 10 MB. | This file is {size} MB. A file to import can be 10 MB at most. |
| Question | Delete item? This action cannot be undone. Continue? (Proceed, Cancel) | Delete the request Health? This cannot be undone. (Delete, Cancel) |
| Limit | The file is not JSON, and at more than 1 MB it is too large to be read as YAML: a YAML file takes far more memory to read than a JSON file of its size. If it is YAML, convert it to JSON and import that. | This file is not JSON, and a YAML file can be 1 MB at most: reading YAML takes far more memory than JSON. Convert it to JSON and import that. |
| Menu | New Folder, New Request, Export with credentials | New folder, New request, Export… |
| Palette | New Tab (Alt+T) | New tab, with ⌥T (or Alt+T) at its right |
| Settings | ⌘K / Ctrl+K: Open the command palette | Open the command palette, with ⌘K (or Ctrl+K, by system) as keycaps |
