# Widget bake-off, 2026 (D1.5)

[The design plan](../../PLAN-design.md)'s D1.5 asks which layer the app's
widgets are built on: Angular Material, as today; Angular Aria, the
headless patterns, with our own styles; or the platform's own elements.
This page is what was built to decide it, what was measured, and the
recommendation. The decision is the maintainer's.

## What was built

The three hardest widgets the app has, each in every candidate, over one
shared model (`src/bakeoff/model.ts` and `state.ts`), so that only the
widget layer differs:

- **A tree** like the collections list: two collections, folders and
  requests; one selected row; Enter and a click open a row; drag and
  Alt+ArrowUp/Down reorder a row among its siblings; a letter moves to the
  next row that starts with it.
- **A select** of environments whose first choice, "No environment", is
  `null` and shows the placeholder.
- **A context menu** on a row, by right-click at the pointer and by
  Shift+F10 at the row, whose items depend on the row.

The candidates:

| Candidate | Tree | Select | Menu |
|---|---|---|---|
| Material | the app's `ui-tree` (`mat-tree`) | `mat-select` | `mat-menu` with `matContextMenuTriggerFor` |
| Aria 22.2.3 | `ngTree` | `ngCombobox` on a `div`, `ngListbox` in a CDK overlay | `ngMenu` in a CDK overlay |
| Platform | ours, to WAI-ARIA's tree pattern | native `<select>` (`appearance: base-select` where there is one) | `popover`, placed and keyed by us |

The prototype is the branch `proto/d1.5-widgets` (commit `ef16e81`), at
`/app/?bakeoff=material`, `aria` or `platform`. It is never merged.

## The tests

`e2e/bakeoff.spec.ts` on that branch: the same 20 checks for each
candidate, in Chromium, Firefox and WebKit (the Playwright image
`mcr.microsoft.com/playwright:v1.64.1-noble`, the built app under its CSP):

- axe 4.14, every impact, in both themes, and with the menu and the select open;
- the roles and names a screen reader reads: the tree, each row's level and
  expanded state, the select's name and placeholder;
- Tab into the tree lands on its top row, and on the selected row when
  there is one; Tab leaves it;
- ArrowUp/Down/Left/Right, Home and End as WAI-ARIA's tree pattern says;
  typeahead; Enter;
- Alt+Arrow reorder with focus kept on the moved row; drag before a sibling;
- the menu: Shift+F10 and right-click open it, at the row and at the
  pointer, with that row's items; the first item takes focus; arrows; Enter
  runs an item; Escape and a click outside close it; focus goes back to the
  row;
- the select: Enter opens it, End and Enter choose, Home and Enter give back
  the placeholder, Enter on the current choice closes it, Escape changes
  nothing, focus stays on it;
- a tree of 1,000 requests with every folder open: the time from the
  page's start to its last row, and End to the last row.

**Result: every check passes in every candidate and every engine**, three
runs each: 513 passed, 0 failed, 0 flaky. 27 were skipped: the native
select's list belongs to the browser, so its keyboard checks were not run
for the platform.

That every candidate passes is the finding. What tells them apart is what
it took to get there, and what each costs.

## What each needed

**Material** needed nothing new. Its tree is `ui-tree`, 289 lines that
already work around `mat-tree` three times (each with a test), and the
candidate is 82 lines. The cost is elsewhere: `CLAUDE.md` holds 34 rules
for Material, `material-theme.scss` 19 override mixins, and the design
system 179 selectors that reach into Material's own classes (`.mat-*`,
`.mdc-*`).

**Aria** (247 lines) needed six things, each found by a check above:

1. Angular's own select example closes on the listbox's Enter. Aria passes
   the Enter that opens the list a second time on to the listbox, so the
   list closed as it opened. Committing on the listbox's `valueChange`
   (with `selectionMode="explicit"`) fixes it.
2. Enter on the choice already made changes no value, so nothing closed the
   list: a guard notes whether the list was open when the key came.
3. The page commits the choice and closes the list itself; the combobox
   does neither.
4. `TreeItem.level()` throws when read in the item's own binding at first
   render (`Cannot read properties of undefined (reading 'level')`):
   indentation comes from the group's padding instead.
