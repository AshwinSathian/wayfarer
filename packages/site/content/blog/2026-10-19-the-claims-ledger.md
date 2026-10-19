---
title: Every claim with its test
date: 2026-10-19
description: How Wayfarer's claims ledger works, why a claim test is never retried, and what the CI column on the claims page means.
---

Most product pages ask you to take them at their word. Wayfarer's
[claims ledger](../../../../docs/claims.md) is a table instead: each row is one thing the
app says it does, with a stable ID, the documents that say it, and the
automated tests that prove it. On 19 October 2026 it has 68 rows.

## How a sentence gets an ID

When a document or this site says what Wayfarer does, the sentence names
its claim: "No account, no cloud, no telemetry" is C-001, and the vault's
encryption is C-004. The front page shows the IDs beside its sentences, and
a test checks that each one is a row of the ledger, so a claim that leaves
the ledger cannot stay on the page.

## What CI checks

`npm run check:claims` fails when a claim has no test, or when a test it
names does not exist. The tests themselves run on every change, in
Chromium, Firefox and WebKit where they are about the page. A claim test is
never retried: one that passes on a second try has not shown what it
claims.

## The column on the claims page

When the site is deployed, the deploy writes down the CI run whose files
it is publishing, and it publishes only a run in which every job passed.
The claims page reads that and adds a "Last CI" column linking to the run.
Since claim tests are not retried, each row's "Passed" means its tests
passed in that run, the first time.
