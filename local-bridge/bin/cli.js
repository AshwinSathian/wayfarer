#!/usr/bin/env node
'use strict';

const { createServer } = require('../src/server');
const { loadOrCreateToken, TOKEN_FILE } = require('../src/token-store');
const pkg = require('../package.json');

const DEFAULT_PORT = 7717;
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'https://wayfarer.ashwinsathian.com',
];

const MIN_TOKEN_LENGTH = 16;

function parseArgs(argv, env = process.env) {
  const args = { allowOrigin: [], token: env.WAYFARER_BRIDGE_TOKEN || undefined };
  const fail = (message) => {
    console.error(`${message}\n`);
    args.help = true;
    args.exitCode = 1;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[(i += 1)];
      if (next === undefined || next.startsWith('--')) fail(`${arg} needs a value`);
      return next;
    };
    switch (arg) {
      case '--port': {
        const port = Number(value());
        if (Number.isInteger(port) && port > 0 && port < 65536) args.port = port;
        else fail('--port must be a whole number from 1 to 65535');
        break;
      }
      case '--token':
        args.token = value();
        break;
      case '--rotate-token':
        args.rotateToken = true;
        break;
      case '--allow-origin': {
        const origin = value();
        // An Origin header is scheme://host[:port], nothing after it.
        if (origin && URL.canParse(origin) && new URL(origin).origin === origin) args.allowOrigin.push(origin);
        else fail(`--allow-origin must be an origin like https://example.com, got: ${origin}`);
        break;
      }
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }
  if (args.token !== undefined && args.token.length < MIN_TOKEN_LENGTH) {
    fail(`The token must be at least ${MIN_TOKEN_LENGTH} characters`);
  }
  return args;
}

function printHelp() {
  console.log(`
wayfarer-local-bridge v${pkg.version}

An optional local relay that lets Wayfarer reach CORS-restrictive or
intranet-only APIs. Runs entirely on your own machine.

Usage:
  wayfarer-local-bridge [options]

Options:
  --port <n>            Port to listen on (default: ${DEFAULT_PORT})
  --token <value>        Use a fixed token instead of the persisted/generated one
                          (other users can read it in the process list; prefer the
                          WAYFARER_BRIDGE_TOKEN environment variable)
  --rotate-token          Generate and persist a fresh token, replacing the saved one
  --allow-origin <url>    Additional allowed Origin (repeatable). Defaults already
                          include localhost dev and the hosted Wayfarer app.
  --help                  Show this help

The bridge only ever binds to 127.0.0.1 — it is never reachable from other
machines on your network. Read README.md's security model before running
this against anything you care about.
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exitCode = args.exitCode ?? 0;
    return;
  }

  const port = args.port ?? DEFAULT_PORT;
  const token = args.token ?? loadOrCreateToken({ rotate: Boolean(args.rotateToken) });
  const allowedOrigins = new Set([...DEFAULT_ALLOWED_ORIGINS, ...args.allowOrigin]);

  const server = createServer({ token, allowedOrigins });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Pass --port <n> to use a different one.`);
    } else {
      console.error('Failed to start wayfarer-local-bridge:', err.message);
    }
    process.exitCode = 1;
  });

  server.listen(port, '127.0.0.1', () => {
    console.log('');
    console.log(`  wayfarer-local-bridge v${pkg.version} — listening on http://127.0.0.1:${port}`);
    console.log('');
    console.log(`  Bridge token: ${token}`);
    console.log(`  (persisted at ${TOKEN_FILE} — reused across restarts unless you pass --rotate-token)`);
    console.log('');
    console.log('  Allowed origins:');
    for (const origin of allowedOrigins) {
      console.log(`    - ${origin}`);
    }
    console.log('');
    console.log("  Paste the port and token into Wayfarer's Local Bridge settings to enable it.");
    console.log('  Anyone with this token who can reach an allowed origin can make this process');
    console.log("  issue HTTP requests on your behalf — stop it (Ctrl+C) when you're done, and");
    console.log('  only add origins you trust with --allow-origin.');
    console.log('');
  });

  const shutdown = () => {
    console.log('\nShutting down wayfarer-local-bridge...');
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) main();

module.exports = { parseArgs };
