# See who changed what (Changes)

> D4.8, flow 3 of 5. Designed, not built. Principles and open questions:
> [`README.md`](README.md). Prototype: [`prototypes/history.html`](prototypes/history.html).
>
> In the app this flow is **Changes**, not "history": history is the
> requests sent from this browser ([`voice.md`](../voice.md)).

## The job

A request that worked yesterday fails today. The person wants to know
whether someone changed it, who, when, and what exactly, and to put it
back if that was the cause. A team lead wants to see what arrived this
week before a release.

## Entry points

- **Sidebar, a collection's context menu: Changes.** Opens the Changes
  drawer for the collection.
- **A tab's context menu: Changes to this request.** Opens the drawer
  filtered to the open request.
- **The exchange record's preview** (composer, under the address), for a
  request taken from someone else's change and not yet sent: "Changed by
  Ana Ruiz on 3 Nov, taken here." Its name is a button that opens the
  drawer at that change.
- **Palette:** Changes to {collection}, and Changes to this request.

The drawer is a `<dialog uiModal class="ui-drawer ui-drawer-end">`, as the
History drawer is, titled **Changes to Shop API**. It belongs to the
sidebar's region (ia.md: a drawer belongs to the region that opens it).

## What the drawer lists, by way

One row per change, newest first, grouped by day as History is. A row
says who, what and when, in one line, then the parts it touched:

> **Ana Ruiz** changed **Create order** · 14:02
> Address, 1 header

A row opens to the change's diff, the same view as
[`review.md`](review.md) draws, read-only, with **Put back** (below).

### Peer to peer and team server

Every change is signed by its author's device key, so the name is the
name that key joined with (TQ8). The row shows the name, and on hover or
focus a tooltip card with "Key 2B9E 04D1, joined 28 Oct, let in by you."
A change made here says **You**. Changes not yet taken are listed at the
top under **To review** with **Review…** (they have not changed anything
yet). The team server keeps every change; peer to peer has what this
browser saw, and says so at the end of the list: "Changes from before this
browser joined are not here: peer to peer keeps nothing on the relay."

### Folder (Git)

The app knows what changed on disk since it last read the folder, not
who changed it (TQ4). A row reads:

> **Changed in the folder** · Create order · 14:02
> Address, 1 header

and its open state adds "Who changed it is in Git:" with the command in
monospace and **Copy command**: `git log -p -- orders/create-order.json`.
Changes made here are **You** (written by this app). The list holds what
this browser saw; the drawer's foot says "For the whole record, use your
Git: Wayfarer keeps only what it saw here."

### File and link

A collection that came by file or link has one row per version taken:

> **Ana Ruiz, as the file said** · 12 requests · 3 Nov

"as the file said" is always there: a file's sender is not checked.

## Put back

