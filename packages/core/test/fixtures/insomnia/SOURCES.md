# Insomnia files other people wrote

Test fixtures for the Insomnia importer (plan P4.4), vendored unchanged at
a pinned commit, with the licence beside them. None of it is in the app
that is built.

From [`Kong/insomnia`](https://github.com/Kong/insomnia), commit
`93e93d5d079efba1b3f642b6b3c0d5975b2855ed`, Apache-2.0 (`LICENSE`).

| Folder | From | What is here |
|---|---|---|
| `inso/insomnia-v4/` | `packages/insomnia-inso/src/db/fixtures/insomnia-v4/` | A format 4 export as JSON and as YAML, and four files that are not one (empty, a key twice, no format, format 3) |
| `inso/insomnia-v5/` | `packages/insomnia-inso/src/db/fixtures/insomnia-v5/` | Two format 5 files |
| `roundtrip/` | `packages/insomnia/src/common/__fixtures__/insomnia-v5-roundtrip/` | 14 format 5 files: collections, environments, an MCP client, and one OpenAPI description (`security.yaml`) |
| `smoke/` | `packages/insomnia-smoke-test/fixtures/*.yaml` | 42 of its 44 YAML files: 38 in format 5 and 4 in format 4. Left behind: `openapi3.yaml` and `swagger2.yaml`, which are not Insomnia's format |
