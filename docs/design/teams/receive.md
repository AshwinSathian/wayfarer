# Receive

> D4.8, flow 2 of 5. Designed, not built. Principles and open questions:
> [`README.md`](README.md). Prototype: [`prototypes/receive.html`](prototypes/receive.html).

## The job

A person was sent a collection: a file, a link and a code, a folder in
their repository, or an invite. They want it in Wayfarer, working, without
running anything they have not read and without guessing which of their
own collections it might replace. Receiving is the first time a collection
arrives; every later arrival is [`review.md`](review.md).

## Entry points

- **A link or an invite, opened.** The app reads the fragment after `#`,
  removes it from the address bar (`history.replaceState`), and opens the
  Receive dialog over whatever was open. The fragment stays in the
  browser's own history list; the docs say so.
- **Sidebar, Import menu:**
  - **File…** (today's): a Wayfarer file from Share goes through
    `ImportPipeline` as any import does, with today's report.
  - **Folder…** (new): Chromium's folder picker, or the Local Bridge's
    folder elsewhere.
  - **Invite…** (new): a field to paste an invite or a link that came as
    text and was not clicked (a link in a document, say).
- **The empty sidebar** ("Requests you save are kept here, in
  collections.") keeps its two buttons; Import… opens the menu above.
- **Palette:** Import a folder…, Open an invite….

## Step by step, by way

### File (T1)

Today's import, with three additions to the report:

1. "Sent by Ana Ruiz, as the file says. Wayfarer cannot check it." (only
   when the file names a sender).
2. When the collection's id is one this browser has: the report does not
   offer Replace existing. It says "You have this collection: Shop API.
   Review what this file changes." and **Review changes**, which goes to
   [`review.md`](review.md). Import as duplicate stays, as today.
3. The lines of the share about secrets and scripts, from the receiver's
   side (below, "What every way shows").

### Link (T1)

1. **The Receive dialog**, titled **Open a shared collection**: "Someone
   sent you a collection in this link. It is encrypted; the code they
   sent decrypts it here." The field **Code** (monospace, sixteen
   characters, spaces ignored), and **Open**. A link with the code in it
   skips this step.
2. **The report**, the same as File's: what it adds, sent by, secrets,
   scripts, and the collection's tree with "create new" on each row.
3. **Import** stores it. Cancel stores nothing; the link can be opened
   again.

### Folder, for Git (T2)

1. **Import › Folder…** In Chromium the picker opens at once. Elsewhere
   the dialog **Open a folder** shows the Local Bridge's state, as Share's
   Folder step 1 does.
2. **Reading.** "Reading 16 files…" with a spinner. Each file is
   validated; the format's files only (`collection.json`, a file per
   folder and per request).
3. **The report**, as an import's: "shop-api will add 1 collection, 3
   folders, 12 requests." with secrets and scripts. Plus: "Wayfarer keeps
   this collection in step with the folder. A change in the folder (a pull,
   a branch, an edit) is shown to you before it is taken."
4. **Open** stores it and records the `Share` (way `folder`) with each
   file's digest. The sidebar row reads "Folder: shop-api".

A folder that holds no collection file: "This folder holds no Wayfarer
collection. To start one here, share a collection to it." with **Choose
another folder…**.

### Peer to peer and team server (T3, T4)

1. **The invite opens the Receive dialog**, titled **Join Shop API**:
   "Ana Ruiz invited you to Shop API, shared peer to peer through
   relay.example.com." (or "kept on the team server teams.example.com").
   "Her key: 2B9E 04D1. Check it with her if you were not expecting this."
2. **Your name** (prefilled from Settings › Sharing), and this browser's
   key ("Your key: 7F3A 91C2").
3. **The vault**, as in Share: the space's key is kept as a vault secret.
4. **Ask to join.** "Waiting for a member to let you in. A member must be
   online to do it." with **Cancel**. Peer to peer: the copy comes from a
   member online. Team server: from the server.
5. **Let in.** The report, as an import's, with "Kept in step with the
   team: changes from others are shown to you before they are taken."
   **Open** stores it.
6. **Refused.** "Ana Ruiz did not let you in." The dialog's only button is
   **Close**. Nothing was stored.

## What every way shows before it stores

The report always has these lines when they apply, in this order:

- **Secrets:** "Needs 1 secret you do not have: token. Requests that use
  it ask for it when you send them." with **Add to the vault…** (opens the
  vault's add, the name filled). A secret is matched by name to one this
  vault has: "Uses your secret token." when it is.
- **Credentials:** "2 credentials were not shared and are ***. Type yours
  in Auth." (when the share masked them).
