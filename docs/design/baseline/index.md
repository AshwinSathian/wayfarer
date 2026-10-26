# Design baseline: the screens

D0.1 of [`PLAN-design.md`](../../../PLAN-design.md). The app as it is, to
measure the rebuild against: every screen below at 360, 390, 820 and
1,440 px, in the light and the dark theme, in Chromium, Firefox and WebKit.
That is 196 images an engine, taken by
[`e2e/design/screens.spec.ts`](../../../e2e/design/screens.spec.ts). The
screens and what each shows are listed in
[`e2e/design/screens.ts`](../../../e2e/design/screens.ts), and
`scripts/design-index.test.mjs` fails when this page and that list differ.

The images at the top of this folder are older: the first pass of the
audit took them by hand on 2026-10-19, and [`audit.md`](../audit.md) cites
them by name.

## Where the images are

Chromium's are committed, in `design-chromium/`, named
`<screen>-<width>-<theme>.png` (`response-json-1440-dark.png`). Firefox's
and WebKit's are not (the maintainer's choice of 2026-10-22: the three sets
are about 57 MB, Chromium's 19 MB). CI takes them again on each run (below)
and uploads them as the `design-firefox` and `design-webkit` artifacts of the
"Design capture" jobs, kept 7 days.

The images are Linux's. A Mac draws text and edges differently, so a set
taken there differs from CI's in every image.

## How CI reads them

The "Design capture" jobs (`.github/workflows/ci.yml`) run after the
build, one per engine, each inside the same Linux image the snapshots are
taken in: Chromium and Firefox on every pull request and on
`main`, WebKit on `main` only. WebKit's capture took 11 minutes in the
Linux image, against under 3 for each of the others. In Chromium each
screen is compared with its committed image by `toHaveScreenshot`, with a
tolerance of 200 pixels; the HTML report in the `design-chromium` artifact
shows each difference as the image before, after and a diff. In Firefox
and WebKit the images are written fresh. The jobs never fail the build: a
difference is for the pull request's reviewer to read (section 10 of the
plan).

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
  npx playwright test e2e/design/screens.spec.ts --project=design-chromium --update-snapshots
git add docs/design/baseline/design-chromium
```

The image's tag is the version of `@playwright/test` in `package.json`.
Add `--grep "<screen>"` to take one screen again. A new screen is an entry
in `e2e/design/screens.ts`, a way to reach it in `OPEN` in the spec, and a
row below.

## The screens

| Screen | What it shows |
|---|---|
| `first-run` | The app as a new visitor finds it: no collection, no environment, no response. |
| `request-saved` | A saved POST request open in the composer, its JSON body showing. |
| `response-json` | A GET sent, its JSON response in the viewer. |
| `response-headers` | The response's Headers tab. |
| `response-tests` | The response's Tests tab: an assertion and a script's test. |
| `response-html` | An HTML response in its sandboxed preview. |
| `response-loading` | A request on its way, past its first second: Sending… and the time so far. |
| `response-error` | A request that failed before any response (a refused port). |
| `composer-params` | The composer's Params tab. |
| `composer-headers` | The composer's Headers tab with a row. |
| `composer-body` | The composer's Body tab, raw JSON. |
| `composer-auth` | The composer's Auth tab, no auth. |
| `composer-oauth` | The Auth tab's OAuth 2.0 flow, authorization code grant. |
| `composer-scripts` | The composer's Scripts tab with a post-response script. |
| `composer-settings` | The request's Settings tab: route, redirects, certificate check. |
| `method-menu` | The method list, open. |
| `graphql-explorer` | A GraphQL body with its schema fetched and the explorer shown. |
| `websocket` | A WebSocket connected, one message sent and echoed. |
| `export-menu` | The response's export menu, open. |
| `export-har` | The HAR export dialog with its preview. |
| `save-request` | The dialog that saves a new request into a collection. |
| `tree` | The collections tree with a collection, a folder and four requests: pinned from 1,200 px, a drawer below. |
| `tree-menu` | A collection's context menu in the tree. |
| `collection-settings` | A collection's settings dialog. |
| `new-collection` | The dialog that names a new collection. |
| `palette` | The command palette, open. |
| `import-review` | The import report of a collection file, with a warning. |
| `import-curl` | The box for a pasted cURL command. |
| `script-review` | The review of an imported collection's scripts. |
| `run` | A collection run, finished, with its report. |
| `environments-empty` | The environments dialog with no environment. |
| `environments-rows` | The environments dialog, an environment of four variables open. |
| `history` | History after three sends. |
| `history-empty` | History before any send. |
| `vault-create` | The dialog that makes the vault's passphrase. |
| `vault-unlock` | The dialog that unlocks the vault after a reload. |
| `secrets-manager` | The secrets manager, the vault not made yet. |
| `confirm-dialog` | A confirmation: deleting a request from the tree. |
| `settings-general` | Settings, General. |
| `settings-requests` | Settings, Requests. |
| `settings-history` | Settings, History. |
| `settings-data` | Settings, Data and storage. |
| `settings-vault` | Settings, Vault. |
| `settings-bridge` | Settings, Local Bridge. |
| `settings-cookies` | Settings, Cookies (the Local Bridge's jar). |
| `settings-shortcuts` | Settings, Shortcuts. |
| `settings-diagnostics` | Settings, Diagnostics. |
| `settings-about` | Settings, About. |
| `settings-danger` | Settings, Danger zone. |
