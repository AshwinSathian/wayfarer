# wayfarer-cli

Runs a [Wayfarer](https://github.com/AshwinSathian/wayfarer) collection, a
Wayfarer workspace backup or a Postman collection from a terminal or a CI
job, with the engine the Wayfarer app sends with: the same scripts, the
same variables and vault, the same results. It exits with `1` when a test
fails or a request gets no response.

```bash
npx wayfarer-cli run collection.json -e environment.json -d data.csv --allow-scripts --reporter cli,junit
```

- `-e` an environment (Wayfarer or Postman), `-d` a data file (CSV or JSON),
  `-n` iterations, `--bail`, `--timeout <ms>`, `--insecure`.
- `--reporter cli,json,junit` writes `wayfarer-run.json` and
  `wayfarer-run.junit.xml` (in `--out`, default the current folder).
- **A file's scripts run only with `--allow-scripts`.** Without it, a
  collection that has a script is not run and nothing is sent: read a
  file's scripts before you allow them.
- A request that uses a vault secret needs the vault: a workspace backup
  brings it, or `--vault-file` names an exported one. The passphrase is read
  from `WAYFARER_VAULT_PASSPHRASE`.
- Every request goes straight from Node: no CORS, no Local Bridge.

Node.js 22.12 or later. The full guide, with what the command line does not
do and a GitHub Actions example, is
[`docs/cli.md`](https://github.com/AshwinSathian/wayfarer/blob/main/docs/cli.md).

MIT licence. The packages bundled into `dist/wayfarer-cli.mjs` are listed,
with their licences, in `dist/THIRD_PARTY_LICENSES.txt`.
