# Decision: how Wayfarer works with Git (D1.6)

> Status: decided 2026-11-02, under the maintainer's standing instruction of
> that day to review each blocked decision adversarially, decide and go on
> (plan row 1.55). Feeds D4.8 (team flows, session D4-j) and T2.

## The question

A team keeps its API requests next to its code, in its repository, and
reviews a change to them the way it reviews code. Wayfarer runs in a
browser and has no desktop shell. How does a collection get into a Git
repository and back, in Chromium, Firefox and Safari?

## What is fixed

- `showDirectoryPicker` (a folder of the user's disk) exists in Chromium
  only. Firefox and Safari have none, and neither has said it will
  ([web.dev](https://web.dev/articles/files/open-a-directory)). Measured
  in this repository's Playwright engines on 2026-11-02, on a page from
  localhost: `showDirectoryPicker` is a function in Chromium 156 and
  undefined in Firefox 157 and WebKit 27.2.
- The Origin Private File System (`navigator.storage.getDirectory`)
  exists in all three (same measurement), and is the browser's, not the
  user's: no editor, terminal or `git` can see it.
- The Local Bridge (`packages/bridge`) already runs on the user's machine,
  is paired to the page with a token, and binds to 127.0.0.1. It has no
  dependencies and, by the maintainer's rule of v1.2.59, runs no other
  program.
- A desktop shell is a non-goal (section 3) unless this decision
  recommends one.

## Options, each argued against

1. **Git in the browser** (isomorphic-git over OPFS, pushing to the
   remote). Against: a second clone the user's own tools cannot see; the
   remote's credentials held by the page; Git hosts send no CORS headers
   for the smart HTTP protocol, so every push and fetch goes through the
   bridge anyway; hooks, signing, LFS and SSH keys, which teams rely on,
   do not exist there; a 300 kB dependency. It answers "Wayfarer has Git"
   and misses "my requests are in my repository".
2. **The bridge runs `git`.** Against: the bridge's whole security story
   is that it relays a request and does nothing else; a page that can make
   it run `git` with arguments can make it run whatever `git` runs
   (hooks, `core.sshCommand`, aliases). Every commit, pull and merge the
   app offers would be a smaller, worse copy of what the user's editor
   already does.
3. **A desktop shell** (Tauri or Electron). Against: a second product to
   build, sign and update on three platforms, which the plan rules out,
   for one feature; Bruno and Yaak already are that product.
4. **Folder sync, Git by the user's own tools.** Wayfarer reads and
   writes a collection as a folder of plain, diff-friendly files inside
   the user's working copy; the user commits, pulls, branches and reviews
   with the Git they already use. Against: Wayfarer shows no commit
   button; Firefox and Safari need the bridge for folder access, which
   gives the bridge file access it does not have today; two writers (the
   app and a `git pull`) can touch the same file.

## Decision

**Option 4.** Wayfarer's part of Git is the files, not the commands.

- **The format.** A collection is a folder: one file per request and per
  folder, named for it, keys in a fixed order, one field per line where a
  field holds text, and nothing a send changes (no response, no history,
  no timestamps). The same validator reads it as an import does
  (`validateRequestContent`); a file the app did not write is untrusted.
  Its scripts are unapproved when read, as an import's are (`ScriptTrust`):
  a pull can bring a script, and a script someone else wrote does not run
  until it is reviewed here. Vault secrets never reach the folder: a
  protected variable is written as its reference, as a backup is.
- **Access in Chromium:** the folder the user picks with
  `showDirectoryPicker`, its handle kept in IndexedDB and asked for again
  after a restart (the browser's own permission prompt).
- **Access in Firefox and Safari:** the Local Bridge, started with
  `--folder <path>`, serves that one folder: list, read and write, no
  path outside it (resolved with `realpath` and refused if it leaves),
  only the file names the format uses, the same token and origin checks as
  `/relay`, and still no other program run. Without `--folder` the bridge
  touches no file. This changes the bridge's security model and so waits
  for the maintainer's OK on its PR (the rule for PRs that change security
  posture).
- **Change from outside.** When a file changes under the app (a pull, a
  branch switch, an edit in an editor), the app shows what changed, as a
  diff per request, and takes it only when the user says so; an unsaved
  edit in a tab is never overwritten. The app checks on focus and every
  few seconds while visible; there is no file watching in a browser.
- **What Wayfarer does not do:** commit, push, pull, branch or merge.
  It says so where a user would look for it, and names the folder so the
  user can open it in their own tools.

## How it is measured (the AC's prototype)

The AC asks for a prototype that round-trips a collection through a Git
repository in three browsers. The round trip that matters is: write the
folder, `git commit`, change a request on a second clone, `git pull` in
the first, and see the change in the app before taking it. T2's AC is the
same test. Measured so far (2026-11-02): the folder API's presence per
engine (above). The round trip itself is built as T2's e2e, against the
bridge's `--folder` in Firefox and WebKit and a stubbed directory handle
in Chromium (Playwright cannot click the browser's folder prompt); until
it runs, this record's choice rests on the facts above and says so.

## What it costs

- A file format to keep stable (`docs/collections-schema.md` grows a
  folder section).
- The bridge's `--folder` mode, with its own claim and tests: no path
  outside the folder, no file the format does not name, nothing without
  the token.
- A diff view, which the review before taking a change (D4.8) needs for
  every way of sharing anyway.

## Claims it will add

- The app writes no vault secret's plaintext to a collection's folder
  (extends C-007's family; test: the secrets-wire scan over the folder).
- Scripts read from a folder do not run until reviewed here (test: a
  folder with a script, a send, no script run).
- With `--folder`, the bridge reads and writes only inside that folder
  and only the format's files (test: `../`, a symlink out, an absolute
  path, another file name, each refused).
