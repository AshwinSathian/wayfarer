# AWS Signature Version 4 test cases

Test fixtures for the signer (plan P4.8), vendored unchanged at a pinned
commit, with the licence and the notice beside them. None of it is in the
app that is built.

From [`awslabs/aws-c-auth`](https://github.com/awslabs/aws-c-auth),
`tests/aws-signing-test-suite/v4/`, commit
`84a26ea184d9ccd322c8164759510b3604ab13fd`, Apache-2.0 (`LICENSE`, `NOTICE`).

Twenty of the suite's cases, each with five of its files: `context.json`,
`request.txt`, `header-canonical-request.txt`, `header-string-to-sign.txt`
and `header-signature.txt`. The files for a signature in the query are
left behind: the app signs in the headers.

Cases of the suite that are not here, and why:

| Cases | Why |
|---|---|
| `get-utf8`, `get-space-*` | The request line holds a raw space or raw UTF-8 in its path, which a browser never sends: it encodes the path, and AWS encodes what it receives once more. `sigv4.spec.ts` has AWS's documented example of that instead |
| `post-x-www-form-urlencoded`, `post-x-www-form-urlencoded-parameters` | They sign `Content-Length`, which a browser writes itself |
| `get-header-key-duplicate`, `get-header-value-multiline`, `post-sts-header-after` | A request of the app has one value per header name, on one line, and a session token is always signed |
| the seven `*-unnormalized` cases | They ask for a path signed as written (`//`, `./`, `../`). A browser rewrites dots before it sends, and the signer drops empty segments as AWS does |
| `get-relative-relative-normalized`, `get-slash-dot-slash-normalized`, `get-slash-pointless-dot-normalized`, `get-slashes-normalized` | Not tried: the plan asks for twenty cases, and `get-relative-normalized` and `get-slash-normalized`, which are here, are of their kind |
