# Postman files other people wrote

Test fixtures for the Postman importer and exporter (plan P4.2), vendored
unchanged at pinned commits. Each set keeps its licence beside it. None of
it is in the app that is built.

| Folder | From | Commit | Licence | What is here |
|---|---|---|---|---|
| `newman/integration/` | [`postmanlabs/newman`](https://github.com/postmanlabs/newman), `test/integration/` | `8fbb2eb43860193344dcccec3f67ec62c77d80f9` | Apache-2.0 (`newman/LICENSE.md`) | All 42 entries: 45 collections, with the environment, globals, data and option files that stand beside them |
| `adyen/` | [`Adyen/adyen-postman`](https://github.com/Adyen/adyen-postman), `postman/` | `78874d7b10d8cb438ed15eb01dd732c8d86540a7` | MIT (`adyen/LICENSE`) | Six of its collections, 920 kB of the repository's 6.2 MB: `CheckoutService-v72`, `BalancePlatformService-v2`, `TransferService-v4`, `PayoutService-v68`, `RecurringService-v68`, `BinLookupService-v54` |
| `msgraph/` | [`microsoftgraph/microsoftgraph-postman-collections`](https://github.com/microsoftgraph/microsoftgraph-postman-collections) | `4c294f551a312b789714bc66646d7642be20f844` | MIT (`msgraph/LICENSE`) | The collection and its two environment files. The repository is archived and its last commits delete these files; this is the last commit that holds them |

`newman-integration.golden.json` is not vendored: `npm run golden` writes
it, from what Newman gives for the collections of `newman/integration/`.
