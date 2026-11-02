# Team flows (D4.8)

> Status: designed, not built. Task D4.8 of [`PLAN-design.md`](../../../PLAN-design.md),
> session D4-j, on the Git decision of [`git.md`](../git.md) (D1.6). Phase T
> builds these flows (T1 to T4); T0 turns each spec into tasks with stored
> shapes, validators and claims.

A team shares its requests without a Wayfarer account and without a
server the maintainer runs. This folder designs five flows for each of the
four ways a team can share. Each flow has a spec and a clickable prototype
under [`prototypes/`](prototypes/) (open the file in a browser; it loads
nothing from the network).

| Flow | Spec | Prototype |
|---|---|---|
| Share | [`share.md`](share.md) | [`prototypes/share.html`](prototypes/share.html) |
| Receive | [`receive.md`](receive.md) | [`prototypes/receive.html`](prototypes/receive.html) |
| See who changed what | [`history.md`](history.md) | [`prototypes/history.html`](prototypes/history.html) |
| Resolve a conflict | [`conflict.md`](conflict.md) | [`prototypes/conflict.html`](prototypes/conflict.html) |
| Review before taking a change | [`review.md`](review.md) | [`prototypes/review.html`](prototypes/review.html) |

The file of the third flow is `history.md` because the task names it so.
In the app the flow is called **Changes**: [`voice.md`](../voice.md) gives
"history" one meaning, the requests sent from this browser, and a person
who reads "History" in two places would ask whether they are one list.

## The four ways

Each way has one name in the app, used everywhere a person reads it.

| Way | Name in the app | What travels | Who carries it | Built in |
|---|---|---|---|---|
| Files and links | **File** and **Link** | A copy of a collection, once | The person: by email, chat, a drive | T1 |
| Git | **Folder** | A collection as a folder of files in the user's working copy; Git moves the files | The user's own Git (D1.6) | T2 |
| Peer-to-peer | **Peer to peer** | Each change, encrypted, while two members are online at once | A relay the team runs, which sees ciphertext only | T3 |
| Self-hosted server | **Team server** | Each change, encrypted, kept for whoever opens the collection next | A server the team runs (a Docker image), which sees ciphertext only | T4 |

**What is shared is a collection**: its folders, requests, variables,
auth and scripts, written as the collection file of
[`collections-schema.md`](../../collections-schema.md) writes them (for a
folder, as one file per request and per folder, D1.6). An environment
travels by its own file, as today (C-047); live sharing of environments is
an open question below.

**The relay and the server are one program.** The image of T4 runs in one
of two modes: `relay` passes encrypted changes between members who are
online and keeps nothing; `server` passes them and keeps them. The change,
its encryption and its signature are the same in both. A team that runs
the relay and later wants changes kept for absent members switches the
mode; nothing in the app changes but the word in the sidebar. A
browser cannot reach another browser without a server to introduce them
(WebRTC needs one to exchange its offer and answer), so "peer to peer"
still needs a program somewhere; the plan's section 3 rules out one the
maintainer runs, so the team runs it.

## Which flow each way needs

| | File | Link | Folder (Git) | Peer to peer | Team server |
|---|---|---|---|---|---|
| **Share** | Share… › File: writes the export file | Share… › Link: makes a link, the content encrypted in its fragment | Share… › Folder: writes the folder, then the user commits | Share… › Peer to peer: makes the space and an invite | Share… › Team server: puts the collection on the server, makes an invite |
| **Receive** | Import › File… (today's import, with the review) | Opening the link | Import › Folder… (Chromium's picker, or the Local Bridge's `--folder`) | Opening the invite | Opening the invite |
| **See who changed what** | Only who the file says sent it, unverified, and when it was taken | The same | What changed on disk since the app last read the folder; who changed it is Git's (`git log`) | Each change, signed by its author's device key | The same, also for changes made while this browser was closed |
| **Resolve a conflict** | When a newer copy of a collection meets local edits | The same | Git's conflict markers in a file, and a file changed under an unsaved tab | Two edits of the same field before either saw the other | The same |
| **Review before taking a change** | Before Import writes anything | Before anything is written | Before an outside change to the folder is taken | Before an arriving change is taken | The same |

Every cell is a flow the user meets; none is "not applicable". Where the
way cannot know something (who edited a file that Git brought), the
flow says so in the app's words rather than leaving a blank.

## What every way shares

These hold for all five flows and all four ways. A build task that cannot
keep one stops and asks the maintainer.

1. **Review before taking a change.** Nothing from another person is
   written to the stores until the person here has seen what it changes
   and chosen Take. Cancel stores nothing (C-054's rule, extended from
   import to every way). An unsaved edit in a tab is never overwritten.
2. **Scripts from others are held.** A script that arrives, or a change
   that alters one, does not run until it is reviewed here (C-051,
   `ScriptTrust`). Taking a change never approves a script: the review
   opens the existing Review scripts dialog, which stays one of the three
   callers of `approveScripts` that `CLAUDE.md` allows, and no fourth is
   added.
3. **Vault secrets never travel, only references.** A protected variable
   is written as its reference (`{{$secret.<id>}}`) with the secret's name,
   never its value, as a backup writes it. The receiver sees "Needs a
   secret you do not have" and adds their own (C-003, C-007).
4. **What is shared is masked as an export is.** Everything leaves through
   `redactExport` and the `Redactor`. A credential typed into an auth
   field is written as `***` unless the person ticks Include credentials
   for that one file or link (C-014). In the three ways that keep sharing
   (Folder, Peer to peer, Team server) there is no such tick: a typed
   credential is always `***`, and an arriving `***` never replaces a
   value here.
5. **A change that sends a secret somewhere new is flagged.** The review
   marks any change that makes a request with a vault secret or a
   credential go to a host it did not go to before. This is C-053's
   question asked of a teammate's change rather than of a script.
6. **Files from elsewhere are untrusted.** Every file, link, folder and
   change is validated with the validators an import uses
   (`validateRequestContent`, `validateRows`) and carries the format's
   `$id`. There is one version of the format; a file of another shape is
   refused with the reason, not read in part.
7. **Nothing leaves unseen.** Every way names where its data goes before
   the first byte leaves: the file's name, the link's length, the
   folder's path, the relay's or server's address. C-001 is reworded to
   add "and, when you share a collection with a relay or a team server,
   the encrypted changes, sent to the address you gave".
8. **Words per [`voice.md`](../voice.md).** Sentence case, no "please",
   British English, "address" not URL, "Local Bridge" with capitals,
   "Changes" for this feature and "history" only for sent requests. Every
   string in the specs follows it.

## Where the flows live in the shell

Per [`ia.md`](../ia.md): the sidebar holds what is saved and what is done
to it, so sharing is the sidebar's.

- **A collection's context menu** gains **Share…** (opens the Share
  dialog) and **Changes** (opens the Changes drawer). The palette offers
  both for the selected collection (ia.md rule 3).
