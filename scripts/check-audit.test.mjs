import test from "node:test";
import assert from "node:assert/strict";
import { unallowed } from "./check-audit.mjs";

const via = (id) => ({ title: "t", url: `https://github.com/advisories/${id}` });
const report = { vulnerabilities: { a: { via: [via("GHSA-1")] }, b: { via: ["a", via("GHSA-2")] } } };

test("an advisory that is allowed and not yet expired is passed; the rest fail", () => {
  const allowed = [{ id: "GHSA-1", expires: "2027-01-31", reason: "x" }];
  assert.equal(unallowed(report, "2026-11-18", allowed).length, 1);
  assert.match(unallowed(report, "2026-11-18", allowed)[0], /GHSA-2/);
});

test("an allowance stops on its day", () => {
  const allowed = [{ id: "GHSA-1", expires: "2027-01-31", reason: "x" }];
  assert.equal(unallowed({ vulnerabilities: { a: report.vulnerabilities.a } }, "2027-01-31", allowed).length, 0);
  assert.equal(unallowed({ vulnerabilities: { a: report.vulnerabilities.a } }, "2027-02-01", allowed).length, 1);
});

test("a report with nothing in it is clean", () => {
  assert.deepEqual(unallowed({}, "2026-11-18", []), []);
});
