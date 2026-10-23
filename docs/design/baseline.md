# Design baseline: the eight tasks

D0.2 of [`PLAN-design.md`](../../PLAN-design.md). The eight tasks of
D1.4, done on today's app by a script that counts every input, so that
each rebuilt view can be measured against the app as it was. The rivals'
half of D1.4 (Postman, Bruno, Yaak, Hoppscotch and Insomnia, the same
tasks by hand on the maintainer's machine) is the maintainer's step and is
not here; until it runs, a view's benchmark compares Wayfarer before and
after.

The screens themselves, as they look today, are the other half of the
baseline: [`baseline/index.md`](baseline/index.md).

## Results

Three runs of each task; the time is the median of the three. The count of
inputs was the same in every run, as the script requires.

| # | Task | Inputs | Clicks | Keys | Characters typed | Seconds (median) | Runs |
|---|---|---|---|---|---|---|---|
| 1 | First request from nothing | 36 | 2 | 0 | 34 | 0.14 | 0.19, 0.14, 0.14 |
| 2 | Import a Postman collection with scripts and run it | 10 | 10 | 0 | 0 | 1.38 | 1.56, 1.38, 1.24 |
| 3 | Add an environment and switch to it | 45 | 9 | 1 | 35 | 1.35 | 1.37, 1.35, 1.33 |
| 4 | Use a secret without it touching disk | 135 | 15 | 1 | 119 | 2.16 | 2.14, 2.19, 2.16 |
| 5a | Find why a request failed: CORS | 33 | 2 | 0 | 31 | 0.13 | 0.12, 0.13, 0.13 |
| 5b | Find why a request failed: DNS | 30 | 2 | 0 | 28 | 0.13 | 0.12, 0.13, 0.13 |
| 5c | Find why a request failed: 401 | 34 | 2 | 0 | 32 | 0.13 | 0.14, 0.13, 0.11 |
| 6 | Send the same request to a teammate | 2 | 2 | 0 | 0 | 0.33 | 0.35, 0.33, 0.33 |
| 7 | Run a collection with a data file and read the report | 5 | 5 | 0 | 0 | 0.52 | 0.53, 0.52, 0.51 |
| 8 | Find a request sent last week | 9 | 3 | 0 | 6 | 0.51 | 0.53, 0.51, 0.51 |

### After the rebuild

Each task measured again after the session that rebuilt its view, the same
way (three runs, the median), beside its row above.

| # | Task | Session | Inputs | Clicks | Keys | Characters typed | Seconds (median) | Runs |
|---|---|---|---|---|---|---|---|---|
| 1 | First request from nothing | D4-c (#427) | 35 | 0 | 1 | 34 | 0.06 | 0.07, 0.04, 0.06 |
| 1 | First request from nothing | D4-d (#428 to #432) | 35 | 0 | 1 | 34 | 0.07 | 0.07, 0.07, 0.06 |
| 6 | Send the same request to a teammate | D4-d (#431) | 2 | 2 | 0 | 0 | 0.34 | 0.34, 0.36, 0.34 |

D4-d rebuilt the composer and left task 1 as D4-c made it: the caret
still starts in the address, and the address and Enter are the task.
Task 6 takes the same two clicks, and now ends on something the screen
says: "Copied as cURL." under the address (U-050); before, it ended
when the menu closed, with nothing to read. Its seconds are the time to
that note. Sharing itself waits for phase T.

Task 1 is one input shorter: the caret starts in the address and Enter
sends, so the address and one key are the whole task; before, a click
went into the field and another on Send. What is left is the address
itself. D4.2 asks for the fewest inputs D1.4 measured among the rivals;
their half of D1.4 has not been run, so the aim was fewer than today's
36.

The seconds are the app's own time: how long the screen took to show each
result to a script that never pauses. A person reads, looks for the next
control and types; their time is longer and is what D1.4's recordings of
the rivals will measure. Compare these seconds only with the same script
on another build.

## What each task does

The script takes the shortest road the app offers today, the one a person
who knows the app would take. Where that road is longer than it should be,
the audit has a finding.

1. **First request from nothing.** Type an address into the empty app and
   click Send. Enter in the address does not send, and Send has no
   shortcut (U-032). Since D4-c the caret starts in the address and Enter
   sends: the address and Enter.
2. **Import a Postman collection with scripts and run it.** The file is a
   Postman v2.1 collection of two requests, each with a test script. Pick
   it (2 clicks: Import, and the file in the system's dialog), Confirm
   import, then review its scripts: open a request, its Scripts tab,
   Review scripts and I trust these scripts. Then the collection's menu,
   Run…, and Run. The run does not offer the review itself: run first and
   it sends without the scripts (U-039). Four of the ten clicks are that
   detour.
3. **Add an environment and switch to it.** Environments, New environment,
   a name, Create environment (Enter does not create it, U-044), Add
   variable, a name and a value, Save changes, Escape, and the toolbar's
   environment select.
4. **Use a secret without it touching disk.** As task 3, with a variable
   marked secret: the first one asks for the vault's passphrase, typed
   twice (56 of the 119 characters). Then the variable is used in an
   address and sent.
5. **Find why a request failed.** Three failures: a server that sends no
   CORS header (5a), a name that does not resolve (5b), and a 401 (5c).
   Each is an address and Send; the task ends when the response pane
   shows what it has to say. For 5a and 5b it is the same text: "0
   Unknown Error … The host may not resolve (DNS), may have refused the
   connection, or may not allow cross-origin requests from this site
   (CORS). The browser does not reveal which." For 5c it is "401
   Unauthorized" and nothing about the request's auth. The counts are
   low because the app tells the user little (U-051): finding the cause
   is left to them.
6. **Send the same request to a teammate.** Wayfarer has no sharing yet
   (phase T), so the shortest road is Copy as cURL from the address row's
   menu (2 clicks) and another tool to send the text. Until D4-d nothing
   on the screen said the command was copied (U-050); since D4-d the task
   ends when "Copied as cURL." is shown.
7. **Run a collection with a data file and read the report.** The
   collection of task 2, already imported and trusted before the count
   starts. Its menu, Run…, Data file… and the file (a CSV of two rows),
   and Run; the report then reads "4 passed".
8. **Find a request sent last week.** Three requests sent with the page's
   clock set a week back, and one today, before the count starts. History,
   a search of six characters, and a click on the entry, which opens the
   request in the composer.

## Method

The script is [`e2e/design/tasks.spec.ts`](../../e2e/design/tasks.spec.ts),
in the `design-chromium` project (CI's Design capture job runs it too). It
counts as a person would:

- a click is one input; a right-click is one;
- a key press is one (Escape, Enter);
- each character typed is one, and a click to focus a field before typing
  is a click;
- a file chosen in the system's dialog is two: the click that opens it and
  the click on the file.

Each run starts in a new browser context, with nothing stored and nothing
cached, at 1,440 × 900. What a task needs before it starts (the collection
of task 7, the history of task 8) is set up first and is not counted. The
clock starts at the first input and stops when the result is on the
screen. Each task runs three times; the test fails if the count differs
between runs.

## The build measured

- The app of `main` at `204379e` (version 2.6.0), a production build
  (`npm run build`), served by `e2e/support/prod-server.mjs` with
  production's headers, and the echo server of `e2e/support` as every
  target.
- Chromium 156.0.8078.4, headless, in Playwright 1.64.1's Linux image
  (`mcr.microsoft.com/playwright:v1.64.1-noble`), one worker, under Docker
  on an Apple M4 Pro, 2026-10-22.

To run it again on another build:

```bash
npm run build
docker run --rm -v "$PWD":/w -w /w -e CI=1 --ipc=host mcr.microsoft.com/playwright:v1.64.1-noble \
  npx playwright test e2e/design/tasks.spec.ts --project=design-chromium --workers=1
```

Each task's counts and times are written to
`test-results/design-tasks/design-chromium-<task>.json`.
