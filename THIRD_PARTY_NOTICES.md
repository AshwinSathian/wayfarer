# Third-party notices

Wayfarer's own code is MIT-licensed (see [LICENSE](LICENSE)). The production build also contains the third-party material below. npm dependencies bundled into JavaScript are listed, with their licence texts, in [`/3rdpartylicenses.txt`](3rdpartylicenses.txt), which the build writes (Angular `extractLicenses`) and serves next to this file.

## Inter

Self-hosted from `@fontsource-variable/inter`. Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter). Licensed under the SIL Open Font License, Version 1.1 (https://openfontlicense.org).

## JetBrains Mono

Self-hosted from `@fontsource/jetbrains-mono`. Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono). Licensed under the SIL Open Font License, Version 1.1 (https://openfontlicense.org).

## Test fixtures (not in the production build)

`packages/core/test/fixtures/postman/` holds Postman files that other people wrote, unchanged, for the tests of the Postman importer and exporter. They are in the repository and not in the app that is built. Each set is at a pinned commit, named in `packages/core/test/fixtures/postman/SOURCES.md`, with its licence beside it:

- `newman/integration/`: the integration collections of Newman (https://github.com/postmanlabs/newman). Copyright Postman, Inc. Licensed under the Apache License, Version 2.0 (`newman/LICENSE.md`).
- `adyen/`: six collections of Adyen's Postman repository (https://github.com/Adyen/adyen-postman). Copyright (c) 2023 Adyen. MIT (`adyen/LICENSE`).
- `msgraph/`: the Microsoft Graph Postman collection and its environments (https://github.com/microsoftgraph/microsoftgraph-postman-collections). Copyright (c) 2019 Microsoft Graph. MIT (`msgraph/LICENSE`).

`packages/core/test/fixtures/insomnia/` holds Insomnia export files from Insomnia's own repository (https://github.com/Kong/insomnia), unchanged, for the tests of the Insomnia importer, at the commit named in `packages/core/test/fixtures/insomnia/SOURCES.md`. Copyright Kong Inc. Licensed under the Apache License, Version 2.0 (`packages/core/test/fixtures/insomnia/LICENSE`).

`packages/core/test/fixtures/openapi/` holds OpenAPI and Swagger descriptions that other people wrote, unchanged, for the tests of the OpenAPI importer. Each set is at a pinned commit, named in `packages/core/test/fixtures/openapi/SOURCES.md`, with its licence beside it:

- `swagger-petstore/`: the Petstore as OpenAPI 3.0 and 3.1, from Swagger Petstore (https://github.com/swagger-api/swagger-petstore). Copyright SmartBear Software. Licensed under the Apache License, Version 2.0 (`swagger-petstore/LICENSE`).
- `swagger-codegen/`: the Petstore as Swagger 2.0, from Swagger Codegen (https://github.com/swagger-api/swagger-codegen). Copyright SmartBear Software. Licensed under the Apache License, Version 2.0 (`swagger-codegen/LICENSE`).
- `oai/`: ten examples of the OpenAPI Specification (https://github.com/OAI/OpenAPI-Specification). Copyright The Linux Foundation. Licensed under the Apache License, Version 2.0 (`oai/LICENSE`).

`packages/core/test/fixtures/aws-sigv4/` holds twenty cases of AWS's Signature Version 4 test suite, unchanged, for the tests of the signer, from the AWS C Auth library (https://github.com/awslabs/aws-c-auth) at the commit named in `packages/core/test/fixtures/aws-sigv4/SOURCES.md`. Copyright Amazon.com, Inc. or its affiliates. Licensed under the Apache License, Version 2.0 (`packages/core/test/fixtures/aws-sigv4/LICENSE`, with its `NOTICE`).
