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
// - run (P5.2): three collections run as a run: one with a data file of five
//   rows, one whose scripts choose the next request, one with requests
//   before, between and after its folders
//   (packages/core/test/run/run-golden.test.ts).
//
// - postman/newman-integration (P4.2): Newman's own integration collections,
//   each as it is in packages/core/test/fixtures/postman/newman/integration
//   with only its postman-echo.com addresses pointed at the local server, and
//   with the environment and globals files that stand beside it. One golden
//   file for all of them; a collection that needs another server, a data
//   file or a file to upload is not run, and the golden file says why
//   (packages/core/test/import/postman-newman.test.ts).
//
// Newman is not a dependency: its tree fails `npm audit` (18 advisories on
// 2026-10-10). It is fetched by npx for this run only, at a pinned version,
// into a folder of its own. Run it when a fixture changes: npm run golden
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { rewritePostmanFile, startEchoServer } from "../e2e/support/echo-server.mjs";

const NEWMAN = "6.2.3";
const FIXTURES = resolve("packages/core/test/fixtures");
const JOBS = [
  { collection: "postman-legacy.postman_collection.json", golden: "postman-legacy.golden.json" },
  { collection: "postman-export/shop.postman_collection.json", golden: "postman-export/shop.golden.json" },
  // P5.2: a run. Newman's order of requests, iteration by iteration, is what `runRequests` must give.
  { collection: "run/data.postman_collection.json", golden: "run/data.golden.json", run: ["--iteration-data", join(FIXTURES, "run/data.csv")] },
  { collection: "run/flow.postman_collection.json", golden: "run/flow.golden.json", run: ["--iteration-count", "3"] },
  // Requests before, between and after folders, at two depths: a run goes in the file's order.
  { collection: "run/order.postman_collection.json", golden: "run/order.golden.json", run: [] },
];

const server = await startEchoServer(0);
// Postman Echo's own paths, for the collections that were written against postman-echo.com.
const echo = await startEchoServer(0, "127.0.0.1", { postmanEcho: true });
const ECHO_BASE = `http://127.0.0.1:${echo.address().port}`;
const work = mkdtempSync(join(tmpdir(), "wayfarer-golden-"));
const report = join(work, "report.json");
// The file the exported collection's bodies name: `FILES["pixel.png"]` of packages/core/test/export/fixtures.ts.
writeFileSync(join(work, "pixel.png"), Uint8Array.from({ length: 64 }, (_, index) => index));
try {
  for (const job of JOBS) {
    const args = ["--yes", `newman@${NEWMAN}`, "run", join(FIXTURES, job.collection), "--env-var", `base=http://127.0.0.1:${server.address().port}`, ...(job.run ?? []), "--working-dir", work, "--reporters", "json", "--reporter-json-export", report];
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
      ...(job.run && { iteration: execution.cursor.iteration }),
      name: execution.item.name,
      tests: (execution.assertions ?? []).map((assertion) => ({ name: assertion.assertion, passed: !assertion.error })),
    }));
    if (run.failures.some((failure) => failure.error.name !== "AssertionError")) throw new Error(`golden: a script of ${job.collection} failed in Newman: ${JSON.stringify(run.failures.map((failure) => failure.error.message))}`);
    writeFileSync(join(FIXTURES, job.golden), `${JSON.stringify({ runner: `newman@${NEWMAN}`, items }, null, 2)}\n`);
    console.log(`golden: ${job.golden}: ${items.length} requests, ${items.reduce((sum, item) => sum + item.tests.length, 0)} tests`);
  }
  await integration();
} finally {
  rmSync(work, { recursive: true, force: true });
  server.close();
  echo.close();
}

/** Newman on a collection file, from `work`. What it gave: each request with its tests, and the errors of scripts that are not failed tests. */
async function newman(collection, extra) {
  const args = ["--yes", `newman@${NEWMAN}`, "run", collection, ...extra, "--working-dir", work, "--timeout-request", "10000", "--reporters", "json", "--reporter-json-export", report];
  rmSync(report, { force: true });
  try {
    await new Promise((done, failed) => execFile("npx", args, { cwd: work, timeout: 120_000 }, (error) => (error ? failed(error) : done())));
  } catch (error) {
    if (error.code !== 1) throw error;
  }
  const { run } = JSON.parse(readFileSync(report, "utf8"));
  return {
    items: run.executions.map((execution) => ({
      name: execution.item.name,
      tests: (execution.assertions ?? []).map((assertion) => ({ name: assertion.assertion, passed: !assertion.error })),
    })),
    errors: run.failures.filter((failure) => failure.error.name !== "AssertionError").map((failure) => `${failure.source?.name ?? ""}: ${failure.error.message}`.replaceAll(ECHO_BASE, "<echo>")),
  };
}

