// The CLI as a user runs it: the built file, in a child process, against
// servers on 127.0.0.1. `npm test` builds it first. CI runs this on Node 22
// and 24 (P6.5).
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { startEchoServer } from "../../../e2e/support/echo-server.mjs";

const CLI = fileURLToPath(new URL("../dist/wayfarer-cli.mjs", import.meta.url));
const RUN_FIXTURES = fileURLToPath(new URL("../../core/test/fixtures/run/", import.meta.url));
const VAULT = fileURLToPath(new URL("./fixtures/vault.json", import.meta.url));
const VAULT_PASSPHRASE = "correct horse battery staple";
const SECRET_ID = "0b6f4a2e-cli-fixture";
const SECRET = "s3cret-from-the-vault";
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

let echo;
let base;
let folder;
/** What reached the recording server, one entry per request. */
const seen = [];
let recorder;
let recorded;

before(async () => {
  echo = await startEchoServer(0);
  base = `http://127.0.0.1:${echo.address().port}`;
  folder = await mkdtemp(join(tmpdir(), "wayfarer-cli-"));
  recorder = createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, headers: req.headers });
    res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
  });
  await new Promise((resolve) => recorder.listen(0, "127.0.0.1", resolve));
  recorded = `http://127.0.0.1:${recorder.address().port}`;
});

after(async () => {
  echo.close();
  recorder.close();
  await rm(folder, { recursive: true, force: true });
});

/** Runs the CLI: its exit code and what it wrote. Nothing of this process's environment but PATH goes with it. */
function cli(args, env = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      { cwd: folder, env: { PATH: process.env.PATH, ...env } },
      (error, stdout, stderr) => {
        resolve({ code: error ? error.code : 0, stdout, stderr });
      },
    );
  });
}

async function file(name, value) {
  const path = join(folder, name);
  await writeFile(path, typeof value === "string" ? value : JSON.stringify(value));
  return path;
}

const environment = (values) =>
  file("env.json", {
    name: "Run env",
    values: Object.entries(values).map(([key, value]) => ({ key, value, enabled: true })),
  });

const meta = (id) => ({ id, createdAt: 1, updatedAt: 1 });
const request = (id, fields) => ({
  id,
  meta: meta(id),
  collectionId: "col",
  name: id,
  order: 0,
  method: "GET",
  url: "",
  params: [],
  headers: [],
  body: { mode: "none" },
  auth: { type: "none" },
  scripts: { pre: "", post: "" },
  tests: [],
  settings: {},
  ...fields,
});
const collection = {
  id: "col",
  meta: meta("col"),
  name: "Made here",
  order: 0,
  variables: [],
  auth: { type: "none" },
  scripts: { pre: "", post: "" },
};
const collectionFile = (requests) => ({
  $id: "wayfarer/collection",
  meta: meta("file"),
  collection,
  folders: [],
  requests,
});

