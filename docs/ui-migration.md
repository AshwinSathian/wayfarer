# UI migration map: PrimeNG → CDK and own components

Working document for Phase 1.5 Part B (plan tasks P1.5.7–P1.5.17). Deleted in P1.5.18.

Measured on `main` at `5fce3a8` (2026-10-07): 26 `primeng/*` entry points in 16 files, the Aura preset in `src/app/app.config.ts`, 26 distinct `pi-*` tokens, 63 distinct `.p-*` selectors (612 lines of `src/design-system/primeng-overrides.css`).

## Rules

- New code lives in `src/app/ui/`: standalone, signal inputs, OnPush, only the options the app uses today.
- Styling comes from `src/design-system/tokens.css` and Tailwind. Each component's CSS replaces its block of `primeng-overrides.css`, which shrinks to nothing by slice 8.
- Tests are written or re-pointed before the swap, against the PrimeNG version, and must pass before and after. Locators use roles and labels.
- Every overlay gets three e2e tests in 3 engines: keyboard only (open, move, activate, Escape), focus returns to the trigger, and the app is clickable after it closes (the F46 lesson).
- After each slice: `SCREENS_OUT=screens/after npx playwright test -c playwright.screens.config.ts`, then compare with `screens/before`. An unexplained difference is a bug.

## Angular Material: not used

The maintainer allowed Material as a fallback. None of the widgets below needs it. The two candidates were select and tree. Material's select and tree bring their own density, typography and ripple layers, which would have to be overridden back to the current look, and Material adds about as much CSS as PrimeNG removes. CDK Listbox plus Overlay covers select, and CDK Tree plus DragDrop covers the tree, so both stay custom. If a slice proves this wrong, it stops and the reason is recorded in the plan's change log.

## Slices, lowest risk first

### Slice 1 — leaf controls (P1.5.8) — done

| PrimeNG | Replacement | Notes |
|---|---|---|
| `pButton` (58), `p-button` (4), one `label.p-button` | Native `<button uiButton>` (`src/app/ui/button.directive.ts`): `tone`, `variant`, `size`, `iconOnly`; icon and label are projected content | Styles in `src/design-system/controls.css`, measured against PrimeNG in every state and theme |
| `pInputText` (29) | Native `<input class="ui-input">` | The `font-mono` class on 13 of them never applied under PrimeNG and was removed |
| `p-checkbox` (2) | Native `<input type="checkbox" class="ui-checkbox">` | `inputId` became `id`; the existing `<label>` wraps it |
| `p-skeleton` (7) | `<span class="ui-skeleton h-[..] w-[..]" aria-hidden="true">` | The `borderRadius` input was already overridden to one radius |
| `chip`, `panel`, `toolbar`, `floatlabel`, `progressspinner`, `textarea` | Nothing | Imported, used in no template |

Tests added: `button.directive.spec.ts`; e2e for the checkbox (Space and label), the keyboard focus ring, and the popup buttons' contrast in both themes (F47).

Still to do for these controls in later slices: the `Inputs` and `Buttons` sections of `primeng-overrides.css` stay until slice 5, because PrimeNG's dialog close button and select still use those classes.

### Slice 2 — tooltip, popover (P1.5.9) — done

| PrimeNG | Replacement | Notes |
|---|---|---|
| `pTooltip` (11), `tooltipPosition` | `[uiTooltip]="text"`, `uiTooltipPosition` (`src/app/ui/tooltip.directive.ts`) on CDK Overlay | Shows on hover and focus, closes on leave, blur and Escape, stays while hovered, `role="tooltip"` + `aria-describedby` |
| `p-popover` (1) | `[uiTooltip]="template"`: the same directive renders a template as a details card | It was only opened on hover and focus, so it is the same pattern |

Security: `createHTML` and `allowHtml` are gone from the Trusted Types default policy.

Tests added: `tooltip.directive.spec.ts` (5), e2e keyboard tests for the tooltip and the history details card, a stricter C-016 (the empty string is rejected as HTML too).

### Slice 3 — tabs, accordion, select button (P1.5.10) — done