/** Why a collection of Newman's is not run here, or null. Read from the file: nothing is decided by name. */
function notRun(file, collection) {
  const dir = dirname(file);
  const stem = file.replace(/\.postman_collection\.json$/, "");
  if (readdirSync(dir).some((name) => join(dir, name).startsWith(`${stem}.postman_data.`))) return "it is run with a data file, once per row: a run is P5.2";
  const text = JSON.stringify(collection);
  const hosts = new Set();
  const visit = (items) => {
    for (const item of items ?? []) {
      if (Array.isArray(item.item)) visit(item.item);
      else {
        const url = typeof item.request === "string" ? item.request : typeof item.request?.url === "string" ? item.request.url : item.request?.url?.raw ?? "";
        const host = /^(?:[a-z]+:\/\/)?([^/?#]*)/i.exec(url)?.[1] ?? "";
        if (host && !host.includes("{{") && !host.startsWith("127.0.0.1")) hosts.add(host);
      }
    }
  };
  visit(collection.item);
  if (hosts.size) return `it calls ${[...hosts].join(", ")}: a server these fixtures do not have`;
  if (/"type":\s*"file"|"mode":\s*"file"/.test(text)) return "it uploads a file, which a collection of the app names and does not hold";
  if (/sendRequest[^;]*postman-echo\.com/.test(text)) return "a script of it calls postman-echo.com by name";
  if (/setNextRequest/.test(text)) return "its scripts choose the next request (setNextRequest): a run is P5.2";
  return null;
}

async function integration() {
  const root = join(FIXTURES, "postman/newman/integration");
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".postman_collection.json")) files.push(path);
    }
  };
  walk(root);
  // As the page reads a file: UTF-8 or, by its byte order mark, UTF-16; the mark is not part of the text.
  const read = (path) => {
    const bytes = readFileSync(path);
    return JSON.parse(new TextDecoder(bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : "utf-8").decode(bytes));
  };
  const collections = {};
  for (const file of files) {
    const name = relative(root, file);
    const original = read(file);
    if (!Array.isArray(original.item)) {
      collections[name] = { notRun: "it is a Postman Collection v1" };
      continue;
    }
    const collection = rewritePostmanFile(original, ECHO_BASE);
    const reason = notRun(file, collection);
    if (reason) {
      collections[name] = { notRun: reason };
      continue;
    }
    const extra = [];
    for (const [kind, flag] of [["environment", "-e"], ["globals", "-g"]]) {
      const beside = file.replace(/\.postman_collection\.json$/, `.postman_${kind}.json`);
      if (!existsSync(beside)) continue;
      const copy = join(work, `${kind}.json`);
      writeFileSync(copy, JSON.stringify(rewritePostmanFile(read(beside), ECHO_BASE)));
      extra.push(flag, copy);
    }
    const copy = join(work, "collection.json");
    writeFileSync(copy, JSON.stringify(collection));
    try {
      collections[name] = await newman(copy, extra);
    } catch (error) {
      if (!error.killed) throw error;
      collections[name] = { notRun: "Newman did not finish it in two minutes" };
      console.log(`golden: ${name}: not finished`);
      continue;
    }
    console.log(`golden: ${name}: ${collections[name].items.length} requests, ${collections[name].items.reduce((sum, item) => sum + item.tests.length, 0)} tests${collections[name].errors.length ? `, ${collections[name].errors.length} script errors` : ""}`);
  }
  writeFileSync(join(FIXTURES, "postman/newman-integration.golden.json"), `${JSON.stringify({ runner: `newman@${NEWMAN}`, collections }, null, 2)}\n`);
  console.log(`golden: postman/newman-integration.golden.json: ${Object.values(collections).filter((entry) => entry.items).length} collections run, ${Object.values(collections).filter((entry) => entry.notRun).length} not run`);
}