- **Scripts:** "2 scripts came with it. They do not run until you read
  them and trust them." with **Review scripts…**, the existing dialog. Not
  reviewing them now is fine: they are held, and the first send asks.
- **Hosts:** "Its requests go to: api.shop.example.com,
  auth.shop.example.com." (monospace hosts). A receiver should know where
  a collection sends before they send from it.

## Strings

| Where | String |
|---|---|
| Link dialog title | Open a shared collection |
| Invite dialog title | Join {collection} |
| Import menu items | File…, cURL command…, Folder…, Invite… |
| Invite… dialog | Invite or link: (field) "Paste the invite or link someone sent you." (Open, Cancel) |
| Sent by | Sent by {name}, as the file says. Wayfarer cannot check it. |
| Known collection | You have this collection: {name}. Review what this file changes. |
| Folder state | Wayfarer keeps this collection in step with the folder. A change in the folder is shown to you before it is taken. |
| Waiting | Waiting for a member to let you in. A member must be online to do it. |
| Done | Added {collection}. (polite live region; focus moves to its row in the tree) |

## Errors and empty states

| Case | String | Action |
|---|---|---|
| Wrong code | This code does not open the link. Check it with the person who sent it. | (field stays, focused) |
| Link cut short | This link is incomplete: it ends before the collection does. Ask for the whole link, or for a file. | |
| Link of another app or format | This link does not hold a Wayfarer collection. | Close |
| File fails validation | Today's refusal, reworded: This file is not a Wayfarer collection: {first issue}. | |
| Folder has conflict markers | {path} has Git's conflict markers. Resolve them before opening the folder. | Resolve here… ([`conflict.md`](conflict.md)) |
| A file in the folder fails validation | {path} is not a request Wayfarer can read: {issue}. The other files were not opened. | Choose another folder… |
| Invite expired or stopped | This invite no longer works: the space stopped inviting. Ask for a new one. | Close |
| Relay or server not reached | {host} did not answer. The browser does not say why: … (as Share) | Try again |
| No member online (peer to peer) | No member of Shop API is online. A member must be online to let you in and to send you the collection. (stays waiting) | Cancel |
| Already a member | You are already in Shop API. | Open it |
| Empty folder | This folder holds no Wayfarer collection. To start one here, share a collection to it. | Choose another folder… |

Nothing is stored on any error. A link or an invite that failed can be
opened again.

## What is stored

On Import or Open only, in one transaction per collection (as
`ImportPipeline` writes): the collection, its folders and requests with
`scriptTrust: { trusted: false }`; for the three ways that keep in step, the
`Share` record of [`share.md`](share.md#what-is-stored) and a base copy
(`bases` store: `collectionId`, the version taken, the collection's
content as received), which [`conflict.md`](conflict.md) compares against.
For File and Link, `Share` is absent and the base is kept too, so that a
newer file of the same collection can be compared three ways.

## Claims it adds

| Claim | Test that would prove it |
|---|---|
| A collection received by link, folder or invite is not stored until the person chooses Import or Open; cancelled, nothing is stored. | e2e per way: open, cancel, read every store: unchanged. |
| The scripts of a received collection do not run until reviewed here (C-051 extended to every way). | e2e per way: receive a collection with a pre-request script that sets a variable; send; the variable is unset and the review asks. |
| Opening a link removes its fragment from the address bar. | e2e: after open, `location.hash` is empty. |
| The report names every host the received requests go to before anything is stored. | Unit test of the report against a fixture with three hosts. |

## Accessibility

- **Keyboard path:** an opened link puts focus in Code; Enter opens. In
  the report, focus starts on Cancel, as `Confirm` starts on the button
  that backs out (the person reads first); Tab reaches Review
  scripts…, Add to the vault… and Import.
- **What is heard:** "Open a shared collection, dialog. Someone sent you a
  collection in this link…". The report is a `role="status"` region, as
  today's import dialog (it already has one, `reportText`), so its first
  line is read when it arrives. "Reading 16 files…" is a spinner with that
  label.
- **Waiting** is a polite live region; the moment a member lets the person
  in is announced ("Ana Ruiz let you in.").
- Hosts and secrets' names are monospace and in a list, so a screen
  reader reads them one by one.

## At 390 px

The Receive dialog is full width; the report's tree is the import dialog's
list, one row per item. The Code field takes the width; its text is
16 characters plus spaces, which fit at 320 px in the mono type. The hosts
list wraps each host on its own line, broken anywhere in a long name
(`overflow-wrap: anywhere`).
