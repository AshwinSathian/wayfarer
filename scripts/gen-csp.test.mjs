// Tests for scripts/gen-csp.mjs (P1.5). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyToHeaders, applyToIndex, serialize } from "./gen-csp.mjs";

const SPEC = {
  directives: {
    "default-src": ["'self'"],
    "script-src": ["'self'"],
    "frame-ancestors": ["'none'"],
  },
};

test("serialize joins directives in order and can omit meta-incompatible ones", () => {
  assert.equal(serialize(SPEC), "default-src 'self'; script-src 'self'; frame-ancestors 'none'");
  assert.equal(serialize(SPEC, { meta: true }), "default-src 'self'; script-src 'self'");
});

test("a directive with no sources serializes bare", () => {
  assert.equal(serialize({ directives: { "upgrade-insecure-requests": [] } }), "upgrade-insecure-requests");
});

test("applyToHeaders rewrites only the CSP line of the /* rule", () => {
  const before = "/*\n  Content-Security-Policy: old\n  X-A: 1\n/other\n  Content-Security-Policy: keep\n";
  assert.equal(
    applyToHeaders(before, "new"),
    "/*\n  Content-Security-Policy: new\n  X-A: 1\n/other\n  Content-Security-Policy: keep\n"
  );
});

test("applyToHeaders keeps CRLF line endings and is linear on pathological input", () => {
  assert.equal(
    applyToHeaders("/*\r\n  X-A: 1\r\n  Content-Security-Policy: old\r\n", "new"),
    "/*\r\n  X-A: 1\r\n  Content-Security-Policy: new\r\n"
  );
  const evil = "/*\n" + "\t\t\n".repeat(50_000);
  const start = performance.now();
  assert.throws(() => applyToHeaders(evil, "x"), /Content-Security-Policy/);
  assert.ok(performance.now() - start < 1000);
});

test("applyToIndex rewrites the CSP meta content attribute", () => {
  const before = '<meta\n  http-equiv="Content-Security-Policy"\n  content="old"\n/>';
  assert.equal(applyToIndex(before, "a 'self'"), '<meta\n  http-equiv="Content-Security-Policy"\n  content="a \'self\'"\n/>');
});

test("applyToHeaders and applyToIndex throw when their anchor is missing", () => {
  assert.throws(() => applyToHeaders("/*\n  X-A: 1\n", "x"), /Content-Security-Policy/);
  assert.throws(() => applyToIndex("<html></html>", "x"), /Content-Security-Policy/);
});

test("the committed files match security/csp.json", () => {
  execFileSync(process.execPath, ["scripts/gen-csp.mjs", "--check"], { stdio: "pipe" });
});

test("--check fails when either file is hand-edited, and a write fixes it", () => {
  const dir = mkdtempSync(join(tmpdir(), "csp-"));
  for (const path of ["security/csp.json", "public/_headers", "src/index.html", "scripts/gen-csp.mjs"]) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    cpSync(path, join(dir, path));
  }
  const run = () => execFileSync(process.execPath, ["scripts/gen-csp.mjs", "--check"], { cwd: dir, stdio: "pipe" });
  run();

  for (const file of ["public/_headers", "src/index.html"]) {
    const original = readFileSync(join(dir, file), "utf8");
    writeFileSync(join(dir, file), original.replace("object-src 'none'", "object-src *"));
    assert.throws(run, (error) => error.status === 1 && /out of sync/.test(String(error.stderr)), file);
    execFileSync(process.execPath, ["scripts/gen-csp.mjs"], { cwd: dir, stdio: "pipe" });
    run();
  }
});
