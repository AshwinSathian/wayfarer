# Share

> D4.8, flow 1 of 5. Designed, not built. Principles and open questions:
> [`README.md`](README.md). Prototype: [`prototypes/share.html`](prototypes/share.html).

## The job

A person has a collection that works and wants a teammate to have it: once
(a file or a link), or kept in step (a folder in Git, peer to peer, a team
server). They need to know, before anything leaves, what will go, where it
goes and what will not go (their secrets, their typed credentials).

## Entry points

- **Sidebar, a collection's context menu: Share…** (right-click or
  Shift+F10 on the row). Opens the Share dialog for that collection.
- **Palette: Share…**, in the group named for the selected collection
  (ia.md rule 3).
- **Settings › Sharing: Share a collection…**, which asks which
  collection first. The palette is never the only road (ia.md rule 4).
- A folder or a request has no Share…: the unit is the collection. A
  person who wants one request shares it as cURL (today's Copy as cURL).

Export… stays as it is (U-016): it writes a file for a person's own use or
for Postman. Share › File writes the same Wayfarer file; the difference is
that Share says who it is for and adds the sender's name.

## The Share dialog

A `ui-dialog` titled **Share Shop API** (the collection's name). Its first
step is the choice of way, a list of four options (a radio group,
`ui-segmented` is too narrow for the explanations):

| Option | Its line |
|---|---|
| File or link | Send a copy. They see what it adds before anything is stored. |
| Folder (Git) | Keep this collection as files in a folder of your repository. You commit and pull with your own Git. |
| Peer to peer | Changes go between your browsers, encrypted, through a relay your team runs. Both must be online. |
| Team server | Changes are kept, encrypted, on a server your team runs, for whoever opens the collection next. |

Under the list, always: **What is shared:** "The collection's folders,
requests, variables, auth and scripts. Not your history, your
environments or the vault. A protected variable is shared as its name;
each person adds their own value." Buttons: **Cancel**, **Next**.

A collection already shared by a way that keeps it in step opens on that
way's page instead ("Shop API is kept in step with the team server
teams.example.com."), with **Stop sharing…** and the invite again.

## Step by step, by way

### File or link (T1)

1. **Choose: File or Link** (`ui-segmented`, "Send as"). File is chosen.
2. **What goes.** A summary: "12 requests in 3 folders, 4 variables, 2
   scripts." Then, when there are any:
   - "2 credentials typed into auth are written as ***." with the
     checkbox **Include credentials** ("Only in this file. A vault secret
     is never written."), as Export… has it.
   - "1 protected variable is shared as its name: token."
   - "2 scripts go with it. They will not run for the receiver until they
     read them and trust them."
3. **Your name** (a text field, sans, prefilled from Settings › Sharing,
   may be empty): "Shown to the receiver as who sent it. They cannot check
   it." Labelled **Sent by**.
4. **File:** the button **Save file** writes `shop-api.wayfarer.json`
   (download). Done state: "Saved shop-api.wayfarer.json. The receiver
   opens it with Import › File…".
   **Link:** the button **Make link**. Then:
   - The link, in a read-only monospace field, with **Copy link**.
   - "The collection is inside the link, encrypted. The part after # is
     never sent to a server, also not to Wayfarer's."
   - **Code**, in a read-only monospace field (four groups of four
     characters) with **Copy code**: "Send the code another way than the
     link: say it, or send it in a different app. Without it the link
     cannot be read." (TQ2.)
   - The checkbox **Put the code in the link**, off: "Anyone who sees the
     link can then read the collection."
   - The length: "The link is 14 kB." Above the limit (TQ3), Make link is
     disabled and the line reads "This collection makes a link of 51 kB.
     A link can be 32 kB at most: chat apps cut longer ones. Save it as a
     file instead." with **Save file** beside it.

### Folder, for Git (T2)

1. **Where.** In Chromium: the button **Choose folder…** opens the
   browser's folder picker (`showDirectoryPicker`, read and write). In
   Firefox and Safari, or when the person prefers it: "Through the Local
   Bridge" with its state: paired and started with `--folder` shows the
   bridge's folder (`~/code/shop/api-requests`, monospace) and **Use this
   folder**; paired without it shows "Start the bridge with the folder:
   `npx wayfarer-bridge --folder ~/code/shop/api-requests`" with **Copy
   command**; not paired shows the bridge setup of the exchange record
   (ia.md), in place.
2. **What it writes.** "Wayfarer writes one file per request and per
   folder, in a folder named shop-api. Nothing of a send is written: no
   response, no history, no times." A list of the first files
   (`shop-api/collection.json`, `shop-api/orders/create-order.json`, …),
   monospace. The same three lines as File about credentials (always
   `***`, no checkbox), protected variables and scripts.
3. **A folder that is not empty.** If the folder holds `shop-api` already,
   the dialog goes to Receive's review instead ("This folder already holds
   a collection. Open it instead?", **Open it**, **Cancel**): it never
   writes over files it did not read.
4. **Write.** The button **Write files**. Done: "Wrote 16 files to
   shop-api. Commit them with your own Git; Wayfarer does not commit,
   pull or push." with **Copy path** (the folder's path, when the bridge
   gives one; Chromium does not give a path, so the line names the folder
   only).

### Peer to peer (T3)

1. **The relay.** The field **Relay address** (monospace,
   `wss://relay.example.com`), prefilled from the last one used.
   "Your team runs the relay: the Wayfarer server image in relay mode.
   It passes encrypted changes and keeps nothing." Link: "How to run it",
   to the docs.
2. **Your name** (as File's, required here): "Others see it beside your
   changes, with this browser's key: 7F3A 91C2."
3. **The vault.** The space's key is a vault secret (TQ7). Locked: "Unlock
   the vault to keep the space's key." with **Unlock the vault**. No vault:
   the vault's first-use setup, in place (C-027).
4. **Make the space.** The button **Start sharing**. The app makes the
   space's key and its id, sends nothing but the relay's handshake, and
   shows the invite:
   - **Invite link** (monospace, read-only) with **Copy invite**: "Holds the
     space's key after #. Anyone with it can join and read the collection
     while they are a member."
   - "The invite works until you choose Stop inviting." and **Stop
     inviting**.
   - **Members:** "You (this browser)". Others appear as they join,
     with "Waiting for you to let them in" and **Let in** (step 5).
5. **Letting someone in.** A person who opens the invite asks to join with
   their name and key. The sharer sees "Ana Ruiz asks to join, key 2B9E
   04D1." with **Let in** and **Refuse**. Only members already in can let
   someone in. Their copy of the collection comes from a member online,
   through the relay, encrypted.

### Team server (T4)

The same steps as Peer to peer, with these words changed:

- The field is **Server address** (`https://wayfarer.internal.example.com`).
  "Your team runs the server: the Wayfarer server image. It keeps the
  changes, encrypted, so a member who was away gets them when they open
  the app. It cannot read them."
- Before Start sharing, the app asks the server what it is ("Wayfarer
  team server, server mode"). A relay in relay mode is offered as Peer to
  peer instead ("This address is a relay: it keeps nothing. Share peer to
  peer?").
- After Start sharing: "Shop API is on teams.example.com, encrypted."

## Strings

Every string above, plus:

| Where | String |
|---|---|
| Dialog title | Share {collection} |
| Menu item, palette | Share… |
| Done, File | Saved {file name}. The receiver opens it with Import › File…. |
| Done, Link | Copied the link. Send the code another way. |
| Done, Folder | Wrote {n} files to {folder}. Commit them with your own Git; Wayfarer does not commit, pull or push. |
| Done, Peer to peer | {collection} is shared peer to peer through {relay host}. |
| Done, Team server | {collection} is on {server host}, encrypted. |
| Sidebar row, under the name | Folder: {folder} · Peer to peer: {n} online · Team server: {host} |
| Stop sharing question | Stop sharing {collection}? Your copy stays here. Others keep theirs, and no longer get your changes. (Stop sharing, Cancel) |

## Errors

Each stays in the dialog, under what it is about.

| Case | String | Action |
|---|---|---|
| Folder picker cancelled | (nothing: the dialog stays on step 1) | |
| Folder permission refused | The browser did not give Wayfarer this folder. Choose it again and allow editing. | Choose folder… |
| Folder written in part | Wrote 9 of 16 files; then the browser refused: {reported}. The files written are listed below; nothing else changed here. | Try again |
| Bridge started without `--folder` | The Local Bridge was started without a folder. Start it again with `--folder` and the folder's path. | Copy command |
| Bridge refuses a path | The Local Bridge refused {path}: it is outside the folder it was started with. | |
| Relay or server not reached | {host} did not answer. The browser does not say why: the address may be wrong, the server may be down, or it does not allow requests from this site. | Try again |
| Address is not a relay or server | {host} answered, but not as a Wayfarer relay or team server. | |
| Server refuses (full, stopped) | {host} refused the space: `{reported}` | |
| Vault locked at Start sharing | Unlock the vault to keep the space's key. | Unlock the vault |
| Link too long | This collection makes a link of {n} kB. A link can be 32 kB at most: chat apps cut longer ones. Save it as a file instead. | Save file |

## Empty state

A collection with no requests can be shared (a team may start one empty).
The summary then says "No requests yet. Requests added later are shared
too." for the three ways that keep in step, and "No requests: the file
holds the collection's name, variables and settings only." for File and
Link.

## What is stored

A `Share` record per shared collection, in a new `shares` store (TQ9),
keyed by the collection's id. Field level:

- `collectionId`
- `way`: `folder`, `peer`, `server` (a file or a link stores nothing: it
  is a copy, not a link between copies)
- for `folder`: `access` (`picker` with the directory handle, kept in
  IndexedDB as Chromium allows; or `bridge`), `folderName`, and the
  digest of each file as last written or read (`files: { path, sha256 }[]`),
  which is how an outside change is noticed
- for `peer` and `server`: `address`, `spaceId`, `spaceKeyRef` (the vault
  secret's id that holds the space's key; never the key), `members`
  (`{ name, publicKey, joinedAt, letInBy }[]`), `inviting` (true or false)
- `lastTaken`: the id or digest of the last change or file version taken,
  which is the base for a three-way comparison ([`conflict.md`](conflict.md))

This browser's identity, in the `meta` store: `sharing.name` (text) and
`sharing.deviceKey`, an Ed25519 key pair made with WebCrypto, the private
key non-extractable and kept as a `CryptoKey` in IndexedDB (structured
clone). Ed25519 in WebCrypto in all three engines is unverified in this
repository's Playwright versions; T0 measures it, and ECDSA P-256 is the
fallback.

## Claims it adds

| Claim | Test that would prove it |
|---|---|
| A collection shared as a link reaches no server: the link's content is after `#`, and opening it sends nothing to any server but the app's own files. | e2e, three engines: open a link with a marker string in a request's address; the request log of the page and the prod server's access log hold no part of the fragment. |
| A shared file, link, folder or change holds no vault secret's plaintext. | `e2e/secrets-wire.spec.ts` gains the four outputs to its scan. |
| A credential typed into auth is `***` in a shared folder and a shared change, and in a file or link unless Include credentials was ticked for it. | e2e: share with a typed Bearer token by each way; the bytes hold `***`; once with the tick, the file holds the token. |
| Before anything is shared, the dialog names where it goes: the file's name, the link's length, the folder, or the relay's or server's address. | Unit test of the dialog: each way's last step shows its destination before its action button is enabled. |
| With `--folder`, the Local Bridge writes only inside that folder and only the format's file names. | D1.6's claim; `packages/bridge/test` with `../`, a symlink out, an absolute path and another name, each refused. |

## Accessibility

- **Keyboard path:** Shift+F10 on the collection's row, arrow to Share…,
  Enter. Focus starts on the first way (`cdkFocusInitial`); arrows choose,
  Tab reaches Next. Each step opens with focus on its first field or, for a
  step with none, on its heading (`tabindex="-1"`), so a screen reader
  reads where it is.
- **What is heard:** the dialog's name ("Share Shop API, dialog"), each
  way as a radio with its line as its description (`aria-describedby`).
  The step's heading says the step ("Step 2 of 3: what goes"). The link and
  the code are read-only text fields with labels; Copy announces "Copied"
  in a polite live region, as the response's copy does.
- **Errors** are `role="alert"` under their field, and the field names
  them with `aria-describedby`.
- **Join requests** ("Ana Ruiz asks to join") are announced in a polite
  live region of the Share dialog, and listed in Settings › Sharing for a
  person who closed it.
- The code is grouped in fours with spaces for reading; Copy code copies
  it without the spaces.

## At 390 px

The dialog takes the window's width less 16 px a side, as every
`ui-dialog` does there. The four ways are a list, one under another, each
with its line. The link and the code fields are the full width, their
text cut with an ellipsis and copied whole; the buttons go under the field.
The file list of the Folder way shows three files and "and 13 more".
Nothing is wider than 320 px.