test("--version says the package's version, --help the usage; no command is a usage error", async () => {
  assert.deepEqual(await cli(["--version"]), { code: 0, stdout: `${version}\n`, stderr: "" });
  const help = await cli(["--help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /^Usage: wayfarer-cli run <file> \[options\]/);
  assert.equal((await cli([])).code, 2);
  const unknown = await cli(["send", "x"]);
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /Unknown command or arguments: send x/);
});

test("the P5.2 fixture with its data file gives Newman's results, writes both reports, and exits 1 for its two failed tests", async () => {
  const env = await environment({ base, role: "from the environment" });
  const run = await cli([
    "run",
    join(RUN_FIXTURES, "data.postman_collection.json"),
    "-e",
    env,
    "-d",
    join(RUN_FIXTURES, "data.csv"),
    "--allow-scripts",
    "--reporter",
    "cli,json,junit",
  ]);
  assert.equal(run.code, 1, run.stderr);
  assert.match(run.stdout, /15 results in 5 iterations; 2 failed; 38 of 40 tests passed\.\n$/);
  assert.match(run.stdout, /✗ only an admin is let in: expected false to equal true/);

  const golden = JSON.parse(readFileSync(join(RUN_FIXTURES, "data.golden.json"), "utf8"));
  const report = JSON.parse(await readFile(join(folder, "wayfarer-run.json"), "utf8"));
  assert.equal(report.$id, "wayfarer/run");
  assert.deepEqual(report.totals, { requests: 15, skipped: 0, tests: 40, failedTests: 2, errors: 0 });
  assert.deepEqual(
    report.results.map((result) => ({
      iteration: result.iteration,
      name: result.name,
      tests: result.tests.map(({ name, passed }) => ({ name, passed })),
    })),
    golden.items,
  );
  const junit = await readFile(join(folder, "wayfarer-run.junit.xml"), "utf8");
  assert.match(junit, /<testsuites name="Run with a data file" tests="40" failures="2" errors="0"/);
});

test("the flow and order fixtures run as Newman ran them; a run where everything passes exits 0", async () => {
  const env = await environment({ base });
  // As Newman ran them (npm run golden): the flow three times, the order once.
  for (const [name, iterations] of [
    ["flow", "3"],
    ["order", "1"],
  ]) {
    const run = await cli([
      "run",
      join(RUN_FIXTURES, `${name}.postman_collection.json`),
      "-e",
      env,
      "-n",
      iterations,
      "--allow-scripts",
      "--reporter",
      "json",
    ]);
    assert.equal(run.code, 0, `${name}: ${run.stderr}`);
    const golden = JSON.parse(readFileSync(join(RUN_FIXTURES, `${name}.golden.json`), "utf8"));
    const report = JSON.parse(await readFile(join(folder, "wayfarer-run.json"), "utf8"));
    // Newman lists no request that was skipped.
    assert.deepEqual(
      report.results
        .filter((result) => !result.skipped)
        .map((result) => ({
          iteration: result.iteration,
          name: result.name,
          tests: result.tests.map(({ name, passed }) => ({ name, passed })),
        })),
      golden.items.map((item) => ({ iteration: item.iteration, name: item.name, tests: item.tests })),
      name,
    );
  }
});

test("--out names a folder that does not exist yet: it is made, and the reports are written in it", async () => {
  // 2.0.0 ran the whole collection, then failed to write with ENOENT and exited 2, the code for "nothing was run".
  const env = await environment({ base });
  const run = await cli([
    "run",
    join(RUN_FIXTURES, "order.postman_collection.json"),
    "-e",
    env,
    "--allow-scripts",
    "--reporter",
    "json,junit",
    "--out",
    "reports/api",
  ]);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(
    JSON.parse(await readFile(join(folder, "reports", "api", "wayfarer-run.json"), "utf8")).$id,
    "wayfarer/run",
  );
  assert.match(await readFile(join(folder, "reports", "api", "wayfarer-run.junit.xml"), "utf8"), /^<\?xml/);
  // A folder that cannot be made (a file has the name) stops the run before anything is sent.
  await writeFile(join(folder, "taken"), "");
  const refused = await cli([
    "run",
    join(RUN_FIXTURES, "order.postman_collection.json"),
    "-e",
    env,
    "--allow-scripts",
    "--reporter",
    "json",
    "--out",
    "taken/api",
  ]);
  assert.equal(refused.code, 2);
  assert.match(refused.stderr, /^--out taken\/api: /);
  assert.equal(refused.stdout, "");
});

test("@claim:C-066 a collection with scripts is not run without --allow-scripts: it says where they are, and nothing is sent", async () => {
  const path = await file(
    "scripted.json",
    collectionFile([
      request("Scripted", { url: `${recorded}/scripted`, scripts: { pre: "", post: 'pm.test("ran", () => {});' } }),
    ]),
  );
  seen.length = 0;
  const refused = await cli(["run", path]);
  assert.equal(refused.code, 2);
  assert.match(
    refused.stderr,
    /This collection has scripts, in the request "Scripted"\..*--allow-scripts.*Nothing was sent\./s,
  );
  assert.equal(seen.length, 0);

  const allowed = await cli(["run", path, "--allow-scripts"]);
  assert.equal(allowed.code, 0, allowed.stderr);
  assert.match(allowed.stdout, /✓ ran/);
  assert.equal(seen.length, 1);
});

test("a vault secret is read from --vault-file with the passphrase, sent, and in no report", async () => {
  const path = await file(
    "secret.json",
    collectionFile([
      request("Secret", {
        url: `${recorded}/secret`,
        headers: [{ key: "X-Key", value: `{{$secret.${SECRET_ID}}}`, enabled: true }],
        tests: [{ id: "t", target: "status", operator: "equals", expected: "200" }],
      }),
    ]),
  );
  seen.length = 0;
  const run = await cli(["run", path, "--vault-file", VAULT, "--reporter", "cli,json,junit"], {
    WAYFARER_VAULT_PASSPHRASE: VAULT_PASSPHRASE,
  });
  assert.equal(run.code, 0, run.stderr);
  assert.equal(seen[0].headers["x-key"], SECRET);
  for (const written of [
    run.stdout,
    await readFile(join(folder, "wayfarer-run.json"), "utf8"),
    await readFile(join(folder, "wayfarer-run.junit.xml"), "utf8"),
  ])
    assert.doesNotMatch(written, new RegExp(SECRET));

  // C-007: without the vault the request is held back, and its reference never goes out as text.
  seen.length = 0;
  const without = await cli(["run", path]);
  assert.equal(without.code, 1);
  assert.match(without.stdout, /the run has no vault/);
  assert.equal(seen.length, 0);
  assert.equal((await cli(["run", path, "--vault-file", VAULT])).code, 2);
  const wrong = await cli(["run", path, "--vault-file", VAULT], { WAYFARER_VAULT_PASSPHRASE: "not it" });
  assert.equal(wrong.code, 2);
  assert.match(wrong.stderr, /is not the passphrase of the vault/);
});

test("a workspace backup brings its active environment, its globals and its vault", async () => {
  const vault = JSON.parse(readFileSync(VAULT, "utf8"));
  const backup = await file("backup.json", {
    $id: "wayfarer/workspace",
    exportedAt: 1,
    stores: {
      collections: [{ ...collection, scriptTrust: { trusted: true, approved: [] } }],
      folders: [],
      requests: [
        request("From the backup", {
          url: "{{host}}/backup?g={{g}}",
          headers: [{ key: "X-Key", value: `{{$secret.${SECRET_ID}}}`, enabled: true }],
        }),
      ],
      environments: [
        {
          id: "env",
          meta: meta("env"),
          name: "Staging",
          order: 0,
          vars: [{ key: "host", value: recorded, enabled: true }],
        },
      ],
      secrets: vault.secrets.map((secret) => ({ ...secret, meta: meta(secret.id) })),
      meta: [
        { key: "state", activeEnvironmentId: "env" },
        { key: "globals", variables: [{ key: "g", value: "global", enabled: true }] },
        { key: "vault", ...vault.vault },
      ],
    },
  });
  seen.length = 0;
  const run = await cli(["run", backup], { WAYFARER_VAULT_PASSPHRASE: VAULT_PASSPHRASE });
  assert.equal(run.code, 0, `${run.stdout}${run.stderr}`);
  assert.equal(seen[0].url, "/backup?g=global");
  assert.equal(seen[0].headers["x-key"], SECRET);
});

test("--insecure reaches a server whose certificate nobody vouches for; without it the request has no response and the run fails", async () => {
  const pem = (name) => readFileSync(fileURLToPath(new URL(`../../bridge/test/fixtures/${name}`, import.meta.url)));
  const server = createHttpsServer({ cert: pem("cert.pem"), key: pem("key.pem") }, (_req, res) =>
    res.writeHead(200).end("ok"),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const path = await file(
      "tls.json",
      collectionFile([request("TLS", { url: `https://127.0.0.1:${server.address().port}/` })]),
    );
    const refused = await cli(["run", path]);
    assert.equal(refused.code, 1);
    assert.match(refused.stdout, /TLS: no response/);
    const insecure = await cli(["run", path, "--insecure"]);
    assert.equal(insecure.code, 0, insecure.stdout);
    assert.match(insecure.stdout, /TLS: 200/);
  } finally {
    server.close();
  }
});

test("a request that gets no response fails the run; --bail stops there; --timeout gives up", async () => {
  const closed = createServer();
  await new Promise((resolve) => closed.listen(0, "127.0.0.1", resolve));
  const port = closed.address().port;
  closed.close();
  const path = await file(
    "down.json",
    collectionFile([
      request("Down", { url: `http://127.0.0.1:${port}/` }),
      request("After", { url: `${recorded}/after`, order: 1 }),
    ]),
  );
  const run = await cli(["run", path]);
  assert.equal(run.code, 1);
  assert.match(run.stdout, /✗ Down: no response/);
  assert.match(run.stdout, /✓ After: 200 OK/);
  const bailed = await cli(["run", path, "--bail"]);
  assert.doesNotMatch(bailed.stdout, /After/);
  assert.match(bailed.stdout, /The run stopped at the first failure\./);

  const slow = await file("slow.json", collectionFile([request("Slow", { url: `${base}/delay/2000` })]));
  const timedOut = await cli(["run", slow, "--timeout", "200"]);
  assert.equal(timedOut.code, 1);
  assert.match(timedOut.stdout, /Timed out after 200 ms/);
});

test("a refused connection is said as Node saw it, not as a browser would", async () => {
  const closed = createServer();
  await new Promise((resolve) => closed.listen(0, "127.0.0.1", resolve));
  const port = closed.address().port;
  closed.close();
  const path = await file("refused.json", collectionFile([request("Refused", { url: `http://127.0.0.1:${port}/` })]));
  const run = await cli(["run", path]);
  assert.equal(run.code, 1);
  assert.match(run.stdout, /✗ Refused: no response/);
  assert.match(run.stdout, /ECONNREFUSED/);
  assert.doesNotMatch(run.stdout, /browser|CORS|cross-origin|Local Bridge/i);
});

test("what cannot be run is said, with exit code 2", async () => {
  const path = await file("one.json", collectionFile([request("One", { url: `${recorded}/` })]));
  const cases = [
    [["run", join(folder, "missing.json")], /could not be read/],
    [["run", await file("bad.json", "{}")], /This is not a file Wayfarer can import/],
    [["run", path, "--reporter", "html"], /Unknown reporter "html"/],
    [["run", path, "-n", "x"], /--iterations takes a whole number/],
    [["run", path, "--collection", "Other"], /has no collection named "Other"/],
    [["run", path, "--unknown"], /Unknown option '--unknown'/],
  ];
  for (const [args, message] of cases) {
    const run = await cli(args);
    assert.equal(run.code, 2, args.join(" "));
    assert.match(run.stderr, message);
  }
});