- **The sidebar's Import menu** gains **Folder…** and **Invite…** beside
  File… and cURL command….
- **A shared collection's row** shows its way in words under its name
  ("Folder: api-requests", "Team server: 3 to review"). A count to review
  is a button that opens the review.
- **Settings** gains a **Sharing** section (an entry of `SECTIONS` and a
  `@case`): your name as others see it, this browser's device key, and
  each shared collection with its way and address.
- **The status bar** gains nothing: sharing is per collection, not device
  state. An arrival is said in a polite live region, not as a toast.
- **The exchange record** is unchanged by sharing, with one addition: a
  request taken from someone else's change names it in the preview
  ("Changed by Ana Ruiz on 3 Nov, taken here.") until it is next sent.

## Open questions, each with a recommended default

| # | Question | Recommended default | Why |
|---|---|---|---|
| TQ1 | Does a team share environments live, or only by file? | By file only in T1 to T4; a later task adds live sharing with protected values left out. | An environment is where a person's own values live; sharing it live makes "whose token is this?" a daily question. |
| TQ2 | Where is the link's key? | In a separate code the sender passes by another channel; "Put the key in the link" is a choice, off by default. | With the key in the fragment, anyone who sees the link (a chat's preview, a synced browser history) reads it; encryption then protects against the server only, which never receives a fragment anyway. |
| TQ3 | How long can a link be? | 32 kB after compression and encryption; above it, Share offers a file. Measure in T1. | Chat apps and mail clients cut long links; the browsers' own limits are higher (unverified per engine). |
| TQ4 | Does the Folder way read `.git` to name who changed a file? | No. The Changes drawer says what changed since the app last read the folder, and "Who changed it is in Git: `git log -- {path}`". | Reading Git's objects is reading Git's format in the page, which D1.6 rejected; it also differs by repository setup (packfiles, worktrees). |
| TQ5 | Does the app resolve Git's conflict markers? | Yes, inside a request file only: it shows both sides per field and writes the chosen result back. The user then marks it resolved in Git. | The format is one field per line, so a conflict is a field; refusing to open the file sends the person to an editor for what the app can show better. It runs no Git command. |
| TQ6 | Are live changes taken as they arrive, or held for review? | Held, by default, for every collection. A collection's Settings may choose "Take changes as they arrive"; even then a change to a script, an auth, a host or a protected variable is held. | Principle 1, without making a quiet teammate's typo fix a review. |
| TQ7 | Where is a space's key kept? | As a vault secret: syncing needs the vault unlocked, and the sidebar says "Unlock the vault to sync". | Kept in plain IndexedDB, anyone with the disk reads the team's collection; kept in memory, every reload would need the invite again. Same rule as the Local Bridge token (F83). |
| TQ8 | How is a person named? | The name they type in Settings › Sharing, bound to their device key when they join; others see the name with a short fingerprint. Not verified by anyone. | No accounts (section 3). The fingerprint lets two people check by voice that a key is who they think. |
| TQ9 | New stores in IndexedDB | T0 asks the maintainer: the shapes below need stores (`shares`, `changes`, `bases`), and `CLAUDE.md` says a store change needs their OK. | The one-version rule: a browser that has the database gets no upgrade. |
| TQ10 | The self-hosted server's name in the docs | `docs/self-hosting.md` today is about hosting the static app. T4 adds `docs/team-server.md` and links it from there. | One name for one thing: "self-hosting" already means the app's files. |

## What these specs add to the claims ledger

Each spec lists its claims with the test that would prove it. None is in
`docs/claims.md` yet: a claim is added with its test, in the T task that
builds it. In short:

- The content of a link never reaches a server (T1's AC).
- Nothing from a file, link, folder or change is stored before Take.
- No vault secret's plaintext is in a shared file, link, folder or change.
- Scripts that arrive by any way do not run until reviewed here.
- The relay and the team server see ciphertext only (T3's and T4's AC).
- A change signed by a key that is not a member's is refused.
- An unsaved tab is never overwritten by an outside change.
- A change that sends a secret to a new host is flagged before it is taken.
