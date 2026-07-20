#!/usr/bin/env node
'use strict';

const { createServer } = require('../src/server');
const { loadOrCreateToken, TOKEN_FILE } = require('../src/token-store');
const pkg = require('../package.json');

const DEFAULT_PORT = 7717;
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'https://api-sandbox.ashwinsathian.com',
];

function parseArgs(argv) {
  const args = { allowOrigin: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--port':
        args.port = Number(argv[(i += 1)]);
        break;
      case '--token':
        args.token = argv[(i += 1)];
        break;
      case '--rotate-token':
        args.rotateToken = true;
        break;
      case '--allow-origin':
        args.allowOrigin.push(argv[(i += 1)]);
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        console.error(`Unknown argument: ${arg}\n`);
        args.help = true;
        args.exitCode = 1;
    }
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

  const port = Number.isFinite(args.port) && args.port > 0 ? args.port : DEFAULT_PORT;
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

main();
