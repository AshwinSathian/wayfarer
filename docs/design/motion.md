# Motion

What moves in Wayfarer, for how long, and what happens when you ask your
system for less motion. This is D3.4 of [the design plan](../../PLAN-design.md).
The durations and easings are the `motion` tokens in
`packages/tokens/base.tokens.json`, and no stylesheet or template writes
one of its own: a test in `packages/tokens/tokens.test.mjs` fails on a
literal `0.2s`, an `ease-in-out` or a Tailwind `duration-150`.

## The tokens

| Token | Value | For |
|---|---|---|
| `--dur-micro` | 60 ms | A press: a chip or a button that dips, a row's background |
| `--dur-quick` | 120 ms | A hover or a colour change, an overlay that appears; Tailwind's `transition-*` utilities |
| `--dur-standard` | 240 ms | A tab's pane fading in, an accordion's chevron turning |
| `--dur-enter` | 300 ms | A dialog, the drawer's slide, the shell and a response arriving |
| `--dur-pulse` | 2,000 ms | A missing variable's chip, once each way |
| `--dur-shimmer` | 1,200 ms | A loading skeleton's sweep |
| `--dur-none` | 0.001 ms | Everything, with reduced motion |
| `--ease-standard` | `cubic-bezier(0.25, 0, 0, 1)` | Most things: quick off the mark, a soft landing |
| `--ease-enter` | `cubic-bezier(0, 0, 0, 1)` | What enters: dialogs, the drawer and the shell |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | A press that springs back |
| `--ease-in-out` | `cubic-bezier(0.42, 0, 0.58, 1)` | Loops: the pulse and the shimmer |

## What moves, and how

- **What appears in the page fades; it does not slide or grow.** A panel,
  a tab's pane, a response: opacity only. A panel that slid 10 px into place
  was somewhere else between a press and its release, so the press landed
  beside it (F48 of the remediation plan).
- **Overlays move a little.** A dialog rises 8 px and grows from 96%; a
  small popover from 97%. They are placed before they are shown, and
  nothing is aimed at them earlier.
- **Material's own motion** (its menus, select lists and tooltips) keeps
  Material's timing. The drawer slides on the tokens' (`--dur-enter`,
  `--ease-enter`), and Material's dialog animation is off (`ui/dialog.ts`),
  since it held focus back until it ended.
- **A theme change is instant.** Every element of the page once had a
  0.2 s colour transition for it: a switch animated thousands of elements
  at once, and a contrast scan could read a colour half-way.
- **Nothing loops but what loads.** The loading skeleton sweeps until the
  content is there. A missing variable's chip pulses twice and then holds
  still: a loop that runs past five seconds needs a way to stop it (WCAG
  2.2.2).
- **A script's motion asks too.** CSS cannot reach a scroll a script
  starts with `behavior: "smooth"`, so the code that starts one asks
  `prefers-reduced-motion` itself (the composer's address field when it is
  focused from elsewhere).

## Reduced motion

When the system asks for reduced motion (`prefers-reduced-motion: reduce`),
`animations.css` makes every animation and transition, of the app and of
Material:

- last `--dur-none`, 0.001 ms: nothing to see, but a length, so the
  `animationend` and `transitionend` events Material waits for are still
  sent (at 0 some are not);
- start at once: no delay;
- run once: nothing loops, the skeleton included;
- scroll without smoothing.

`e2e/motion.spec.ts` holds the app to it in Chromium, Firefox and WebKit:
with reduced motion, every animation the browser is running and every
element's transitions, as a response arrives, with a missing variable, with
a menu and with Settings open, last no more than 0.001 ms, wait for nothing
and do not repeat. Without it, the missing variable's pulse runs twice.
