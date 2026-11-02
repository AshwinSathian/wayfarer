# Type evaluation, 2026-11-02 (D3.6, U-150, U-151)

The hig-review's `scripts/type-eval.js`, run in the app's production build
(`dist/deploy`, served locally) at 1,440 px and a device scale of 1, in
Playwright's three engines, on the three faces the app ships. A number is
the device pixels by which the two glyphs of a pair differ: 0 means they
render identically. The full output is
[`type-eval/type-eval-2026-11-02.json`](type-eval/type-eval-2026-11-02.json).

| Engine | Face | px | I/l | l/1 | I/1 | 0/O | 8/B |
|---|---|---|---|---|---|---|---|
| chromium 156.0.8078.4 | Atkinson Hyperlegible Next | 12 | 16 | 24 | 10 | 16 | 11 |
| chromium 156.0.8078.4 | Atkinson Hyperlegible Next | 13 | 18 | 32 | 18 | 16 | 15 |
| chromium 156.0.8078.4 | JetBrains Mono | 12 | 12 | 19 | 13 | 1 | 13 |
| chromium 156.0.8078.4 | JetBrains Mono | 13 | 12 | 21 | 13 | 4 | 7 |
| chromium 156.0.8078.4 | Inter Variable | 12 | 0 | 19 | 19 | 25 | 12 |
| chromium 156.0.8078.4 | Inter Variable | 13 | 0 | 36 | 36 | 30 | 15 |
| firefox 157.0 | Atkinson Hyperlegible Next | 12 | 16 | 24 | 10 | 16 | 11 |
| firefox 157.0 | Atkinson Hyperlegible Next | 13 | 18 | 32 | 18 | 16 | 15 |
| firefox 157.0 | JetBrains Mono | 12 | 12 | 19 | 13 | 1 | 13 |
| firefox 157.0 | JetBrains Mono | 13 | 12 | 21 | 13 | 4 | 7 |
| firefox 157.0 | Inter Variable | 12 | 0 | 19 | 19 | 25 | 12 |
| firefox 157.0 | Inter Variable | 13 | 0 | 36 | 36 | 30 | 16 |
| webkit 27.2 | Atkinson Hyperlegible Next | 12 | 18 | 24 | 12 | 16 | 11 |
| webkit 27.2 | Atkinson Hyperlegible Next | 13 | 18 | 25 | 13 | 19 | 16 |
| webkit 27.2 | JetBrains Mono | 12 | 13 | 20 | 13 | 3 | 13 |
| webkit 27.2 | JetBrains Mono | 13 | 13 | 23 | 16 | 6 | 12 |
| webkit 27.2 | Inter Variable | 12 | 0 | 20 | 20 | 26 | 10 |
| webkit 27.2 | Inter Variable | 13 | 2 | 35 | 35 | 30 | 13 |

## What it decides

- **Atkinson Hyperlegible Next takes the text role** (DQ11). No pair is
  identical at 12 or 13 px in any engine; the closest is 5/S at 7 device
  pixels. Inter's I and l are identical (0 px) at 12 px in all three
  engines and at 13 px in Chromium and Firefox, as the review found
  (U-150): Inter stays only as the fallback for the Greek, Cyrillic and
  Vietnamese glyphs Atkinson does not have.
- **JetBrains Mono stays the wire's face, at 13 px or more** (U-151). Its
  0 and O are 1 device pixel apart at 12 px in Chromium and Firefox and 3
  in WebKit; at 13 px, 4 and 6. No mono role is under 13 px:
  `type-mono-body` is 13, the method field moved from 12 to 13, and the
  token test fails on an element that is monospace and a 12 px type
  class.
- **Mixed scripts.** A name that mixes Latin with Cyrillic or Greek draws
  those letters in Inter. At 12 and 13 px the change shows as a slightly
  lower x-height (Inter's 0.709 of the cap height against Atkinson's
  0.743), with no jump in weight or width:
  [Chromium](type-eval/mix-chromium.png),
  [Firefox](type-eval/mix-firefox.png),
  [WebKit](type-eval/mix-webkit.png). Accepted.