An open change has **Put back** for each request it touched ("Put back
Create order as it was before this change"). It does not rewrite the
past: it makes a new change, by **You**, whose content is the request as
it was before. In the three ways that keep in step, that change is shared
like any other and others review it. In the Folder way it writes the file;
the person commits it.

Put back on a request with an unsaved tab asks: "Create order has unsaved
edits in a tab. Put back replaces them." (Put back, Cancel). Put back that
would bring back a script holds that script, as any change does.

## Strings

| Where | String |
|---|---|
| Menu item | Changes |
| Tab menu item | Changes to this request |
| Drawer title | Changes to {collection} |
| Row, peer and server | {name} changed {request} · {time} |
| Row, added or removed | {name} added {request} · {name} removed {request} · {name} moved {request} to {folder} |
| Row, folder | Changed in the folder · {request} · {time} |
| Row, file | {name}, as the file said · {n} requests · {date} |
| Parts line | Address, 1 header, Body, Pre-request script (only the parts touched; counts for rows) |
| Group heading | Today · Yesterday · {date} |
| To review heading | To review |
| Folder note | Who changed it is in Git: {command} |
| Foot, folder | For the whole record, use your Git: Wayfarer keeps only what it saw here. |
| Foot, peer | Changes from before this browser joined are not here: peer to peer keeps nothing on the relay. |
| Put back | Put back {request} as it was before this change |
| Preview line | Changed by {name} on {date}, taken here. |

## Empty and error states

| Case | String | Action |
|---|---|---|
| A collection that is not shared | Changes are kept for a shared collection. Share this one to see who changes what. | Share… |
| Shared, nothing changed yet | No one has changed Shop API since it was shared. Changes show here, with who made them. | |
| Filtered to a request, none | No change to Create order since it was shared. | Show all changes |
| A change whose signature does not verify | (never listed; see Claims) The drawer's foot: 1 change was refused: it was not signed by a member. | |
| Folder unreachable (permission lost after a restart) | Wayfarer cannot read shop-api until you allow it again. | Allow again (the browser's prompt) |
| Bridge folder unreachable | The Local Bridge is not running with the folder shop-api. | Copy command |

## What is stored

A `changes` store (TQ9), one record per change, kept for collections that
are shared:

- `id`: the SHA-256 of the change's signed content
- `collectionId`
- `parents`: the ids of the changes it was made on top of (a change made
  while offline may have two)
- `author`: `{ name, publicKey }`; for the Folder way `{ kind: "folder" }`;
  for a file `{ kind: "file", statedName }`
- `at`: the author's clock, in milliseconds; shown as given, not trusted
  for order (order is `parents`)
- `ops`: a list of field changes, each `{ target: request, folder or
  collection id, field, before, after }`, where `field` is one of the
  request fields of `collections-schema.md` or a row's id inside one
  (`headers[rowId].value`). `before` and `after` are masked as an export
  is: a credential is `***`, a protected value is its reference.
- `signature`: Ed25519 (or the fallback named in [`share.md`](share.md#what-is-stored)) over the canonical JSON of
  every field above
- `state`: `held` (to review), `taken`, `declined`, `refused` (bad
  signature, kept for the foot's count only)

Over the wire (peer and server) a change is this record encrypted with the
space's key (AES-GCM-256, a random 12-byte IV): the relay and the server
see `spaceId`, the ciphertext, its length and when it came.

## Claims it adds

| Claim | Test that would prove it |
|---|---|
| A change is listed with an author only when it is signed by a key that joined the space; any other change is refused and not taken. | Core unit test: a change signed by a stranger's key and one with a byte flipped are refused; e2e: two browsers and a third with a forged key. |
| The relay and the team server receive changes as ciphertext only. | T3/T4's AC: a seeded marker in a request; the server's stored files and the relay's traffic log hold no part of it. |
| Changes stores no credential or vault secret's plaintext. | `secrets-wire.spec.ts` scan over the `changes` store. |
| Put back makes a new change and removes none. | Unit test: after Put back, the store has one more change and the earlier ones unchanged. |

## Accessibility

- **Keyboard path:** from the collection's row, Shift+F10, Changes,
  Enter. Focus starts on the first row. Rows are a list of buttons
  (`aria-expanded`), and Tab moves between them, as History's rows do. Enter opens a row in place; its diff follows the row
  in the reading order. Escape closes the drawer and focus goes back to the
  row that opened it.
- **What is heard:** a row is one sentence: "Ana Ruiz changed Create order
  at 14:02: address, 1 header. Collapsed." Times are written out in the
  accessible name ("14:02, today").
- **Arrivals:** a change that arrives while the drawer is open is added
  under To review and announced in a polite live region: "A change from
  Ana Ruiz to review." Never assertive.
- The key fingerprint card is the `uiTooltip` card, shown on keyboard
  focus as well as hover.

## At 390 px

The drawer is the window's width (as the History drawer at that width).
A row's two lines wrap; the time stays at the end of the first line. An
open diff stacks before above after, never side by side
([`review.md`](review.md#at-390-px)). The Git command wraps inside its
monospace box and Copy command sits under it.
