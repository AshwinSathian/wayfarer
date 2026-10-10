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

A file of any other format is refused with a message that names these. A
workspace backup (`wayfarer/workspace/3`) is not imported here: it replaces
everything, and is restored in Settings.

A file that says it is one of these formats and is not what the app writes
is refused whole, with each wrong field and its path.
