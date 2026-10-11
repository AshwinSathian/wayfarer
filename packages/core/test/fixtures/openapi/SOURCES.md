# OpenAPI descriptions other people wrote

Test fixtures for the OpenAPI importer (plan P4.3), vendored unchanged at
pinned commits. Each set keeps its licence beside it. None of it is in the
app that is built.

| Folder | From | Commit | Licence | What is here |
|---|---|---|---|---|
| `swagger-petstore/` | [`swagger-api/swagger-petstore`](https://github.com/swagger-api/swagger-petstore) | `d57941e8fe959e508796b27469b1e8bba73392dc` (branch `master`) for `petstore-3.0.yaml`, from `src/main/resources/openapi.yaml`; `c1b3c44cb0cae82a791742cdf6c822a8f5235a8f` (branch `v31`) for `petstore-3.1.yaml`, from `src/main/webapp/design-first/petstore.yaml` | Apache-2.0 (`swagger-petstore/LICENSE`) | The Petstore as OpenAPI 3.0.4 (19 operations) and as OpenAPI 3.1.1 (6 operations). The second refers to a schema by its `$id`, which the importer does not follow |
| `swagger-codegen/` | [`swagger-api/swagger-codegen`](https://github.com/swagger-api/swagger-codegen), `modules/swagger-codegen/src/test/resources/2_0/petstore.json` | `e70d615dba48edf2fcab5ee02693639975edc330` | Apache-2.0 (`swagger-codegen/LICENSE`) | The Petstore as Swagger 2.0 (20 operations): form parameters, a file upload, an API key, OAuth 2.0 |
| `oai/` | [`OAI/OpenAPI-Specification`](https://github.com/OAI/OpenAPI-Specification), `examples/` | `42a9e3d4eddade52363a5c4fac852e80681c2fe5` (tag `3.1.0`) | Apache-2.0 (`oai/LICENSE`) | Ten of the specification's own examples: `v2.0/` (`petstore.json`, `petstore-expanded.json`, `petstore.yaml`, `uber.yaml`), `v3.0/` (`petstore.yaml`, `petstore-expanded.yaml`, `uspto.yaml`, `link-example.yaml`, `callback-example.yaml`) and `v3.1/webhook-example.yaml`, which has no `paths` and is refused |
