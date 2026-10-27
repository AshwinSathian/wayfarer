# Information architecture

Task D4.1 of [`PLAN-design.md`](../../PLAN-design.md): what the shell holds,
where each action of the app lives, and how the command palette, the
sidebar and the tabs share work. It was read against `main` at `fe1ba6b`,
after D3, and follows Direction A (a workbench, plan row 1.9). The four
decisions marked "maintainer, 2026-10-22" were asked and answered in the
D4-a session.

The [inventory](#inventory) at the end lists every action of today's app
with its place. `scripts/ia.test.mjs` (part of `npm run test:scripts`)
reads the actions from the code: each control of a template, each command
of the palette, each shortcut Settings lists, and each item of a menu
built in code. It fails when the app has an action the inventory does not
name, and when a row names an action the app no longer has. A D4 session
that moves an action changes its row in the same PR.

## The map

At 1,200 px and wider, with the sidebar pinned:

```text
┌──────────────┬───────────────────────────────────────────────────────────────┐
│ Wayfarer     │ ◧  [ Search or run a command  ⌘K ]   env ▾  ⛁  History  Settings│ toolbar
│              ├───────────────────────────────────────────────────────────────┤
│ COLLECTIONS  │ GET users ×   POST login ×   +                                 │ tab strip
│ [New ▾]      ├──────────────────────────────────┬────────────────────────────┤
│ [Import ▾]   │ GET ▾  address        Copy ▾ Save Send │ 200 OK · 16 ms · 2 kB │
│              │ Params Headers Body Auth Scripts Settings │ Body Headers Timings │ composer │ response
│ tree         │                                  │                            │
├──────────────┴──────────────────────────────────┴────────────────────────────┤
│ Route: Auto   Vault locked   Secrets                  Kept in this browser ◐ │ status bar
└──────────────────────────────────────────────────────────────────────────────┘
```

Below 1,200 px the sidebar is a drawer over the page; below 768 px the
composer's sections stack and the status bar's controls go to the toolbar
(the lock) and to Settings (the rest), as `CLAUDE.md` describes. This map
changes neither width.

Each region holds one kind of thing:

- **Toolbar.** The workspace as a whole, used often: the sidebar's toggle,
  the palette's field, the environment and its editor, History, Settings.
  Nothing that belongs to one request.
- **Status bar.** The device's state, each with its action: the route and
  the Local Bridge, the vault's lock, the secrets, where the data lives,
  the theme.
- **Sidebar.** What is saved: collections, folders and requests, and what is
  done to them (create, import, rename, move, duplicate, run, export,
  delete). Its header has two menu buttons; each row has a context menu.
- **Tab strip.** What is open: switch, open, duplicate, close.
- **Composer.** The open request: its parts, and send, save and copy.
- **Response.** What came back, and copying or exporting the exchange. Under
  its status line, the exchange record (D4.12): what the send did, one
  sentence per field (the route and the host, the vault secrets filled by
  name, what was masked, what history kept, and on a failure what was
  reported with the one action). The status line's last words, "Direct to
  {host}", open and close it; it opens by itself only on a failure.
- **Palette.** A second road, from the keyboard, to every command, and the
  way to find a request, a collection, an environment or a past request by
  typing.
- **Settings.** What is set once for this browser.
- **Banners.** Above the composer: an update, the backup reminder, the
  storage state.

A dialog or a drawer belongs to the region that opens it: the Environments
dialog to the toolbar, the Secrets dialog to the status bar, a collection's
Settings dialog to the sidebar. Row 1.9 also chose Direction C's rail, an
inspector beside the response for why a request failed, where it went and
which secrets it used. Row 1.45 gave it session D4-l (D4.12), which built
it as the exchange record under the response's status line: in a pane as
narrow as 391 px a column beside the body would leave neither room, so it
is a band the status line opens. The failure's action moved into it.

## How the palette, the sidebar and the tabs share work

The sidebar holds what is saved and the tabs hold what is open. The
palette reaches both from the keyboard, and reaches the commands. Four
rules keep them from doing the same work twice.

1. **One road opens a request.** A click on a request in the tree and a
   request found in the palette both go through the sidebar's
   `loadRequest` to the composer's `loadCollectionRequest`, as the
   palette's "Load into composer" does today. A found request uses that
   road; it does not get one of its own.
2. **One list of commands.** Today it is split three ways: the shell's
   `sidebarPaletteActions`, passed into the sidebar's own
   `buildPaletteActions`, and Settings' `fixedShortcuts`, written by hand.
   D4-f makes it one list in the shell: each command has its id, its name,
   its shortcut if it has one, and whether it acts on the sidebar's
   selection. The palette, the tooltips and Settings, Shortcuts all read
   it.
3. **What a context menu offers, the palette offers.** For the item
   selected in the tree, the palette has every command of that row's
   context menu, in a group named for the item. Today it lacks Run,
   Settings and Rename for a collection or a folder, and Rename for a
   request; D4-f adds them.
   The same holds for a tab's context menu and the open tab.
4. **The palette is never the only road.** Every command has a control
   somewhere: Reset all data, for one, is also in Settings, Danger zone. A
   row's own controls (a header's remove) and a dialog's buttons have no
   command.

## Decisions

### U-010: the sidebar's header

The header keeps the title and two menu buttons with their words: **New**
(Collection, with its key `C`; Request and Folder in the selected
collection or folder, with `N` for a request) and **Import** (File…, cURL
command…). The lightning bolt goes to the toolbar as the palette's field
(U-011). Each icon that stood alone is now an item with its name.
Maintainer, 2026-10-22.

