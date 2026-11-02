# Resolve a conflict

> D4.8, flow 4 of 5. Designed, not built. Principles and open questions:
> [`README.md`](README.md). Prototype: [`prototypes/conflict.html`](prototypes/conflict.html).

## The job

Two people changed the same thing before either saw the other's change.
The data may merge without a complaint (research-2026 §9: a CRDT makes
copies agree, not keep what each person meant), so the app must say where
two intentions met and let the person here decide, field by field, without
losing either version.

## What is a conflict

A conflict is one **field** of one request, folder or collection changed
on both sides since the common base: the same address, the same header's
value, the same body or script. Two changes to different fields of one
request are not a conflict: both are taken, and the review says so
("Ana's and your changes to Create order touch different parts; both are
kept."). A request removed on one side and changed on the other is a
conflict of the whole request.

The base is the last version both sides had: the `bases` record (files and
folders) or the common parent change (peer and server).

## Where conflicts come from, by way

| Way | How it happens | Where the person meets it |
|---|---|---|
| File and link | A newer file of a collection arrives; both it and the collection here changed a field since the last file taken. | In the review of the file, as a section marked "Both changed". |
| Folder (Git) | 1. `git merge` or `git pull` leaves conflict markers in a request file. 2. A file changed on disk while the request has an unsaved tab. 3. The person saved here while a changed file waited for review. | 1. The sidebar row: "Folder: 1 conflict in Git". 2. The tab banner. 3. Saving: see below. |
| Peer to peer, team server | Two members changed one field while out of touch (offline, or within the same moment). Both changes are signed and kept; neither is lost. | In the review of the arriving change, as "Both changed". |

### Saving over a change not yet taken

When the person saves a request that has a held change (any way), Save
does not write at once; it asks: "Ana Ruiz changed Create order since you
opened it. Compare before saving?" with **Compare…** and **Save mine**
(Cancel is the dialog's close). Save mine writes the person's version and
leaves the other change held and marked as a conflict, so it is not lost.

### Git's conflict markers (TQ5)

A request file with `<<<<<<<`, `=======` and `>>>>>>>` lines fails
validation. The app recognises the markers and, because the format puts
one field on one line, reads each side as a field. The row shows "Folder:
1 conflict in Git"; the review lists the file with **Resolve here…**. The
resolution writes the file without markers. The app runs no Git command:
it ends with "Wrote orders/create-order.json. Mark it resolved in your
Git: `git add orders/create-order.json`" and **Copy command**. A file whose
markers do not fall on field lines (a marker inside a JSON string spanning
lines) says "The markers in {path} are inside a value. Resolve this one in
your editor." and offers nothing else.

## The view

The review's section for that request, with a third column, titled
"Both changed: Create order":

| | Yours | Base | Theirs |
|---|---|---|---|
| Address | `{{base}}/orders` | `{{base}}/order` | `{{base}}/v2/order` |

**Base** is collapsed by default ("Show what it was"), so the two that
matter sit side by side. For each field, a choice (a radio group named for
the field): **Keep yours**, **Take theirs**, and for a text field (a body, a
script, the address) **Edit**, which opens the value in an editor
prefilled with both, marked, for the person to write the result.

The names are the people's: "Yours" and "Ana Ruiz's"; for the folder,
"Yours" and "In the folder"; for Git markers, "Yours (HEAD)" and "Theirs
({branch from the marker line})", as Git writes them.

The foot: **Cancel** (nothing changes; the conflict stays) and **Save
resolution**, enabled when every conflicting field has a choice. Saving
writes the request as chosen and, in the three ways that keep in step,
shares it as a change by You whose parents are both sides (the merge),
so the others see the conflict resolved and do not meet it again.

Scripts are fields like any other. A resolved script that is not exactly
a version this browser approved is held, as any changed script.

## Strings

| Where | String |
|---|---|
| Section title | Both changed: {request} |
| Column heads | Yours · Base · {name}'s · In the folder · Theirs ({branch}) |
| Base toggle | Show what it was · Hide what it was |
| Choices | Keep yours · Take theirs · Edit |
| Not a conflict | {name}'s and your changes to {request} touch different parts; both are kept. |
| Removed vs changed | {name} removed {request}; you changed it. Keep yours, or remove it? (Keep yours, Remove) |
| Save prompt | {name} changed {request} since you opened it. Compare before saving? (Compare…, Save mine) |
| Sidebar | Folder: {n} conflict in Git (agreeing in number: conflicts) |
| Git end | Wrote {path}. Mark it resolved in your Git: {command} |
| Markers inside a value | The markers in {path} are inside a value. Resolve this one in your editor. |
| Button | Save resolution |
| Left unresolved | {n} fields still need a choice. (beside the disabled button, and as its description) |
| Done | Resolved Create order. (polite) |

## Errors and empty states

| Case | String |
|---|---|
| The other side changed again during the resolution | {name} changed {request} again. The view now shows it; your choices for the fields it did not touch are kept. |
| The file was resolved in Git meanwhile | {path} no longer has conflict markers. Its content is shown as a change to review. |
| Write refused (folder) | The browser refused to write {path} ({reported}). Your choices are kept in this dialog. |
| No conflicts | (not a state: the review's sections without "Both changed") |

## What is stored

Until Save resolution, nothing. A conflict that is left is the held
change, marked `conflict: true`, with the field list it clashes on. Save
resolution writes the request, the new base, and (peer and server) a
change with two `parents`; Git's way writes the file and updates its
digest. Neither side's change is deleted: both stay in Changes.

## Claims it adds

| Claim | Test that would prove it |
|---|---|
| When two people change the same field, neither change is taken silently: the app asks, and both versions stay in Changes. | Core unit test over the merge with concurrent edits of one field; e2e with two browsers through the relay. |
| Edits to different fields of one request are both kept without a question. | Core unit test. |
| A request file with Git's conflict markers is not read as a request; it is offered for resolution and nothing of it is taken until then. | e2e (bridge folder): write a file with markers; the app's request is unchanged and the row says it. |
| Resolving writes a file without markers and runs no program. | Bridge test: the `--folder` mode has no code path that spawns a process (as today's claim of the bridge); e2e: the file after resolution validates. |

## Accessibility

- **Keyboard path:** from the review, Tab to the conflicting section; each
  field is a radio group (`ui-segmented`) whose name is the field
  ("Address: keep yours, take theirs or edit"); arrows choose. Edit
  opens an editor below the group and moves focus into it; Escape in the
  editor returns to the group (not the dialog's close: the editor takes
  the key first, as a popup inside a dialog does).
- **What is heard:** the three values are a table with headers, so a
  screen reader reads "Yours, `{{base}}/orders`" cell by cell. Hidden base
  is not in the reading order.
- **The count of fields left** is the disabled button's description and a
  polite live region when it changes ("1 field still needs a choice").

## At 390 px

The three columns become one: for each field, the choice group first,
then Yours, then theirs, then (when shown) the base, each with its word.
Edit's editor is the full width and 8 lines high. The Git command wraps in
its monospace box.
