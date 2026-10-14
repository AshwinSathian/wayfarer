# The command line: `wayfarer-cli`

`wayfarer-cli` runs a collection from a terminal or a CI job, as the app's
runner does, and exits with `1` when a test fails or a request gets no
response. It sends with the same engine as the app (`packages/core`): the
same order of scripts, the same variables and vault, the same assertions,
the same reports. A collection run from the command line gives the results
the same run gives in the app <!-- claim:C-065 -->; a test runs one fixture
both ways, in Chromium, Firefox and WebKit, and compares the two reports.

It needs Node.js 22.12 or later. Until it is published on npm, build it from
this repository:

```bash
npm ci
npm -w packages/cli run build
node packages/cli/dist/wayfarer-cli.mjs run my-collection.json
```

## Running a collection

```bash
wayfarer-cli run <file> [options]
```

`<file>` is any of:

- a Wayfarer collection (**Export** of a collection, `"$id": "wayfarer/collection/3"`);
- a Wayfarer workspace backup (Settings, **Backup**, `"$id": "wayfarer/workspace/3"`):
  its active environment, its globals and its vault come with it, and a
  backup that holds several collections needs `--collection <name>`;
- a Postman collection (v2.0 or v2.1), an Insomnia export or an OpenAPI
  description, read exactly as the app imports it.

| Option | |
|---|---|
| `-e`, `--environment <file>` | The variables: a Wayfarer environments file or a Postman environment. |
| `-d`, `--data <file>` | A data file, CSV or JSON: one iteration per row, as in the app. |
| `-n`, `--iterations <n>` | How many iterations. Default: one per row of the data file, or 1. |
| `--collection <name>` | Which collection of a file that holds several. |
| `--reporter <list>` | `cli`, `json`, `junit`, comma-separated; default `cli`. `json` writes `wayfarer-run.json` and `junit` writes `wayfarer-run.junit.xml`: the files the app's run view saves. |
| `--out <dir>` | Where the reports are written. Default: the current directory. |
| `--bail` | Stop at the first failure. |
| `--timeout <ms>` | Give up on a request after this long. Default: no limit. |
| `--insecure` | Do not verify servers' TLS certificates, for every request of the run. Node says so on stderr. |
| `--allow-scripts` | Run the file's scripts (below). |
| `--vault-file <file>` | A vault file (**Export vault** in the app), for the requests that use a vault secret. |

Exit codes: `0` every request got a response and every test passed; `1` a
test failed, or a request got no response, or a script ended in an error;
`2` nothing was run, and the message says why.

## Scripts

In the app, a collection that came from a file runs its scripts only after
you have read them and said you trust them (the review). A file carries no
such review. So the command line runs a collection that has a pre-request
or post-response script only when it is told to: without `--allow-scripts`
it names where the scripts are, sends nothing and exits with `2`
<!-- claim:C-066 -->. With it, every script of the file runs, in QuickJS, with
the same allow-list as in the app (see [scripts](scripts.md)). Read a file's
scripts before you give it the flag: a script can send requests of its own
(`pm.sendRequest`) and change the request it belongs to.

## Variables and the vault

What a script sets is kept for the rest of the run, in memory: nothing is
written back to the files you gave.

A request that uses a vault secret (`{{$secret.<id>}}`) needs the vault: a
workspace backup has it, or give a vault file with `--vault-file`. Its
passphrase is read from the environment variable `WAYFARER_VAULT_PASSPHRASE`,
never from an argument (an argument is seen by every user of the machine).
Without the vault such a request is not sent: a secret's reference never
goes out as text. A secret is masked in the reports as it is in the app's
history. A script's `set` on a protected variable changes the secret for the
rest of the run only; the vault file is not written.

When a pre-request script moves a request that uses a vault secret to
another host, the app asks before it reads the vault. From the command line
no one is there to answer, so the answer is no: that request is not sent,
and the run ends there with the reason.

## Where requests go

Every request goes straight from Node. Node has no CORS, no mixed-content
rule and no forbidden header, so the Local Bridge adds nothing here: a
request's or a collection's route (Auto, Local Bridge) is not followed, and
nothing is ever sent twice. A proxy is used when you set
`NODE_USE_ENV_PROXY=1` with `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY`:
Node's own support, in Node 22.21 and 24.5 and later.

## What the command line does not do

- **OAuth 2.0 tokens.** A request with OAuth 2.0 auth is not sent; the
  result says so. Get the token in your CI job and put it in a variable.
- **Files of a request body.** A file picked in the app is kept in that
  browser, not in the collection file: such a request is not sent.
- **The cookie jar.** As a direct request from the app, a request carries
  no cookie it did not set itself.
- **Event streams and WebSockets.** An event stream is read as a body when
  it ends: give `--timeout` for one that does not. A `ws:` or `wss:`
  address gets no response.

## In a CI job

```yaml
- run: npx wayfarer-cli run collections/api.json -e env/ci.json --allow-scripts --reporter cli,junit --out reports
  env:
    WAYFARER_VAULT_PASSPHRASE: ${{ secrets.WAYFARER_VAULT_PASSPHRASE }}
```
