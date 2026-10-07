# Flake register

Plan risk R6: a test that failed without a product cause is listed here with its issue. `@claim` tests run with retries 0, so a flake in one of them fails CI and must be fixed, not retried.

| Test | Seen | Cause | Issue | State |
|---|---|---|---|---|
| `tripwire.spec.ts` › F06 `@claim:C-010` | 2026-10-07, CI, `claims-chromium`, once | The test waited for one `statechange` of a service worker that unregisters itself; the event never came | #118 | Fixed in two steps: the wait for the event gives up after 5 s; the final check polls until the old registration is gone (seen again 2026-10-07 on PR #121, where it was still listed at the single sample) |
| `layout.spec.ts` › `@claim:C-031` | 2026-10-06, local, Chromium, 2 runs in 10 | The gutter was measured while the panes were still resizing | none (fixed in #107) | Fixed: `still()` wait |
| `tripwire.spec.ts` › F01 `@claim:C-006`, `trusted-types.spec.ts` › `@claim:C-016` | 2026-10-07, local, 3 runs in 24 | A composer tab was clicked at its 1 px visible edge while the panes were still resizing | none (fixed in #115) | Fixed: `still()` wait |
| `features.spec.ts` › `@claim:C-023` | 2026-10-07, local, Firefox, once in a full run (0 in 20 repeats) | The Timings tab was clicked while the panes were still resizing after the response | #119 | Fixed: `still()` wait |
| `collections.spec.ts` › "saves the composer's current request into a collection" | 2026-10-07, local, Firefox, once (0 in 24 repeats); passed on retry | Save in the PrimeNG dialog did not take the click within 30 s | #119 | Open: recheck after the dialog is replaced (slice 5) |
