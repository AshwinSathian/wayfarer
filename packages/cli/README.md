# wayfarer-cli

Run a [Wayfarer](https://wayfarer.ashwinsathian.com) or Postman collection
from a terminal or a CI job. The command line sends with the same engine as
the Wayfarer app: the same script sandbox, variables, vault and assertions.
A run here gives the results the same run gives in the app, and a test in the
repository checks that in Chromium, Firefox and WebKit.

```bash
npx wayfarer-cli run orders.postman_collection.json -e local.postman_environment.json --allow-scripts
```

```
✓ Create order: 200 OK, 16 ms
    ✓ status is 200
    ✓ the SKU was sent
✓ Fetch order: 200 OK, 2 ms
    ✓ the SKU came back

2 results in 1 iteration; 0 failed; 3 of 3 tests passed.
```

When a test fails, the line says what was expected, and the exit code is `1`:

```
✗ Fetch order: 200 OK, 3 ms
    ✗ the SKU came back: expected 'ABC-2' to deeply equal 'ABC-1'

2 results in 1 iteration; 1 failed; 2 of 3 tests passed.
```

## Install

It needs Node.js 22.12 or later. Run it with `npx`, or install it:

```bash
npm install --global wayfarer-cli
wayfarer-cli --version
```

In a project, add it as a dev dependency and pin the major version
(`wayfarer-cli@2`): a new major version may change what a run does.

## What it runs

```bash
wayfarer-cli run <file> [options]
```

`<file>` can be any of:

- a Wayfarer collection (Export in the app);
- a Wayfarer workspace backup (Settings → Backup). It brings its active
  environment, its globals and its vault. A backup with several collections
  needs `--collection <name>`;
- a Postman collection, v2.0 or v2.1;
- an Insomnia export or an OpenAPI description, read the way the app
  imports them.

## Options

| Option | What it does |
|---|---|
| `-e`, `--environment <file>` | The variables: a Wayfarer environments file or a Postman environment. |
| `-d`, `--data <file>` | A data file, CSV or JSON. Each row is one iteration. |
| `-n`, `--iterations <n>` | How many iterations. Default: one per row of the data file, or 1. |
| `--collection <name>` | Which collection to run, from a file that holds several. |
| `--reporter <list>` | `cli`, `json`, `junit`, comma-separated. Default `cli`. |
| `--out <dir>` | Where `json` and `junit` reports go. Default: the current folder. |
| `--bail` | Stop at the first failure. |
| `--timeout <ms>` | Give up on a request after this long. Default: no limit. |
| `--insecure` | Don't verify TLS certificates, for every request of the run. |
| `--allow-scripts` | Run the file's scripts (see below). |
| `--vault-file <file>` | A vault exported from the app, for requests that use a vault secret. |
| `-v`, `--version` | Print the version. |
| `-h`, `--help` | Print the usage. |

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Every request got a response and every test passed. |
| `1` | A test failed, a request got no response, or a script ended in an error. |
| `2` | Nothing was run. The message on stderr says why. |

## Scripts run only when you allow them

In the app, scripts from an imported file run only after you've read them and
marked them as trusted. A file passed to the command line has had no such
review, so a collection with any pre-request or post-response script is not
run until you add `--allow-scripts`:

```
$ npx wayfarer-cli run orders.postman_collection.json -e local.postman_environment.json
This collection has scripts, in the request "Create order", the request "Fetch order". A file's scripts have not been reviewed: read them, and run again with --allow-scripts only if you trust them. Nothing was sent.
```

That run exits `2`. With the flag, every script in the file runs in QuickJS
(compiled to WebAssembly), with the same allow-list of globals as the app.
There is no `process`, and `require` gives only the five bundled libraries
(chai, crypto-js, lodash, moment, uuid), so a script can't read your files or
environment variables. It can still send
requests of its own with `pm.sendRequest` and change the request it belongs
to, so read a file's scripts before you allow them.

What `pm` supports is listed row by row in
[docs/postman-compatibility.md](https://github.com/AshwinSathian/wayfarer/blob/main/docs/postman-compatibility.md).
That file is generated from the cases the test suite runs.

## Coming from Newman

Most flags carry over:

| Newman | wayfarer-cli |
|---|---|
| `newman run c.json` | `wayfarer-cli run c.json` (add `--allow-scripts` if it has scripts) |
| `-e env.json` | `-e env.json` |
| `-d data.csv` | `-d data.csv` |
| `-n 3` | `-n 3` |
| `--bail` | `--bail` |
| `--timeout-request 5000` | `--timeout 5000` |
| `-k`, `--insecure` | `--insecure` |
| `-r cli,junit --reporter-junit-export out/report.xml` | `--reporter cli,junit --out out` (the file is `wayfarer-run.junit.xml`) |

Not supported: a globals file (`-g`), `--env-var`, and running a single
folder (`--folder`). Put those values in the environment file, or use a
workspace backup, which carries its globals.

The order of a run follows Newman, including `setNextRequest`, skipped
requests and data-file iterations. That order is checked against
golden files written by Newman.

## Reports

`--reporter json` writes `wayfarer-run.json` and `--reporter junit` writes
`wayfarer-run.junit.xml`, the same files the app's run view saves. Both go
in `--out`, which is created if it doesn't exist (2.0.1 and later). The
JUnit file has one `<testsuite>` per request and one `<testcase>` per test:

```xml
<testsuites name="Orders API" tests="3" failures="0" errors="0" time="0.019">
  <testsuite name="Create order" id="01a2e75e-…" tests="2" failures="0" errors="0" skipped="0" time="0.016">
    <testcase name="status is 200" classname="Create order"/>
    <testcase name="the SKU was sent" classname="Create order"/>
  </testsuite>
  …
</testsuites>
```

## Secrets and the vault

A Wayfarer variable can be protected: its value is a reference to a secret
in the app's encrypted vault, written `{{$secret.<id>}}`. A request that
uses one needs the vault. A workspace backup includes it, or `--vault-file`
names one exported from the app. The passphrase comes from the
`WAYFARER_VAULT_PASSPHRASE` environment variable, never from an argument,
because other users of the machine can see a process's arguments.

Without the vault, such a request isn't sent: a secret's reference never goes
out as text. Secrets are masked in both reports, as they are in the app's
history. When a script sets a protected variable, the new value lasts for the
rest of the run; the vault file isn't written.

The app asks before a pre-request script sends a request with a vault secret
to a different host. Nobody can answer that in a terminal, so the answer is
no: the request isn't sent, and the run ends with the reason.

## In CI

A GitHub Actions job that runs a collection on every push, keeps the JUnit
report and fails when a test fails:

```yaml
name: API tests
on: [push]
jobs:
  api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
      - name: Run the collection
        run: npx --yes wayfarer-cli@2 run api/collection.json -e api/ci.environment.json --allow-scripts --reporter cli,junit --out reports
        env:
          # Only needed for requests that use a vault secret.
          WAYFARER_VAULT_PASSPHRASE: ${{ secrets.WAYFARER_VAULT_PASSPHRASE }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: api-report
          path: reports/wayfarer-run.junit.xml
```

Every release is published from this repository's
[`release.yml`](https://github.com/AshwinSathian/wayfarer/blob/main/.github/workflows/release.yml)
with an npm provenance attestation. `npm audit signatures` in a project that
installs it checks the attestation.

## Where requests go

Every request goes straight from Node. Node has no CORS, no mixed-content
rule and no forbidden headers, so a route set in the app (Auto, Local
Bridge) is ignored here, and nothing is ever sent twice.

For a proxy, set `NODE_USE_ENV_PROXY=1` together with `HTTPS_PROXY`,
`HTTP_PROXY` and `NO_PROXY`. That is Node's own proxy support, in Node 22.21
and 24.5 and later.

## Not supported

- **OAuth 2.0 tokens.** A request with OAuth 2.0 auth isn't sent, and the
  result says so. Get the token in an earlier CI step and pass it as a
  variable.
- **Files in a request body.** A file you pick in the app stays in that
  browser and isn't in the collection file, so such a request isn't sent.
- **Cookies.** There's no cookie jar: a request carries only the cookies
  it sets itself.
- **Event streams and WebSockets.** An event stream is read as one body
  when it ends, so give a `--timeout` for one that doesn't end. A `ws:` or
  `wss:` address gets no response.

The full guide is
[docs/cli.md](https://github.com/AshwinSathian/wayfarer/blob/main/docs/cli.md).

## Licence

MIT. The packages bundled into `dist/wayfarer-cli.mjs` are listed with their
licences in `dist/THIRD_PARTY_LICENSES.txt`. The script engine,
`quickjs-emscripten`, is an ordinary dependency and carries its own.
