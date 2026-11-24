# Keep a collection in a folder

<!-- description: Keep a collection as plain files in a folder of your Git repository, see what changed there from outside with each file's diff, and take it when you choose. -->

A collection can live as plain files in a folder on your disk, for example
inside the repository of the project it tests. Wayfarer writes the files and
reads the changes made to them. It runs no Git command: you commit, pull and
branch with the Git you already use.

This needs a browser that can let a page work in a folder of yours: Chrome,
Edge and other Chromium browsers can. Firefox and Safari cannot yet, and the
Export and Share choices work in every browser. A collection kept in a folder
is also kept in the browser, as every collection is.

## Choose the folder

Open a collection's menu in the sidebar (right-click, or Shift+F10 on its
row) and choose **Save to a folder on disk…**, then **Choose a folder**. The browser
asks you to pick the folder and to let Wayfarer change it. Choose a folder that holds
no collection yet: to open one that does, a clone of a teammate's
repository for example, use **Import › Folder…**, which shows the usual
[import report](import.md) first and keeps the collection in that folder when
you import it.

The folder then holds:

- `collection.json`: the collection's name, variables, auth and scripts;
- one folder for each folder of the collection, with a `folder.json`;
- one `….request.json` file for each request, named for the request and its id.

Each file is JSON with its keys in one order, and a script or a body of several
lines is written one line to a line, so a change to one line is one line of a
diff. A file holds nothing a send changes: no response, no history and no
timestamp.

## What is written, and what is not

- **A credential you typed** into an auth field or an `Authorization` header is
  written as `***`, as a shared file has it. When you take a change from the
  folder, the credential you typed stays. <!-- claim:C-095 -->
- **A vault secret** is written as its reference and never as its value. A
  variable that is protected is kept in the vault, and each person adds their
  own value.
- **Scripts** that come from the folder do not run until you have read them,
  as with any [import](import.md).
- Anything else in the folder (`.git`, a README, notes) is left alone.

## When the folder changes from outside

Wayfarer looks at the folder when you return to the window and every few
seconds while it is open. When it finds a change you did not make here, say a
`git pull` brought one, the sidebar says **Changes in the folder of …**. Open
it to see each file that is new, gone or changed, with its lines before and
after. Nothing here changes until you choose **Review and take**, which opens
the import report: what it adds, replaces and sends to is shown before
anything is stored, and Undo puts it back. <!-- claim:C-096 -->

A request open in a tab keeps what is typed in it. When the folder and this
collection both changed since they last matched, the folder says so: taking
the folder's version replaces your changes, and Undo puts them back.

When you change the collection here, Wayfarer writes the folder a moment later,
unless the folder has changes waiting to be taken. It does not merge two
changed versions of a request: that is on the [roadmap](roadmap.md).

## Limits

- Chromium browsers only, for now. Firefox and Safari have no folder picker;
  the [roadmap](roadmap.md) says how they will be reached.
- After the browser restarts it asks again before Wayfarer may use the folder:
  choose **Allow access** in the same dialog.
- A folder holds up to 10,000 files, 32 levels deep. A file larger than 25 MB is
  refused.
- Stop keeping a collection in a folder from the same dialog: the collection
  stays, and the folder's files are left as they are.
