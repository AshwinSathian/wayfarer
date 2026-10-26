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
| `--dur-micro` | 60 ms | A row's background under the pointer: a menu's, a tree's, a select's |
| `--dur-quick` | 120 ms | A hover or a colour change, an overlay that appears; Tailwind's `transition-*` utilities |
| `--dur-standard` | 240 ms | An accordion's chevron turning |
| `--dur-enter` | 300 ms | A dialog and its backdrop, the drawer's slide |
| `--dur-pulse` | 2,000 ms | A missing variable's chip, once each way |
| `--dur-shimmer` | 1,200 ms | A loading skeleton's sweep, a spinner's turn |
| `--dur-none` | 0.001 ms | Everything, with reduced motion |
| `--ease-standard` | `cubic-bezier(0.25, 0, 0, 1)` | Most things: quick off the mark, a soft landing |
| `--ease-enter` | `cubic-bezier(0, 0, 0, 1)` | What enters: dialogs, the drawer and the shell |
| `--ease-in-out` | `cubic-bezier(0.42, 0, 0.58, 1)` | Loops: the pulse and the shimmer |
| `--ease-linear` | `cubic-bezier(0, 0, 1, 1)` | A turn at one speed: the spinner |

## What moves, and how

- **What appears in the page appears at once.** A response, its status
  line, a tab's pane, an accordion's section and the pinned sidebar are
  drawn in the frame they are ready, with no entrance: no fade, no slide,
  no growth. The answer to ⌘↵ is the product's speed made visible (plan,
  "Direction (D2.1)"), and a fade hid it (D3.7, below). Nothing slides or
  grows into place either: a panel that slid 10 px was somewhere else
  between a press and its release, so the press landed beside it (F48 of
  the remediation plan).
- **A send shows nothing for its first second.** A reply sooner than that
  has no indicator: no skeleton, no spinner, no fade. After a second the
  response pane says "Sending…" and the time so far, in tenths of a
  second, until the answer arrives. A screen reader hears "Sending…" at
  once, from the pane's live region, which draws nothing.
- **Nothing that is pressed often moves.** A button does not shrink while
  pressed, and a chip does not lift on hover: Send is pressed all day.
- **Overlays move a little.** A dialog rises 8 px and grows from 96%, and
  its backdrop fades in; a small popover grows from 97%. They are placed
  before they are shown, and nothing is aimed at them earlier. Focus is in
  a dialog from its first frame: the motion holds nothing back.
- **What closes goes at once.** A dialog, a confirmation, a menu and the
  drawer leave in one frame, and the page under them is free that frame.
  The drawer slides in on the tokens' (`--dur-enter`, `--ease-enter`); it
  no longer slides out (D3.3g), as a dialog does not shrink away.
- **Tooltips, the menus and a select's list** appear as a small popover
  does, and go at once.
- **A theme change is instant.** Every element of the page once had a
  0.2 s colour transition for it: a switch animated thousands of elements
  at once, and a contrast scan could read a colour half-way. The controls'
  own colour fades (on hover and focus) are held off while the theme
  changes: `Theme` sets `data-theme-changing` on the root for that frame,
  and `animations.css` gives every element `transition: none` under it.
- **A transition names what it moves.** No `transition: all`, no Tailwind
  `transition` or `transition-all`: those move whatever changes, a theme's
  colours among them. The token test fails on either.
- **Nothing loops but what loads.** History's loading skeleton sweeps until
  its entries are there, and a spinner turns until its work is done. A missing variable's chip pulses twice and then holds
  still: a loop that runs past five seconds needs a way to stop it (WCAG
  2.2.2).
- **A script's motion asks too.** CSS cannot reach a scroll a script
  starts with `behavior: "smooth"`, so the code that starts one asks
  `prefers-reduced-motion` itself (the composer's address field when it is
  focused from elsewhere).

## Reduced motion

When the system asks for reduced motion (`prefers-reduced-motion: reduce`),
`animations.css` makes every animation and transition, of the app and of
Material, a dialog's `::backdrop` among them:

- last `--dur-none`, 0.001 ms: nothing to see, but a length, so the
  `animationend` and `transitionend` events Material waits for are still
  sent (at 0 some are not);
- start at once: no delay;
- run once: nothing loops, the skeleton included, and a spinner stands
  still as its ring;
- scroll without smoothing.

`e2e/motion.spec.ts` holds the app to it in Chromium, Firefox and WebKit:
with reduced motion, every animation the browser is running and every
element's transitions, as a response arrives, with a missing variable, with
a menu and with Settings open, last no more than 0.001 ms, wait for nothing
and do not repeat. Without it, the missing variable's pulse runs twice.

## What D3.7 changed, and why

D3.7 of the plan (row 1.44), from the hig-review of 2026-10-23: the most
frequent action carried the most motion. A local send answers in 16 to
38 ms; the button then shrank to 96%, shimmer bars flashed, the response
faded in over 300 ms and each tab's pane over 240 ms, so the answer sat at
part opacity for eight times the network's time (U-078).

| Rule before | Rule now | Why |
|---|---|---|
| What appears in the page fades (F48) | What appears in the page appears at once | The fade hid the speed it followed (U-078). F48's point, that nothing moves under the pointer, still holds: nothing slides or grows. |
| A response fades in over `--dur-enter`, and its status line with it | The response and its status line are drawn in the frame they are ready | The same (U-078). |
| A tab's pane and an accordion's section fade in over `--dur-standard` | Both are shown at once | A pane that faded in on every arrow key made switching tabs slower than reading them (U-078). |
| A request on its way is a loading skeleton | Nothing for a second, then "Sending…" and the time so far | Grey bars said nothing, looked the same at one second and at fifty, and flashed for a 16 ms reply (U-055, U-078). |
| A press dips: a button scales to 0.96, an icon button to 0.91 | Nothing that is pressed often moves | Send is the button the app is used for, all day (U-078). `--ease-spring` went with it. |
| A chip lifts 1 px on a spring when hovered | It changes colour only | A lift is a call to press, on something read more than pressed (U-121). |
| The pinned sidebar slides the page with `margin-left` over 300 ms | The page moves in one frame | The slide laid out the editors on every frame and was motion nobody asked for (U-079). |
| A theme change is instant (no colour transition on the page) | The same, and the controls' own fades are held off for that frame | About 90 controls still faded their colours on a switch (U-122). |
| Durations and easings are tokens | The same, and a transition names its properties | One `transition-all` moved what it did not mean to (U-123). |

`e2e/motion.spec.ts` holds the new rules without reduced motion: a reply
under 100 ms shows no skeleton and never draws the response or its status
line below full opacity; a 2 s reply shows nothing for its first second
and then "Sending…" and the time so far; Send's `transform` is `none`
while pressed; and a theme change starts no transition.