| PrimeNG | Replacement | Notes |
|---|---|---|
| `p-tabs`, `p-tablist`, `p-tab`, `p-tabpanels`, `p-tabpanel` (3 sets) | `ui-tabs`, `ui-tablist`, `ui-tab`, `ui-tabpanels`, `ui-tabpanel` (`src/app/ui/tabs.component.ts`) | Controlled by `[value]` / `(valueChange)`. Arrow keys, Home, End; automatic activation. Hidden panels stay mounted |
| `p-accordion` and its panel, header, content (2) | `ui-accordion`, `ui-accordion-panel`, `ui-accordion-header`, `ui-accordion-content` | Single open. Header is a `<button aria-expanded>`. Closed content is `inert`. Height animates in CSS |
| `p-selectButton` (1) | `ui-segmented` | Radio group; arrows move and select |

No CDK primitive was needed. Tests added: 10 unit, 4 keyboard-only e2e (`e2e/keyboard.spec.ts`).

Looks reproduced as they were, pending F48: the phone accordions' light panels in the dark theme and the grey pill in the Basic/JSON switch.

### Slice 4 — select, menu, context menu (P1.5.11) — done

| PrimeNG | Replacement | Notes |
|---|---|---|
| `p-select` (9) | `ui-select` (`src/app/ui/select.component.ts`) on CDK Overlay | Select-only combobox: focus stays on the trigger, `aria-activedescendant`, type-ahead, `ControlValueAccessor`. `inputId`, `optionLabel`, `optionValue`, `placeholder`, `showClear`, `ariaLabel` |
| `p-menu` (1), `p-contextMenu` (1) | `ui-menu` (`src/app/ui/menu.component.ts`) on CDK Menu + Overlay | `toggle(event)` under a trigger, `show(event)` at the pointer. Focus moves in and returns |
| `MenuItem` | `UiMenuItem` | `{ label, icon?, command }` or `{ separator: true }` |

CDK Listbox was not used: it needs focus inside the list, and this pattern keeps it on the combobox.

Tests added: 13 unit, 4 keyboard-only e2e (method select, a select inside a dialog, export menu, collection context menu).

For slice 7: the PrimeNG tree still opens the context menu through `[contextMenu]="$any(contextMenu)"`; the new tree calls `menu.show(event)` itself.

### Slice 5 — dialog, drawer, confirm dialog, confirm popup (P1.5.12)

| PrimeNG | Where | Replacement | CDK | Tests today | Tests to add |
|---|---|---|---|---|---|
| `p-dialog` (10): `header`, `[(visible)]`, `modal`, footer template, `closeOnEscape` | vault, Local Bridge, Save to Collection, new collection, import collection, command palette, new environment, import environments, Secrets, Settings | `ui-dialog`: `[(open)]`, `title`, content and footer slots; `role="dialog"`, `aria-modal`, labelled by its title | Dialog, FocusTrap, scroll blocking | `accessibility.spec.ts` C-038, `secrets.spec.ts` C-027, `settings.spec.ts`, `layout.spec.ts` (usable after close) | Per dialog: focus moves in, Tab stays in, Escape closes, focus returns; Escape works at once after open (PrimeNG 21 swallows it during the fade) |
| `p-drawer` (2): left navigation on phones, right history | app shell | `ui-drawer`: same contract as dialog, `side` input | Dialog, FocusTrap | `layout.spec.ts` (usable after close), `features.spec.ts` C-029 | keyboard and focus tests for both |
| `p-confirmDialog` (2) + `ConfirmationService.confirm` (5 calls) | delete collection/folder/request, clear history, reset all data, delete secret | `ConfirmService.confirm({ title, message, acceptLabel, danger }): Promise<boolean>` rendering one `ui-confirm-dialog` (`role="alertdialog"`) | Dialog | `accessibility.spec.ts` (accessible name), `reset-all-data.spec.ts` C-013, `secrets-manager.spec.ts` C-028 | Unit for the service (resolve true and false, one at a time). e2e: focus starts on Cancel for dangerous actions, Escape cancels |
| `p-confirmpopup` (keyed `history-delete`) | history entry delete | same `ConfirmService` with an `anchor` element, rendered as a popover | Overlay | `features.spec.ts` C-029, `past-requests.component.spec.ts` | keyboard and focus return |

