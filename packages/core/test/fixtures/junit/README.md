# JUnit schema

`junit-10.xsd` is the schema Jenkins' xunit plugin reads JUnit reports with,
copied unchanged from
<https://github.com/jenkinsci/xunit-plugin/blob/0afa700702a6617f483cfd9407711976dc0bd74a/src/main/resources/org/jenkinsci/plugins/xunit/types/model/xsd/junit-10.xsd>
(SHA-256 `a1a816f58d1bf95ebabf371994df0b9246dee66ea9572fbec4f9296f1b2c0ff6`).
MIT licence, in the file's own header.

`test/run/junit-xsd.test.ts` validates a run's JUnit report against it with
`xmllint`. macOS has the binary; on Debian and Ubuntu it is the package
`libxml2-utils`, which CI installs. The file is a test fixture and is not
part of the app.
