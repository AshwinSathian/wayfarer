# Review before taking a change

> D4.8, flow 5 of 5. Designed, not built. Principles and open questions:
> [`README.md`](README.md). Prototype: [`prototypes/review.html`](prototypes/review.html).

## The job

Someone else changed a shared collection: a teammate's edit arrived, a
`git pull` changed the folder, a newer file came. Before it changes
anything here, the person sees what it changes, request by request and
field by field, with what matters for safety on top (a new host, a script),
and takes all of it, some of it, or none.

This view is the one diff of the app. [`receive.md`](receive.md) uses it
for a file of a known collection, [`history.md`](history.md) draws it
read-only for a past change, and [`conflict.md`](conflict.md) adds a third
column to it.

## Entry points

- **The sidebar row's count:** "Team server: 3 to review" or "Folder: 2
  changed" is a button that opens the review.
- **The Changes drawer's To review group:** Review….
- **Receive's report** for a file or link of a collection this browser
  has: Review changes.
- **A tab whose request changed under it** (any way): a banner above the
  composer, "Ana Ruiz changed Create order. Your tab still has the version
  you opened." with **Review…**. The tab is not touched.
- **Palette:** Review changes to {collection}.

It opens as a `ui-dialog` titled **Changes to Shop API from Ana Ruiz**
(or "from the folder", "from shop-api.wayfarer.json"), wide (960 px, as
the review of scripts is 760 px) because a diff needs width.

## When changes arrive, by way

### Folder (Git)

The app checks the folder when the window gains focus and every 5 seconds
while it is visible (D1.6; there is no file watching in a browser). It
compares each file's SHA-256 with the digest it last wrote or read. A
difference is a change to review: "Folder: 2 changed". A file the format
does not name is ignored; a file of the format that fails validation is
listed in the review as "Cannot be read" with its first issue, and not
taken. A whole-folder change, like a branch switch, is one review: "14
requests changed in the folder." The app does not know why it changed.

### File and link

A file or link of a collection this browser has goes to the review from
the import report. The base is the last version taken from a file or link
(the `bases` store); without one (the collection was made here), the
review compares with the collection as it is and says "Compared with your
collection as it is now: you have not taken a file of it before."

### Peer to peer and team server

A change arrives signed and encrypted; it is verified, decrypted and kept
as `held` (TQ6). The sidebar row's count goes up, and a polite live region
says "A change to Shop API from Ana Ruiz to review." Changes from one
author in a row are one review; from several, the dialog has one section
per author, in the order they were made.

With "Take changes as they arrive" set for the collection (its Settings,
off by default), a change is taken at once unless it touches a script, an
auth, a request's host or a protected variable; those are held.

## The view

From the top:

1. **The summary**, one line: "Changes 3 requests, adds 1, removes none."
2. **To look at first**, only when there is something, each a line with
   its request named:
   - **New host:** "Create order would go to `api.shop-staging.example.com`
     instead of `api.shop.example.com`. It sends the vault secret token."
     (Or "a credential" for a typed one.) This is principle 5.
   - **Scripts:** "2 scripts are new or changed. They will not run until
     you trust them." with **Review scripts…**.
   - **Auth:** "Create order's auth changes from Bearer to Basic."
   - **Secrets:** "Uses 1 secret you do not have: refreshToken."