### U-011: the palette

The palette is the shell's, not the sidebar's: today it is drawn inside
`collections-sidebar.html` because that component reads ⌘K, so on a phone
it opens from a drawer. It is reached from a field in the toolbar ("Search
or run a command", with its ⌘K keycap) and from ⌘K anywhere.

It finds, in groups: commands; requests by name, method and address;
collections and folders; environments, where Enter makes one active; and
past requests from History, newest first. It has no title and no close
button. Each row shows a command's shortcut as keycaps at its right. Names
are in sentence case ("New collection"), and a shortcut is never written
in a label ("New Tab (Alt+T)" today). Maintainer, 2026-10-22.

### U-016: one Export

A collection's menu has one **Export…**, which opens the dialog the Postman
export has today, with the format (Wayfarer, or Postman v2.1) and the
credentials (masked, the default, or included) as its two choices. "Export
with credentials" and "Export for Postman…" are no longer items of their
own. The palette's command is the same Export…. Maintainer, 2026-10-22.

### U-027: the tab strip

Each tab has its own close button (×), which is not a stop of its own for
Tab: Alt+W closes the open tab, and Delete closes a focused one. New (+)
follows the last tab. Duplicate moves from the strip to a tab's context
menu (right-click, or Shift+F10 on a focused tab) and to the palette. The
unsaved mark is D4-f's to draw in a colour other than the accent of the
open tab's underline. Maintainer, 2026-10-22.

### U-032: shortcuts shown where they work

Every control with a shortcut shows it: in its tooltip ("New tab ⌥T"), in
the palette as keycaps, and in a menu beside its item (`C` and `N` in the
sidebar's New menu). Settings, Shortcuts is read from the command list
(rule 2), plus the keys of the widgets below, so it cannot fall behind
the app.

**Send and Save (D4-c).** Send is ⌘↵ on a Mac and Ctrl+Enter elsewhere;
Save is ⌘S or Ctrl+S. They are Postman's keys and Hoppscotch's, and
Insomnia sends with Ctrl+Enter too, so a person moving over keeps their
habits. Ctrl+S is the browser's Save page, which is never what is meant
in an API client, so the app takes it. They work from anywhere in the page, inside an editor
too (they are read before Monaco, which would insert a line), and not under
a dialog. Enter in the address sends as well, as in those three tools:
the field has one line, and Enter did nothing in it. Both keys show where
they work: in Send's and Save's tooltips, at the right of their commands in
the palette, and in Settings, Shortcuts, which now reads the commands' keys
from the palette's list. The keys are written in the reader's own system's
form ([`voice.md`](voice.md#shortcuts)).

## Removed

None of these leaves the keyboard's reach.

| Action | Why | Its road now |
|---|---|---|
| The address row's +, which empties the open tab | A second meaning for "new request" (maintainer, 2026-10-22) | New tab: the strip's +, Alt+T, the palette |
| "Start a new request instead", under a saved request's address | The same (maintainer, 2026-10-22); its border was U-037 | New tab |
| The palette's "Load … into composer" | The palette finds the request itself (U-011) | Type its name in the palette |
| "Export with credentials" and "Export for Postman…" as menu items | One Export… (U-016, maintainer, 2026-10-22) | Export…, with the choice in its dialog |
| Duplicate tab as a button of the strip | It acted on a tab far from it (U-027, maintainer, 2026-10-22) | A tab's context menu, the palette |
| The environment editor's Save changes | The editor writes each field as focus leaves it (DQ9, row 1.52; U-060) | Nothing to do: leaving a field, closing the editor or choosing another environment keeps the edit |

The palette's "New request" and "New tab" become one command, since both
now open a tab. The drawer's "New request" button, which also empties the
open tab today, opens a new one.

## Keys of the widgets

The test does not read these from the code: they are the widgets' own
(`src/app/ui`), tested in their specs. They stay where they are; U-032
lists them in Settings, Shortcuts.

| Keys | Where | What they do |
|---|---|---|
| Arrows, Home, End, a letter | The tree | Move between rows; a letter finds a row by its name |
| Enter, Space, a click | The tree | Open a request, or open or close a collection or folder |
| F2 | The tree | Rename the row |
| Alt+↑, Alt+↓, a drag | The tree | Move the row among its siblings |
| Shift+F10, right-click | The tree; a tab (U-027) | Open the context menu |
| Arrows, Home, End | Every tab bar | Move between tabs, and choose one |
| Arrows, Home, End, a letter; Alt+↓ | Every select | Choose without opening; open the list |
| Esc; Tab and Shift+Tab | Every dialog | Ask to close; move focus, wrapping inside the dialog |
| Enter, Shift+Enter | The WebSocket view's message | Send it; a new line |

## Inventory

One row per action. **Action** is what the test reads: the template's file
and the control's name (its `aria-label`, its tooltip or its text, and for
a control with none, the code it runs); `palette:` and a command's id;
`shortcut:` and a shortcut's name in `src/app/shared/shortcuts.ts`, or the
keys Settings lists besides those; `menu` and the file that builds
the menu. **Place** is where the action lives after D4; **Session** is the
session of row 1.35 that moves or rebuilds it, and "—" means it stays as
it is.

### Shell

| Action | Today | Place | Session |
|---|---|---|---|
| `app-shell.html: Close navigation` | Sidebar as a drawer (below 1,200 px) | Sidebar | — |
| `app-shell.html: New request` | Sidebar as a drawer, above the tree; empties the open tab | Sidebar as a drawer; opens a new tab, as New tab does | D4-f |
| `app-shell.html: Clear all history` | History drawer (toolbar) | Toolbar, History drawer | D4-f |
| `app-shell.html: Close history` | History drawer (toolbar) | Toolbar, History drawer | — |
| `app-shell.html: Toggle sidebar` | Toolbar | Toolbar | — |
| `app-shell.html: Environment` | Toolbar, select | Toolbar; the palette also switches it (U-011) | D4-f |
| `app-shell.html: Environments` | Toolbar, icon `dns` | Toolbar; D4-g decides whether it gains its word (U-006) | D4-g |
| `app-shell.html: Lock secrets / Unlock secrets` | Toolbar below 768 px | Same | — |
| `app-shell.html: Request history` | Toolbar | Toolbar | — |
| `app-shell.html: Settings` | Toolbar | Toolbar | — |
| `app-shell.html: Reload` | Banner, update ready | Banner | — |
| `app-shell.html: Back up now` | Banner, backup reminder | Banner | — |
| `app-shell.html: Not now` | Banner, backup reminder | Banner | — |
| `app-shell.html: Dismiss` | Banner, storage state | Banner | — |
| `app-shell.html: Local Bridge settings` | Status bar, the route | Status bar | — |
| `app-shell.html: Data and storage settings` | Status bar, "Saved in this browser, which may delete it" while the browser has not promised to keep the data (D4-e, U-137) | Status bar | — |
| `app-shell.html: Manage the vault's secrets` | Status bar, "Secrets" (one button with its words since D4-e, U-072) | Status bar | — |
| `app-shell.html: Theme:` | Status bar, "Theme: system / light / dark", in turn (D4-e, U-087); Settings, General | Same | — |
| `app-shell.html: Lock the vault / Unlock the vault` | Status bar, "Vault locked / Vault unlocked" (D4-e, U-072) | Status bar | — |
| `app-shell.html: Choose a passphrase / Passphrase` | Unlock dialog, Enter in the passphrase (named since D4-e, U-062) | Status bar, Unlock dialog | D4-g |
| `app-shell.html: unlockSecrets()` | Unlock dialog, Enter in the confirmation | Status bar, Unlock dialog | D4-g |
| `app-shell.html: Cancel` | Unlock dialog | Status bar, Unlock dialog | D4-g |
| `app-shell.html: Create vault / Unlock secrets` | Unlock dialog | Status bar, Unlock dialog | D4-g |

### Toolbar

| Action | Today | Place | Session |
|---|---|---|---|
| `environment-export-dialog.html: File for` | Export environments dialog (Environments) | Toolbar, Environments dialog | D4-g |
| `environment-export-dialog.html: Environment` | Export environments dialog (Environments) | Toolbar, Environments dialog | D4-g |
| `environment-export-dialog.html: Protected variables` | Export environments dialog (Environments) | Toolbar, Environments dialog | D4-g |
| `environment-export-dialog.html: Cancel` | Export environments dialog (Environments) | Toolbar, Environments dialog | D4-g |
| `environment-export-dialog.html: Export file` | Export environments dialog (Environments) | Toolbar, Environments dialog | D4-g |
| `environments-manager.html: Global variables` | Environments dialog (toolbar) | Toolbar, Environments dialog | D4-g |
| `environments-manager.html: Import environments` | Environments dialog (toolbar) | Toolbar, Environments dialog | D4-g |
| `environments-manager.html: Export environments` | Environments dialog (toolbar) | Toolbar, Environments dialog | D4-g |
| `environments-manager.html: New environment` | Environments dialog (toolbar) | Toolbar, Environments dialog; and its empty list's button (D4-c, U-022) | D4-g |
| `environments-manager.html: importPipeline.pick($event)` | Environments dialog (toolbar) | Toolbar, Environments dialog | D4-g |
| `environments-manager.html: selectEnvironment(env.meta.id)` | Environments dialog (toolbar) | Toolbar, Environments dialog | D4-g |
| `environments-manager.html: Use for requests` | Environments dialog (toolbar) | Toolbar, Environments dialog | D4-g |
| `environments-manager.html: Duplicate` | Environments dialog (toolbar) | Toolbar, Environments dialog | D4-g |
| `environments-manager.html: Delete` | Environments dialog (toolbar) | Toolbar, Environments dialog | D4-g |
| `environments-manager.html: Key / Value` | Environments dialog (toolbar) | Toolbar, Environments dialog | D4-g |
| `environments-manager.html: JSON` | Environments dialog (toolbar) | Toolbar, Environments dialog | D4-g |
| `environments-manager.html: Reveal` | Environments dialog (toolbar) | Toolbar, Environments dialog | D4-g |
| `environments-manager.html: Mark variable as secret` | Environments dialog (toolbar) | Toolbar, Environments dialog | D4-g |
| `environments-manager.html: Remove variable` | Environments dialog (toolbar) | Toolbar, Environments dialog | D4-g |
| `environments-manager.html: Add variable` | Environments dialog (toolbar) | Toolbar, Environments dialog | D4-g |
| `environments-manager.html: Passphrase` | Environments dialog, under a row whose lock asked for a vault while there is none (U-136; Enter makes the vault) | Toolbar, Environments dialog | D4-e |
| `environments-manager.html: Confirm passphrase` | The same (Enter makes the vault) | Toolbar, Environments dialog | D4-e |
| `environments-manager.html: Create vault` | The same: makes the vault and marks the row secret (U-135) | Toolbar, Environments dialog | D4-e |
| `environments-manager.html: Cancel` | Environments dialog (toolbar) | Toolbar, Environments dialog | D4-g |
| `environments-manager.html: Create environment` | Environments dialog (toolbar) | Toolbar, Environments dialog | D4-g |
| `past-requests.html: Select none / Select all` | History drawer (toolbar) | Toolbar, History drawer; the palette also finds entries (U-011) | D4-f |
| `past-requests.html: exportChosen()` | History drawer (toolbar) | Toolbar, History drawer; the palette also finds entries (U-011) | D4-f |
| `past-requests.html: Select` | History drawer (toolbar) | Toolbar, History drawer; the palette also finds entries (U-011) | D4-f |
| `past-requests.html: Load request` | History drawer (toolbar) | Toolbar, History drawer; the palette also finds entries (U-011) | D4-f |
| `past-requests.html: details` | History drawer (toolbar) | Toolbar, History drawer; the palette also finds entries (U-011) | D4-f |
| `past-requests.html: Delete history entry` | History drawer (toolbar) | Toolbar, History drawer; the palette also finds entries (U-011) | D4-f |
| `past-requests.html: button` | History drawer, a group's header | Toolbar, History drawer | D4-f |
| `past-requests.html: Delete request` | History drawer (toolbar) | Toolbar, History drawer; the palette also finds entries (U-011) | D4-f |
| `variables-dialog.ts: Cancel` | Global variables dialog (Environments) | Toolbar, Environments dialog | D4-g |
| `variables-dialog.ts: Save variables` | Global variables dialog (Environments) | Toolbar, Environments dialog | D4-g |

### Status bar

| Action | Today | Place | Session |
|---|---|---|---|
| `secrets-manager.html: Unlock secrets vault` | Secrets dialog (status bar, palette) | Status bar, Secrets dialog | D4-g |
| `secrets-manager.html: Secret name` | Secrets dialog (status bar, palette) | Status bar, Secrets dialog | D4-g |
| `secrets-manager.html: Save name` | Secrets dialog (status bar, palette) | Status bar, Secrets dialog | D4-g |
| `secrets-manager.html: Cancel rename` | Secrets dialog (status bar, palette) | Status bar, Secrets dialog | D4-g |
| `secrets-manager.html: Show this variable in its environment.` | Secrets dialog (status bar, palette) | Status bar, Secrets dialog | D4-g |
| `secrets-manager.html: Rename` | Secrets dialog (status bar, palette) | Status bar, Secrets dialog | D4-g |
| `secrets-manager.html: Delete` | Secrets dialog (status bar, palette) | Status bar, Secrets dialog | D4-g |
| `secrets-manager.html: Hide value for` | Secrets dialog (status bar, palette) | Status bar, Secrets dialog | D4-g |
| `secrets-manager.html: Reveal value for` | Secrets dialog (status bar, palette) | Status bar, Secrets dialog | D4-g |

### Sidebar

| Action | Today | Place | Session |
|---|---|---|---|
| `collections-sidebar.html: Open command palette` | Sidebar header, a lightning icon | Toolbar, a field "Search or run a command" with its ⌘K keycap (U-010, U-011) | D4-f |
| `collections-sidebar.html: Import collection` | Sidebar header, an upload icon | Sidebar header, Import menu, "File…" (U-010) | D4-f |
| `collections-sidebar.html: Import a cURL command` | Sidebar header, a terminal icon | Sidebar header, Import menu, "cURL command…" (U-010) | D4-f |
| `collections-sidebar.html: New collection` | Sidebar header, + | Sidebar header, New menu, "Collection" (U-010); and the empty sidebar's button (D4-c, U-022) | D4-f |
| `collections-sidebar.html: Import…` | — (new in D4-c) | The empty sidebar: imports a file, as Import, "File…" (U-022) | — |
| `collections-sidebar.html: importPipeline.pick($event)` | The file picker behind Import collection | Behind Import, "File…" | — |
| `collections-sidebar.html: contextMenu.openAt($event, () => tree.focusSelected())` | A tree row, right-click or Shift+F10 | Sidebar | — |
| `collections-sidebar.html: Rename` | A tree row, F2 or Rename | Sidebar | — |
| `collections-sidebar.html: creationDisabled \|\| submitCreation()` | New collection or request dialog, Enter in the name | Sidebar, same dialog | D4-f |
| `collections-sidebar.html: Method` | New request dialog, method | Sidebar, same dialog | D4-f |
| `collections-sidebar.html: Cancel` | New collection or request dialog | Sidebar, same dialog | D4-f |
| `collections-sidebar.html: Create` | New collection or request dialog | Sidebar, same dialog | D4-f |
| `collections-sidebar.html: executeFirstPaletteAction()` | Palette, Enter in its field | Palette | D4-f |
| `collections-sidebar.html: executePaletteAction(action)` | Palette, a row | Palette, a row: a command or a found request, collection, environment or history entry (U-011) | D4-f |
| `inherited-settings-dialog.html: Auth` | A collection's or folder's Settings dialog (context menu) | Sidebar, same dialog | D4-f |
| `inherited-settings-dialog.html: Variables` | A collection's or folder's Settings dialog (context menu) | Sidebar, same dialog | D4-f |
| `inherited-settings-dialog.html: Scripts` | A collection's or folder's Settings dialog (context menu) | Sidebar, same dialog | D4-f |
| `inherited-settings-dialog.html: Route` | A collection's or folder's Settings dialog (context menu) | Sidebar, same dialog | D4-f |
| `inherited-settings-dialog.html: How the requests of this collection are sent, unless a request names its own route. Auto sends from the page, and through the Local Bridge when the browser could not.` | A collection's or folder's Settings dialog (context menu) | Sidebar, same dialog | D4-f |
| `inherited-settings-dialog.html: Cancel` | A collection's or folder's Settings dialog (context menu) | Sidebar, same dialog | D4-f |
| `inherited-settings-dialog.html: Save settings` | A collection's or folder's Settings dialog (context menu) | Sidebar, same dialog | D4-f |
| `postman-export-dialog.html: Include credentials` | Export for Postman dialog | Sidebar, Export… dialog, with the format beside it (U-016) | D4-f |
| `postman-export-dialog.html: Cancel` | Export for Postman dialog (context menu) | Sidebar, the one Export… dialog (U-016) | D4-f |
| `postman-export-dialog.html: Export file` | Export for Postman dialog (context menu) | Sidebar, the one Export… dialog (U-016) | D4-f |
| `import-dialog.html: Read the command` | Import report dialog (sidebar, Settings, a pasted cURL command) | Same dialog | D4-h |
| `import-dialog.html: Import as duplicate` | Import report dialog (sidebar, Settings, a pasted cURL command) | Same dialog | D4-h |
| `import-dialog.html: Merge as new` | Import report dialog (sidebar, Settings, a pasted cURL command) | Same dialog | D4-h |
| `import-dialog.html: Replace existing` | Import report dialog (sidebar, Settings, a pasted cURL command) | Same dialog | D4-h |
| `import-dialog.html: Cancel` | Import report dialog (sidebar, Settings, a pasted cURL command) | Same dialog | D4-h |
| `import-dialog.html: Import` | Import report dialog (sidebar, Settings, a pasted cURL command) | Same dialog | D4-h |
| `menu collection-context-menu.ts: Run…` | Context menu of a tree row | Sidebar, context menu | D4-f |
| `menu collection-context-menu.ts: New Folder` | Context menu of a tree row | Sidebar, context menu | D4-f |
| `menu collection-context-menu.ts: New Request` | Context menu of a tree row | Sidebar, context menu | D4-f |
| `menu collection-context-menu.ts: Settings` | Context menu of a tree row | Sidebar, context menu | D4-f |
| `menu collection-context-menu.ts: Rename` | Context menu of a tree row | Sidebar, context menu | D4-f |
| `menu collection-context-menu.ts: Duplicate` | Context menu of a tree row | Sidebar, context menu | D4-f |
| `menu collection-context-menu.ts: Export` | Collection's menu | Sidebar, context menu, "Export…", one dialog with the format and the credentials (U-016) | D4-f |
| `menu collection-context-menu.ts: Export with credentials` | Collection's menu | **Merged** into Export… (maintainer, 2026-10-22) | D4-f |
| `menu collection-context-menu.ts: Export for Postman…` | Collection's menu | **Merged** into Export… (maintainer, 2026-10-22) | D4-f |
| `menu collection-context-menu.ts: Delete` | Context menu of a tree row | Sidebar, context menu | D4-f |

### Tab strip

| Action | Today | Place | Session |
|---|---|---|---|
| `tab-strip.html: RUN / WS` | A tab | Tab strip; gains its own close button and a context menu (U-027) | D4-f |
| `tab-strip.html: New tab` | End of the strip, +; Alt+T | Tab strip, + after the last tab; Alt+T (U-027) | D4-f |
| `tab-strip.html: Duplicate tab` | End of the strip | A tab's context menu (right-click, Shift+F10) and the palette (U-027) | D4-f |
| `tab-strip.html: Close tab` | End of the strip; Alt+W | Each tab's ×; Alt+W, and Delete on a focused tab (U-027) | D4-f |
| `run-view.html: Cancel run` | A run's tab | A run's tab | D4-i |
| `run-view.html: Run again / Run` | A run's tab | A run's tab | D4-i |
| `run-view.html: setIterations($any($event.target).value)` | A run's tab | A run's tab | D4-i |
| `run-view.html: setDelay($any($event.target).value)` | A run's tab | A run's tab | D4-i |
| `run-view.html: Stop on the first failure` | A run's tab | A run's tab | D4-i |
| `run-view.html: Data file…` | A run's tab | A run's tab | D4-i |
| `run-view.html: Remove` | A run's tab | A run's tab | D4-i |
| `run-view.html: Data file for the run` | A run's tab | A run's tab | D4-i |
| `run-view.html: Failed only` | A run's tab | A run's tab | D4-i |
| `run-view.html: JSON` | A run's tab | A run's tab | D4-i |
| `run-view.html: JUnit XML` | A run's tab | A run's tab | D4-i |
| `run-view.html: HAR…` | A run's tab | A run's tab | D4-i |

### Composer

| Action | Today | Place | Session |
|---|---|---|---|
| `composer.html: Paste a cURL command` | — (new in D4-c) | The empty response: opens Import's box for a cURL command (U-022) | — |
| `composer.html: Import a collection…` | — (new in D4-c) | The empty response: picks a file to import (U-022) | — |
| `composer.html: importPipeline.pick($event)` | — (new in D4-c) | The file picker behind Import a collection… | — |
| `address-row.html: Common methods` | Address row, the method | Composer, address row | — |
| `address-row.html: Copy as cURL` | Address row | Composer, address row | D4-d |
| `address-row.html: Save / Save to collection…` | Address row | Composer, address row; its tooltip shows ⌘S or Ctrl+S (U-032) | D4-c |
| `address-row.html: Connect / Disconnect` | Address row, for a `ws:` address | Composer, address row | D4-e |
| `address-row.html: Cancel request / Send request` | Address row | Composer, address row; Send's tooltip shows ⌘↵ or Ctrl+Enter (U-032) | D4-c |
| `address-row.html: Address` | — (new in D4-c) | Composer, address: Enter sends; its error is under it and names it (`aria-describedby`) | D4-d |
| `auth-editor.html: Type` | Auth tab | Composer, Auth tab | D4-d |
| `auth-editor.html: Hide password / Show password` | Auth tab | Composer, Auth tab | D4-d |
| `auth-editor.html: Add to` | Auth tab | Composer, Auth tab | D4-d |
| `auth-editor.html: Hide secret key / Show secret key` | Auth tab | Composer, Auth tab | D4-d |
| `oauth-fields.html: Grant` | Auth tab, OAuth 2.0 | Composer, Auth tab, OAuth 2.0: under the redirect URI and the token (U-045) | D4-d |
| `oauth-fields.html: Hide client secret / Show client secret` | Auth tab, OAuth 2.0 | Composer, Auth tab, OAuth 2.0: under the redirect URI and the token (U-045) | D4-d |
| `oauth-fields.html: Client sent in` | Auth tab, OAuth 2.0 | Composer, Auth tab, OAuth 2.0: under the redirect URI and the token (U-045) | D4-d |
| `oauth-fields.html: On a 401, get a new token and send once more` | Auth tab, OAuth 2.0 | Composer, Auth tab, OAuth 2.0: under the redirect URI and the token (U-045) | D4-d |
| `body-panel.html: Body` | Body tab | Composer, Body tab | D4-d |
| `body-panel.html: Raw body language` | Body tab | Composer, Body tab | D4-d |
| `browser-notes.html: Route` | Settings tab of the request | Composer, Settings tab | D4-d |
| `browser-notes.html: Follow redirects` | Settings tab of the request | Composer, Settings tab | D4-d |
| `browser-notes.html: Do not verify the server's certificate` | Settings tab of the request | Composer, Settings tab | D4-d |
| `browser-notes.html: What each of these means, and what the Local Bridge changes` | Settings tab of the request | Composer, Settings tab | D4-d |
| `composer-sections.html: Params` | Composer, sections as an accordion below 768 px | Composer | D4-d |
| `composer-sections.html: Headers` | Composer, sections as an accordion below 768 px | Composer | D4-d |
| `composer-sections.html: Body` | Composer, sections as an accordion below 768 px | Composer | D4-d |
| `composer-sections.html: Auth` | Composer, sections as an accordion below 768 px | Composer | D4-d |
| `composer-sections.html: Scripts` | Composer, sections as an accordion below 768 px | Composer | D4-d |
| `composer-sections.html: Settings` | Composer, sections as an accordion below 768 px | Composer | D4-d |
| `composer.html: Send anyway` | Beside an unresolved variable's error | Composer (U-037) | D4-d |
| `composer.html: Request` | — (new in D4-d) | Composer below 768 px: the request's parts, a pane of their own (U-028) | D4-d |
| `composer.html: Response` | — (new in D4-d) | Composer below 768 px: the response, a pane of its own; a send opens it (U-028) | D4-d |
| `composer.html: Params` | Composer | Composer | D4-d |
| `composer.html: Headers` | Composer | Composer | D4-d |
| `composer.html: Body` | Composer | Composer | D4-d |
| `composer.html: Auth` | Composer | Composer | D4-d |
| `composer.html: Scripts` | Composer | Composer | D4-d |
| `composer.html: Settings` | Composer | Composer | D4-d |
| `headers-panel.html: Edit as rows / Edit as text` | Headers tab | Composer, Headers tab | D4-d |
| `multipart-editor.html: Send part` | Body tab, multipart form | Composer, Body tab | D4-d |
| `multipart-editor.html: Part type, row` | Body tab, multipart form | Composer, Body tab | D4-d |
| `multipart-editor.html: Remove part` | Body tab, multipart form | Composer, Body tab | D4-d |
| `multipart-editor.html: Add part` | Body tab, multipart form | Composer, Body tab | D4-d |
| `oauth-token.html: Get token` | Auth tab, OAuth 2.0 | Composer, Auth tab | D4-d |
| `oauth-token.html: Cancel sign-in` | Auth tab, OAuth 2.0 | Composer, Auth tab | D4-d |
| `oauth-token.html: Forget token` | Auth tab, OAuth 2.0 | Composer, Auth tab | D4-d |
| `params-panel.html: Send parameter` | Params tab | Composer, Params tab | D4-d |
| `params-panel.html: Remove parameter` | Params tab | Composer, Params tab | D4-d |
| `params-panel.html: Add parameter` | Params tab | Composer, Params tab | D4-d |
| `rows-editor.html: Send` | Rows of a key-value editor (headers, a collection's variables) | Same rows | D4-d |
| `rows-editor.html: Remove` | Rows of a key-value editor (headers, a collection's variables) | Same rows | D4-d |
| `rows-editor.html: addLabel()` | Rows of a key-value editor (headers, a collection's variables) | Same rows | D4-d |
| `save-as-dialog.html: Collection` | Save as dialog | Composer, Save as dialog | D4-d |
| `save-as-dialog.html: Folder (optional)` | Save as dialog | Composer, Save as dialog | D4-d |
| `save-as-dialog.html: Cancel` | Save as dialog | Composer, Save as dialog | D4-d |
| `save-as-dialog.html: Save` | Save as dialog | Composer, Save as dialog | D4-d |
| `script-review-dialog.html: Not now` | Script review dialog (on send, on import) | Same dialog | D4-d |
| `script-review-dialog.html: Trust these scripts` | Script review dialog (on send, on import) | Same dialog | D4-d |
| `scripts-panel.html: Review scripts` | Scripts tab | Composer, Scripts tab | D4-d |
| `tests-panel.html: Assert on` | Scripts tab, tests | Composer, Scripts tab | D4-d |
| `tests-panel.html: Operator` | Scripts tab, tests | Composer, Scripts tab | D4-d |
| `tests-panel.html: Remove test` | Scripts tab, tests | Composer, Scripts tab | D4-d |
| `tests-panel.html: Add test` | Scripts tab, tests | Composer, Scripts tab | D4-d |
| `variable-chips.html: Show` | Chips under the address, one per variable | Composer; opens Environments at the variable | D4-d |
| `menu address-row.ts: Copy as cURL` | Address row, Copy as cURL menu | Composer, same menu | D4-d |
| `menu address-row.ts: Copy as cURL with credentials` | Address row, Copy as cURL menu | Composer, same menu | D4-d |
| `menu address-row.ts: Copy as JavaScript (fetch)` | Address row, Copy as cURL menu | Composer, same menu | D4-d |
| `menu address-row.ts: Copy as Python (requests)` | Address row, Copy as cURL menu | Composer, same menu | D4-d |
| `menu address-row.ts: Copy as HTTPie` | Address row, Copy as cURL menu | Composer, same menu | D4-d |

### Response

| Action | Today | Place | Session |
|---|---|---|---|
| `har-export-dialog.html: Include credentials` | Export as HAR dialog | Same dialog | D4-e |
| `har-export-dialog.html: Cancel` | Export as HAR dialog (response, history, a run) | Same dialog | D4-e |
| `har-export-dialog.html: Copy` | Export as HAR dialog (response, history, a run) | Same dialog | D4-e |
| `har-export-dialog.html: Save file` | Export as HAR dialog (response, history, a run) | Same dialog | D4-e |
| `event-list.html: Stop` | Response, event stream | Response | D4-e |
| `event-list.html: Reconnect` | Response, event stream | Response | D4-e |
| `response-viewer.html: Export response` | Response | Response | D4-e |
| `response-viewer.html: Body` | Response | Response | D4-e |
| `response-viewer.html: Headers` | Response | Response | D4-e |
| `response-viewer.html: Timings` | Response | Response | D4-e |
| `response-viewer.html: Events` | Response | Response | D4-e |
| `response-viewer.html: Tests` | Response | Response | D4-e |
| `response-viewer.html: View the body as` | Response | Response | D4-e |
| `response-viewer.html: Previous search match` | Response | Response | D4-e |
| `response-viewer.html: Next search match` | Response | Response | D4-e |
| `response-viewer.html: Download response body` | Response | Response | D4-e |
| `response-viewer.html: Exchange record` | — (new in D4-l, D4.12): the end of the status line, "Direct to {host}"; opens and closes the record under it | Response, status line | D4-l |
| `exchange-record.html: Send through the Local Bridge` | Exchange record, after a send that got no response from the page (D4-e, U-051; moved into the record in D4-l) | Response, exchange record; D4.12 adds pairing in place (DQ10) | D4-l |
| `socket-view.html: Send message` | WebSocket view | Response, WebSocket view | D4-e |
| `socket-view.html: Check it is JSON before sending` | WebSocket view (was "Must be JSON", U-103) | Response, WebSocket view | D4-e |
| `socket-view.html: Messages to show` | — (new in D4-e, U-048): All, Received, Sent | Response, WebSocket view, above the log | D4-e |
| `socket-view.html: As sent / Format JSON` | — (new in D4-e, U-048): a message that is JSON, formatted | Response, WebSocket view, in the log's row | D4-e |
| `socket-view.html: Clear log` | WebSocket view | Response, WebSocket view | D4-e |
| `menu response-viewer.ts: Copy as cURL` | Response, Export menu | Response, same menu | D4-e |
| `menu response-viewer.ts: Copy as HAR` | Response, Export menu | Response, same menu | D4-e |
| `menu response-viewer.ts: Copy as cURL with credentials` | Response, Export menu | Response, same menu | D4-e |
| `menu response-viewer.ts: Copy as HAR with credentials` | Response, Export menu | Response, same menu | D4-e |
| `menu response-viewer.ts: Export as HAR…` | Response, Export menu | Response, same menu | D4-e |

### Palette

| Action | Today | Place | Session |
|---|---|---|---|
| `palette: new-request` | Palette; empties the open tab | Palette, "New request": a new tab, one command with new-tab | D4-f |
| `palette: new-tab` | Palette | Palette, the same command as new-request, with its keycap | D4-f |
| `palette: duplicate-tab` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: close-tab` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: send-request` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: save-request` | — (new in D4-c) | Palette (the shell's), with its keycap | D4-f |
| `palette: environments` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: focus-address-bar` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: toggle-theme` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: toggle-sidebar` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: open-history` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: lock-secrets` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: unlock-secrets` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: open-secrets-manager` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: open-local-bridge-settings` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: reset-all-data` | Palette; Settings, Danger zone | Same | — |
| `palette: open-settings` | Palette; toolbar | Same | — |
| `palette: new-collection` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: new-folder` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: new-request-collection` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: duplicate-collection` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: export-collection` | Palette, the collection selected in the tree | Palette, "Export…" (U-016) | D4-f |
| `palette: delete-collection` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: new-request-folder` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: duplicate-folder` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: delete-folder` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: load-request` | Palette, the request selected in the tree | **Removed**: a request found by its name, method or address opens it (U-011) | D4-f |
| `palette: duplicate-request` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |
| `palette: delete-request` | Palette (opened from the sidebar's header or ⌘K) | Palette (the shell's) | D4-f |

### Shortcuts

| Action | Today | Place | Session |
|---|---|---|---|
| `shortcut: palette` | ⌘K or Ctrl+K, anywhere | Anywhere; keycap in the palette button's tooltip (D4-c), and in the toolbar's palette field | D4-f |
| `shortcut: newTab` | ⌥T or Alt+T, anywhere | Anywhere; keycap in the + tooltip and the palette (D4-c) | — |
| `shortcut: closeTab` | ⌥W or Alt+W, anywhere | Anywhere; keycap in the close tooltip and the palette (D4-c) | — |
| `shortcut: send` | — (new in D4-c) | ⌘↵ or Ctrl+Enter, anywhere but under a dialog; keycap in Send's tooltip and the palette | — |
| `shortcut: save` | — (new in D4-c) | ⌘S or Ctrl+S, anywhere but under a dialog; keycap in Save's tooltip and the palette | — |
| `shortcut: C` | Sidebar focused | Sidebar focused; keycap in the New menu | D4-c |
| `shortcut: N` | Sidebar focused | Sidebar focused; keycap in the New menu | D4-c |
| `shortcut: Delete` | Sidebar focused | Sidebar focused, and a focused tab (U-027) | D4-c |
| `shortcut: Escape` | Any dialog, drawer, menu or the palette | Same | — |

### Settings

| Action | Today | Place | Session |
|---|---|---|---|
| `vault-actions.html: Change passphrase` | Settings, Vault | Settings, Vault | D4-g |
| `vault-actions.html: Export vault` | Settings, Vault | Settings, Vault | D4-g |
| `vault-actions.html: Import vault` | Settings, Vault | Settings, Vault | D4-g |
| `vault-actions.html: Cancel` | Settings, Vault | Settings, Vault | D4-g |
| `vault-actions.html: Change passphrase / Export / Import` | Settings, Vault | Settings, Vault | D4-g |
| `bridge-pane.html: Route` | Settings, Local Bridge | Settings, Local Bridge | D4-h |
| `bridge-pane.html: Pair` | Settings, Local Bridge | Settings, Local Bridge | D4-h |
| `bridge-pane.html: Hide bridge token / Show bridge token` | Settings, Local Bridge | Settings, Local Bridge | D4-h |
| `bridge-pane.html: Test connection` | Settings, Local Bridge | Settings, Local Bridge | D4-h |
| `bridge-pane.html: Discard` | Settings, Local Bridge | Settings, Local Bridge | D4-h |
| `bridge-pane.html: Save` | Settings, Local Bridge | Settings, Local Bridge | D4-h |
| `bridge-pane.html: Setup and security model` | Settings, Local Bridge | Settings, Local Bridge | D4-h |
| `cookies-pane.html: Delete cookie` | Settings, Cookies | Settings, Cookies | D4-h |
| `cookies-pane.html: jar.setValue(cookie, $any($event.target).value)` | Settings, Cookies | Settings, Cookies | D4-h |
| `cookies-pane.html: Delete all…` | Settings, Cookies | Settings, Cookies | D4-h |
| `diagnostics-pane.html: Run self-tests` | Settings, Diagnostics | Settings, Diagnostics | D4-h |
| `diagnostics-pane.html: Copy report` | Settings, Diagnostics | Settings, Diagnostics | D4-h |
| `diagnostics-pane.html: Open GitHub issue` | Settings, Diagnostics | Settings, Diagnostics | D4-h |
| `settings.html: open(entry.id)` | Settings | Settings | D4-h |
| `settings.html: All settings` | Settings | Settings | D4-h |

### Widgets

| Action | Today | Place | Session |
|---|---|---|---|
| `confirm.ts: Proceed` | Every confirmation | Same | — |
| `confirm.ts: Cancel` | Every confirmation | Same | — |
| `dialog.ts: Close` | Every dialog's header | Same | — |
| `file.ts: Choose another… / Choose a file…` | — (new in D4-d, D3.5) | Every file field: the binary body, a multipart part, the vault's import | — |
| `file.ts: Remove` | — (new in D4-d, D3.5) | Every file field, once it has a file | — |
| `file.ts: label()` | — (new in D4-d, D3.5) | Every file field: the hidden input, named for what the file is for | — |
| `segmented.ts: valueChange.emit(option.value)` | Every segmented choice | Same | — |
| `select.ts: host.getAttribute('aria-label')` | Every select | Same | — |
| `splitter.ts: ariaLabel()` | — (new in D4-e, U-064): a click on either side of the line moves it, a double click resets it; a drag and the arrow keys as before | The split between the request and the response | — |
| `tree.ts: ariaLabel()` | The collections tree | Sidebar | — |
| `tree.ts: node.ariaLabel ?? node.label` | The collections tree | Sidebar | — |

