#!/usr/bin/env node
// Writes the golden files of packages/core/test/fixtures: the test names and
// results Newman, Postman's own runner, gives for a fixture collection
// against the local echo server. Wayfarer must give the same.
//
// - postman-legacy (P3.4): a collection in Postman's older sandbox
//   (packages/core/test/pm-compat/legacy-golden.test.ts).
// - postman-export/shop (P4.6 b): a collection of the app, exported as a
//   Postman v2.1 file by the app's exporter. The file is committed, and a
//   test holds it equal to what the exporter writes
//   (packages/core/test/export/postman.test.ts).
//
// Newman is not a dependency: its tree fails `npm audit` (18 advisories on
// 2026-10-10). It is fetched by npx for this run only, at a pinned version,
// into a folder of its own. Run it when a fixture changes: npm run golden
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startEchoServer } from "../e2e/support/echo-server.mjs";

const NEWMAN = "6.2.3";
const FIXTURES = resolve("packages/core/test/fixtures");
const JOBS = [
  { collection: "postman-legacy.postman_collection.json", golden: "postman-legacy.golden.json" },
  { collection: "postman-export/shop.postman_collection.json", golden: "postman-export/shop.golden.json" },
];

const server = await startEchoServer(0);
const work = mkdtempSync(join(tmpdir(), "wayfarer-golden-"));
const report = join(work, "report.json");
// The file the exported collection's bodies name: `FILES["pixel.png"]` of packages/core/test/export/fixtures.ts.
writeFileSync(join(work, "pixel.png"), Uint8Array.from({ length: 64 }, (_, index) => index));
try {
  for (const job of JOBS) {
    const args = ["--yes", `newman@${NEWMAN}`, "run", join(FIXTURES, job.collection), "--env-var", `base=http://127.0.0.1:${server.address().port}`, "--working-dir", work, "--reporters", "json", "--reporter-json-export", report];
    try {
      // From its own folder, so that npx takes nothing from this repository's
      // node_modules. Not the synchronous call: the echo server is in this
      // process and must go on answering.
      await new Promise((done, failed) => execFile("npx", args, { cwd: work, timeout: 300_000 }, (error) => (error ? failed(error) : done())));
    } catch (error) {
      // Newman exits with 1 when a test fails, and each fixture has tests that fail on purpose.
      if (error.code !== 1) throw error;
    }
    const { run } = JSON.parse(readFileSync(report, "utf8"));
    const items = run.executions.map((execution) => ({
      name: execution.item.name,
      tests: (execution.assertions ?? []).map((assertion) => ({ name: assertion.assertion, passed: !assertion.error })),
    }));
    if (run.failures.some((failure) => failure.error.name !== "AssertionError")) throw new Error(`golden: a script of ${job.collection} failed in Newman: ${JSON.stringify(run.failures.map((failure) => failure.error.message))}`);
    writeFileSync(join(FIXTURES, job.golden), `${JSON.stringify({ runner: `newman@${NEWMAN}`, items }, null, 2)}\n`);
    console.log(`golden: ${job.golden}: ${items.length} requests, ${items.reduce((sum, item) => sum + item.tests.length, 0)} tests`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
  server.close();
}
