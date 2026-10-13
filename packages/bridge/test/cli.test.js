'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs } = require('../bin/cli');

const TOKEN = 'a-token-of-sixteen+';

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

test('reads port, token and origins', () => {
  const args = parse(['--port', '8080', '--token', TOKEN, '--allow-origin', 'https://app.example']);
  assert.equal(args.port, 8080);
  assert.equal(args.token, TOKEN);
  assert.deepEqual(args.allowOrigin, ['https://app.example']);
  assert.equal(args.exitCode, undefined);
});

test('takes the token from WAYFARER_BRIDGE_TOKEN, and --token wins over it', () => {
  assert.equal(parse([], { WAYFARER_BRIDGE_TOKEN: TOKEN }).token, TOKEN);
  assert.equal(parse(['--token', `${TOKEN}2`], { WAYFARER_BRIDGE_TOKEN: TOKEN }).token, `${TOKEN}2`);
});

test('fails instead of guessing when an argument is wrong', () => {
  for (const argv of [
    ['--port', 'abc'],
    ['--port', '70000'],
    ['--port'],
    ['--token'],
    ['--token', '--rotate-token'],
    ['--token', 'short'],
    ['--allow-origin', 'not an origin'],
    ['--allow-origin', 'https://app.example/path'],
    ['--nope'],
  ]) {
    assert.equal(parse(argv).exitCode, 1, argv.join(' '));
  }
});
