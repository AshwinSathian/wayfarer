#!/usr/bin/env node
// Writes packages/core/test/fixtures/postman-legacy.golden.json (P3.4): the
// test names and results Newman, Postman's own runner, gives for the legacy
// fixture collection against the local echo server. Wayfarer must give the
// same (packages/core/test/pm-compat/legacy-golden.test.ts).
//
// Newman is not a dependency: its tree fails `npm audit` (18 advisories on
// 2026-10-10). It is fetched by npx for this run only, at a pinned version,
// into a folder of its own. Run it when the fixture changes: npm run golden
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startEchoServer } from "../e2e/support/echo-server.mjs";

const NEWMAN = "6.2.3";
const FIXTURE = resolve("packages/core/test/fixtures/postman-legacy.postman_collection.json");
const GOLDEN = resolve("packages/core/test/fixtures/postman-legacy.golden.json");

const server = await startEchoServer(0);
const work = mkdtempSync(join(tmpdir(), "wayfarer-golden-"));
const report = join(work, "report.json");
try {
  const args = ["--yes", `newman@${NEWMAN}`, "run", FIXTURE, "--env-var", `base=http://127.0.0.1:${server.address().port}`, "--reporters", "json", "--reporter-json-export", report];
  try {
    // From its own folder, so that npx takes nothing from this repository's
    // node_modules. Not the synchronous call: the echo server is in this
    // process and must go on answering.
    await new Promise((done, failed) => execFile("npx", args, { cwd: work, timeout: 300_000 }, (error) => (error ? failed(error) : done())));
  } catch (error) {
    // Newman exits with 1 when a test fails, and the fixture has tests that fail on purpose.
    if (error.code !== 1) throw error;
  }
  const { run } = JSON.parse(readFileSync(report, "utf8"));
  const items = run.executions.map((execution) => ({
    name: execution.item.name,
    tests: (execution.assertions ?? []).map((assertion) => ({ name: assertion.assertion, passed: !assertion.error })),
  }));
  if (run.failures.some((failure) => failure.error.name !== "AssertionError")) throw new Error(`golden: a script of the fixture failed in Newman: ${JSON.stringify(run.failures.map((failure) => failure.error.message))}`);
  writeFileSync(GOLDEN, `${JSON.stringify({ runner: `newman@${NEWMAN}`, items }, null, 2)}\n`);
  console.log(`golden: ${items.length} requests, ${items.reduce((sum, item) => sum + item.tests.length, 0)} tests, written to ${GOLDEN}`);
} finally {
  rmSync(work, { recursive: true, force: true });
  server.close();
}