3. **One section per request**, in the tree's order: the method and the
   request's name, the folder, and "Changed", "Added", "Removed" or
   "Moved to {folder}". Under it, one row per changed field:
   - A one-line value (address, method, a header's value, a variable):
     **Before** and **After**, each in monospace, the changed characters
     marked with an underline and a background, not by colour alone, and
     the words "Before" and "After" written.
   - A row list (headers, params, variables): one line per row added
     ("Added header `X-Request-Id`"), removed, or changed.
   - A text (a body, a script): a unified diff, lines prefixed with `+` and
     `-` as text, three lines of context, long ones collapsed ("12 lines
     the same").
   - A masked value is `***` on both sides with "Changed" when the
     reference or the share says it changed; the app never shows a value it
     did not have.
   Each section has a checkbox **Take this change** (checked).
4. **The foot:** **Take nothing** (closes; the changes stay held, or for a
   file, nothing is stored), **Decline** (only for peer and server: marks
   them declined; others are not told), and the filled **Take {n}
   changes**. With one section unticked the button counts the rest.

Taking writes each ticked request in one transaction per collection,
records the new base, marks the changes `taken`, and in the Folder way
updates the stored digests (the files are already the new ones). Taking
some of a folder's changes and not others leaves the folder and the app
different: the row then says "Folder: 1 not taken" and the review keeps
offering it. The app does not write the folder back to undo a pull.

A ticked request that has an unsaved tab is not overwritten: its section
says "You have unsaved edits to this request in a tab." and the button
for it is **Compare…**, which goes to [`conflict.md`](conflict.md).

## Strings

| Where | String |
|---|---|
| Dialog title | Changes to {collection} from {name} · from the folder · from {file name} |
| Summary | Changes {n} requests, adds {n}, removes {n}. ("none" for 0) |
| Section heading | To look at first |
| New host | {request} would go to {new host} instead of {old host}. It sends the vault secret {name}. |
| Scripts | {n} scripts are new or changed. They will not run until you trust them. |
| Auth | {request}'s auth changes from {type} to {type}. |
| Secret missing | Uses 1 secret you do not have: {name}. |
| Field labels | Before · After |
| Row change | Added header {name} · Removed header {name} · Changed header {name} |
| Collapsed lines | {n} lines the same |
| Unsaved tab | You have unsaved edits to this request in a tab. |
| Checkbox | Take this change |
| Buttons | Take nothing · Decline · Take {n} changes · Compare… |
| Base missing | Compared with your collection as it is now: you have not taken a file of it before. |
| Tab banner | {name} changed {request}. Your tab still has the version you opened. |
| Done | Took 3 changes to Shop API. (polite live region) |

## Errors and empty states

| Case | String | Action |
|---|---|---|
| The change is the same as what is here | Nothing to take: Shop API already has these changes. | Close |
| A folder file cannot be read | {path} cannot be read: {issue}. It is left out; the other changes can be taken. | |
| A file was changed again while the review was open | {path} changed again while you were reading. The review now shows its latest content. | (the section redraws; its checkbox is reset to checked and announced) |
| Write fails | The changes were not taken: the browser refused to store them ({reported}). Nothing here changed. | Try again |
| Vault locked, a peer change cannot be decrypted | Unlock the vault to read 3 changes to Shop API. | Unlock the vault |

## What is stored

Nothing until Take. Then: the requests, folders and collection as taken;
the `bases` record (`collectionId`, `version`: the change id, the file's
digest or the folder's digest list, `content`: the collection as taken);
each change's `state`; for the Folder way, the `Share.files` digests. A
change taken never sets `scriptTrust.approved`.

## Claims it adds

| Claim | Test that would prove it |
|---|---|
| A change from another person is not written until the person here chooses Take, and Take nothing writes nothing. | e2e per way: a change arrives; read the stores; unchanged; Take; changed. |
| A change that makes a request with a vault secret or a credential go to another host is listed under To look at first before it can be taken. | Unit test of the review's model over fixtures; e2e for one way. |
| Taking a change never approves a script. | e2e: take a change with a new script; send; the script is held and Review scripts opens. |
| An unsaved tab is never overwritten by a change. | e2e: edit a tab, receive a change to its request, take all; the tab's draft is as typed. |

## Accessibility

- **Keyboard path:** the sidebar count is a button (Enter). Focus starts
  on the summary heading, so the screen reader reads it; Tab goes through
  To look at first (its buttons), then each section's checkbox, then the
  foot. Each section's heading is an `h3`, so a screen reader's heading
  keys jump between requests.
- **What is heard:** a field row is read as one sentence: "Address.
  Before: {old}. After: {new}." A text diff is a `<pre>` whose lines begin
  with "+" or "-" as characters, which a screen reader reads; the
  accessible name of the block is "Pre-request script, 3 lines added, 1
  removed".
- **Colour:** added and removed are marked with `+`/`-`, the words, and an
  underline, never by green and red alone; in forced colours the
  background is dropped and the marks remain (CLAUDE.md's rule for forced
  colours).
- **Live regions:** arrivals and the done line are polite; an error in the
  dialog is `role="alert"`.

## At 390 px

The dialog is full width. Before and After stack, Before first, each with
its word. A text diff scrolls sideways inside its own box
(`overflow-x: auto`, the box itself no wider than the dialog), as the
script review's code does. The foot's buttons wrap, Take on the right of
the last line. Nothing is wider than 320 px.
