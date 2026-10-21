"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseArgs } = require("../bin/cli");

const TOKEN = "a-token-of-sixteen+";

/** parseArgs reports problems on stderr; keep the test output clean. */
function parse(argv, env = {}) {
  const original = console.error;
  console.error = () => {};
  try {
    return parseArgs(argv, env);
  } finally {
    console.error = original;
  }
}

test("reads port, token and origins", () => {
  const args = parse(["--port", "8080", "--token", TOKEN, "--allow-origin", "https://app.example"]);
  assert.equal(args.port, 8080);
  assert.equal(args.token, TOKEN);
  assert.deepEqual(args.allowOrigin, ["https://app.example"]);
  assert.equal(args.exitCode, undefined);
});

test("takes the token from WAYFARER_BRIDGE_TOKEN, and --token wins over it", () => {
  assert.equal(parse([], { WAYFARER_BRIDGE_TOKEN: TOKEN }).token, TOKEN);
  assert.equal(parse(["--token", `${TOKEN}2`], { WAYFARER_BRIDGE_TOKEN: TOKEN }).token, `${TOKEN}2`);
});

test("fails instead of guessing when an argument is wrong", () => {
  for (const argv of [
    ["--port", "abc"],
    ["--port", "70000"],
    ["--port"],
    ["--token"],
    ["--token", "--rotate-token"],
    ["--token", "short"],
    ["--allow-origin", "not an origin"],
    ["--allow-origin", "https://app.example/path"],
    ["--nope"],
  ]) {
    assert.equal(parse(argv).exitCode, 1, argv.join(" "));
  }
});

test("--ca names a file of certificates, read when the bridge starts; one that cannot be read is an error", () => {
  const file = require("node:path").join(__dirname, "fixtures", "ca.pem");
  const args = parse(["--ca", file]);
  assert.match(args.ca, /^-----BEGIN CERTIFICATE-----/);
  assert.equal(args.exitCode, undefined);
  assert.equal(parse(["--ca", `${file}.missing`]).exitCode, 1);
  assert.equal(parse(["--ca", require.resolve("../package.json")]).exitCode, 1);
  assert.equal(parse(["--ca"]).exitCode, 1);
});

test("--cert and --key name the HTTPS certificate and its key, read when the bridge starts; one without the other is an error", () => {
  const fixture = (name) => require("node:path").join(__dirname, "fixtures", name);
  const args = parse(["--cert", fixture("cert.pem"), "--key", fixture("key.pem")]);
  assert.match(args.tls.cert, /^-----BEGIN CERTIFICATE-----/);
  assert.match(args.tls.key, /PRIVATE KEY-----/);
  assert.equal(args.exitCode, undefined);
  assert.equal(parse(["--cert", fixture("cert.pem")]).exitCode, 1);
  assert.equal(parse(["--key", fixture("key.pem")]).exitCode, 1);
  assert.equal(parse(["--cert", fixture("key.pem"), "--key", fixture("cert.pem")]).exitCode, 1);
  assert.equal(parse(["--cert", `${fixture("cert.pem")}.missing`, "--key", fixture("key.pem")]).exitCode, 1);
});

test("a pairing code is eight letters and digits that cannot be mistaken for each other, shown in two halves", () => {
  const { pairingCode } = require("../bin/cli");
  const codes = new Set(Array.from({ length: 200 }, () => pairingCode()));
  assert.ok(codes.size > 195);
  for (const code of codes)
    assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
});