5. With each group inside its item, axe finds `label-content-name-mismatch`
   on every open folder (its text holds its children's). Aria writes
   `aria-level`, `aria-setsize` and `aria-posinset` on each item, so the
   group's list can be layout only (`role="none"`) and the tree flat, as
   Material's is.
6. On Linux and macOS the context menu opens on the button's press; the
   CDK took its release for a click outside and closed the menu. Material's
   trigger handles this; for Aria it is ours.

And one it does not fix: in Chromium the select drops a key that comes
within 10 ms of the key that opened it (End after Enter chose nothing at 0
and 10 ms and was right from 25 ms; Firefox and WebKit were right at 0 ms).
A person does not type that fast; a test, a macro or a screen reader's
command can.

Aria has no positioning: its menus and lists are placed by the CDK's
overlay, and it needs `@angular/cdk` as a peer dependency.

**The platform** (254 lines) needed every key of the tree and the menu
written by us, and two bugs found and fixed in our own code:

1. A popover's light dismiss took the release of the right button that
   opened it for a click outside: on Linux and macOS the menu is now shown
   at that release.
2. Under zoneless change detection the roving `tabindex` was written at the
   next render: a quick Tab after a click found the old row. The tab stop
   is written at once.

The native select needs no keyboard code, and cannot be styled the same
in every engine: `appearance: base-select` is in Chromium only.

## What each costs

**Bundle**, the candidate alone over an empty Angular app (the
`size-*` projects of the branch's `angular.json`, production build, the
initial JavaScript):

| | Raw | Estimated transfer |
|---|---|---|
| Material | 323 kB | 77 kB |
| Aria (with the CDK overlay) | 184 kB | 42 kB |
| Platform | 44 kB | 13 kB |

In the app as it is (`main`, 1.30 MB of first-bundle JavaScript),
`@angular/material` is 28% of that bundle's code and `@angular/cdk` 10%,
by the build's esbuild metafile (which counts the code before the last
minification, so its shares hold better than its sizes). The bake-off covers three widgets; the app imports 16 of
Material's entry points.

**Rendering**, the 1,000-row tree, from the page's start to its last row,
median of five runs, one worker:

| | Chromium | Firefox | WebKit |
|---|---|---|---|
| Material | 374 ms | 806 ms | 560 ms |
| Aria | 357 ms | 462 ms | 321 ms |
| Platform | 143 ms | 157 ms | 198 ms |

End to the last of those rows took 89 to 111 ms with Material, 92 to
214 ms with Aria and 55 to 84 ms on the platform (medians, by engine).

## Found in all three

In forced colours (Windows' contrast themes; Chromium's emulation) none of
the three marks the selected row: its background is the only mark, and
forced colours remove it. That is our styling, not a library's, and D3.3
fixes it whatever is chosen.

## Recommendation

**Aria for the composite widgets, the platform for the rest, Material
removed family by family in D3.3.**

- Aria for what has a keyboard pattern of its own: the tree, the select,
  menus, tabs, the accordion and toolbars. Its patterns passed every check,
  at 57% of Material's bundle for these three, and 1.7 times as fast to
  draw a large tree in Firefox and WebKit (about the same in Chromium). The six things above become code with a test each.
- The platform for what the browser already does: `<dialog>` for dialogs,
  `popover` for tooltips and hover cards, `<button>`, `<input>` and
  `<input type="checkbox">` with our own styles. They are about 60% of
  Material's code in the first bundle (the form field and input, the
  checkbox, the buttons, the sidenav, the tooltip, the dialog, the spinner,
  the toolbar and the ripple); the composite widgets are the other 40%
  (tabs, menu, select, the accordion, the button toggles, the tree).
- The CDK stays: Aria needs it, and its overlay places menus and lists.
- D3.3 replaces one family per PR, each with its keyboard e2e, and deletes
  `material-theme.scss` and Material's selectors when the last one goes.

Why not stay on Material: every check passed with it, and nothing new had
to be written. Against that are its weight (38% of the first bundle with
the CDK), its rendering (the slowest in every engine), and an override
layer of 19 mixins, 179 selectors into its internals and 34 rules, which
is what the audit's "old and legacy" look and feel is drawn through.

Why not the platform for everything: its tree and menu are the fastest
and smallest, but every key is ours to write and to keep right, and two
bugs were found in about 250 lines. Aria's patterns are those keys,
maintained by Angular's team.

The risk is Aria's age: six workarounds in three widgets. Each is small and
now known, and an upstream report for numbers 1, 4 and the dropped key
would let them go later.