Gap to close in this slice: PrimeNG's drawer does not move focus into itself; Tab keeps walking the page behind it. The replacement takes focus on open and traps it (remove the workaround in `e2e/features.spec.ts`, "a history entry shows its details").

Known difference to remove: on phones a dialog opened from the navigation drawer is clipped to the drawer's width today (screens `dark-mobile/17-dialog-new-collection`). The new dialog renders in the overlay container at full width. This is listed as an intended fix, not a redesign.

### Slice 6 — splitter (P1.5.13)

| PrimeNG | Where | Replacement | Tests today | Tests to add |
|---|---|---|---|---|
| `p-splitter`: `panelSizes [55,45]`, `minSizes [28,22]`, `gutterSize 8`, `stateStorage="local"`, `stateKey="wayfarer:composer-split"` | composer / response on desktop | `ui-splitter`: two panes, a `role="separator"` handle with `aria-valuenow/min/max`, pointer events with capture, arrows and Home/End, same key and same stored format (`[left, right]` percentages) | `layout.spec.ts` C-031 (drag persists across reload) | e2e keyboard resize; unit: stored value from PrimeNG is read unchanged, minimum sizes hold |

### Slice 7 — collections tree (P1.5.14)

| PrimeNG | Where | Replacement | CDK | Tests today | Tests to add |
|---|---|---|---|---|---|
| `p-tree` with `TreeNode`, drag and drop, node templates, selection, inline rename, context menu | collections sidebar | `ui-tree` over the existing `collection-tree-nodes.util.ts` output (own `UiTreeNode` type): `role="tree"`/`treeitem`, `aria-expanded`, `aria-level`, arrows, Home/End, type-ahead, F2 to rename | CdkTree, DragDrop | `features.spec.ts` C-024 (drag reorder, rename, load), `collections.spec.ts`, `collections-sidebar.component.spec.ts` (13 tests) | e2e keyboard: expand, collapse, rename with F2, open the menu, reorder with Alt+Arrow |

Highest risk in the phase: drag and drop must keep the same drop rules (reorder within a parent, move into a folder, never a folder into itself). The existing C-024 test is extended with those three cases against PrimeNG before the swap.

### Slice 8 — delete PrimeNG (P1.5.15)

- `providePrimeNG` and the Aura preset leave `app.config.ts`. The preset only fed PrimeNG's own variables; the app's colours already come from `tokens.css`.
- 26 `pi-*` tokens → `<app-icon>`. Glyphs to add to `icon-paths.ts`: `add`, `content_copy`, `edit`, `visibility`, `visibility_off`, `save`, `expand_more`, `expand_less`, `terminal`, `add_circle`. Already present: `check_circle`, `close`, `delete`, `download`, `upload`, `folder`, `key`, `lock`, `dark_mode`, `light_mode`, `warning`, `progress_activity`.
- `primeicons.css` leaves `angular.json`; `primeng-overrides.css` is deleted; packages, the `overrides` entry, the Dependabot ignores and the `primeng` keyword go.
- Tests: the two AC greps, plus `no-third-party-requests` C-001 (no icon font is requested).

## Differences that are intended

Listed here so the final screenshot comparison can tell them from bugs.

1. No ripple on buttons. PrimeNG's ripple is an ink effect on click; the app's own buttons (`ds-icon-btn`) never had it. Removing it makes the two families behave the same.
2. Dialogs opened from the phone navigation drawer are no longer clipped to the drawer.
3. Escape closes a dialog immediately after it opens.
4. Focus rings come from the global `:focus-visible` rule instead of PrimeNG's 1 px ring.
5. Dark "secondary text" buttons and light "danger text" buttons are readable (F47).
6. Icons in buttons are Material Symbols instead of PrimeIcons: same slot, different drawing.

## Screens not captured on phones

`composer-body-json-mode` and `history-delete-popup` are not reached by the capture script at 390 px, before or after. Both are covered at desktop width and by e2e tests.
