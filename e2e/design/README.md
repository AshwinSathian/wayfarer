# Design capture

`screens.spec.ts` takes every screen of `screens.ts` at 360, 390, 820 and
1,440 px, in the light and the dark theme, as a `toHaveScreenshot`
baseline; `tasks.spec.ts` does the benchmark's eight tasks
([`docs/benchmark.md`](../../docs/benchmark.md)) and records them. Both run
in the `design-*` projects only.

## Where the images are

Chromium's are committed, in `baseline/design-chromium/`, named
`<screen>-<width>-<theme>.png` (`response-json-1440-dark.png`). Firefox's
and WebKit's are not (the three sets are about 57 MB, Chromium's 19 MB):
the "Design capture" jobs of `e2e.yml` take them again on each run and
upload them as the `design-firefox` and `design-webkit` artifacts, kept
7 days.

The images are Linux's. A Mac draws text and edges differently, so a set
taken there differs from CI's in every image.

## How CI reads them

The "Design capture" jobs run after the build, one per engine, each inside
the Linux image the snapshots are taken in. In Chromium each screen is
compared with its committed image, with a tolerance of 200 pixels; the HTML
report in the `design-chromium` artifact shows each difference as the image
before, after and a diff. In Firefox and WebKit the images are written
fresh. The jobs never fail the build: a difference is for the pull
request's reviewer to read.

What changes from run to run is held still before each capture: the page's
clock is fixed at 2026-10-22 09:30 UTC, a measured duration is written as
"12 ms", and the commit, the version, a storage size and an editor's caret
are masked.

## How to update them

When a pull request changes how a screen looks on purpose, take the
Chromium set again in Playwright's Linux image and commit it with the
change. Build first: the container serves `dist/deploy` and does not build.

```bash
npm run build
docker run --rm -v "$PWD":/w -w /w -e CI=1 --ipc=host mcr.microsoft.com/playwright:v1.64.1-noble \
  npx playwright test e2e/design/screens.spec.ts --project=design-chromium --update-snapshots=all
git add e2e/design/baseline/design-chromium
```

The image's tag is the version of `@playwright/test` in `package.json`.
`=all` rewrites every capture: without it Playwright rewrites only those
that differ by more than the 200 pixels it tolerates, and a small change
(an icon) leaves the committed set showing the screen as it was.
Add `--grep "<screen>"` to take one screen again. A new screen is an entry
in `screens.ts` and a way to reach it in `OPEN` (`open.ts`).
