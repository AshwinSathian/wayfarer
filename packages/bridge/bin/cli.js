#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const { createServer } = require("../src/server");
const { loadOrCreateToken, TOKEN_FILE } = require("../src/token-store");
const pkg = require("../package.json");

const DEFAULT_PORT = 7717;
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:4200",
  "http://127.0.0.1:4200",
  "https://wayfarer.ashwinsathian.com",
];

const MIN_TOKEN_LENGTH = 16;
// No 0/O, 1/I/L: a code is read off a terminal and typed.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A one-time pairing code: eight characters, shown as two halves. */
function pairingCode() {
  const chars = Array.from({ length: 8 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** A PEM file's text when it holds `marker`; otherwise the reason it does not do. */
function readPem(file, marker, option) {
  try {
    const pem = fs.readFileSync(file, "utf8");
    return pem.includes(marker)
      ? { pem }
      : {
          problem: `${option} must name a PEM file with ${marker.replace(/-/g, "").trim().toLowerCase()}, and ${file} has none`,
        };
  } catch (err) {
    return { problem: `${option}: ${file} could not be read (${err.code ?? err.message})` };
  }
}

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
      if (next === undefined || next.startsWith("--")) fail(`${arg} needs a value`);
      return next;
    };
    switch (arg) {
      case "--port": {
        const port = Number(value());
        if (Number.isInteger(port) && port > 0 && port < 65536) args.port = port;
        else fail("--port must be a whole number from 1 to 65535");
        break;
      }
      case "--token":
        args.token = value();
        break;
      case "--rotate-token":
        args.rotateToken = true;
        break;
      case "--allow-origin": {
        const origin = value();
        // An Origin header is scheme://host[:port], nothing after it.
        if (origin && URL.canParse(origin) && new URL(origin).origin === origin) args.allowOrigin.push(origin);
        else fail(`--allow-origin must be an origin like https://example.com, got: ${origin}`);
        break;
      }
      case "--ca":
      case "--cert":
      case "--key": {
        const file = value();
        if (file === undefined) break;
        const read = readPem(file, arg === "--key" ? "PRIVATE KEY-----" : "-----BEGIN CERTIFICATE-----", arg);
        if (read.problem) fail(read.problem);
        else if (arg === "--ca") args.ca = read.pem;
        else (args.tls ??= {})[arg.slice(2)] = read.pem;
        break;
      }
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }
  if (args.tls && !(args.tls.cert && args.tls.key)) {
    fail("--cert and --key go together: the certificate and its private key");
  }
  if (args.token !== undefined && args.token.length < MIN_TOKEN_LENGTH) {
    fail(`The token must be at least ${MIN_TOKEN_LENGTH} characters`);
  }
  return args;
}

function printHelp() {
  console.log(`
wayfarer-bridge v${pkg.version}

An optional local relay that lets Wayfarer reach CORS-restrictive or
intranet-only APIs. Runs entirely on your own machine.

Usage:
  wayfarer-bridge [options]

Options:
  --port <n>            Port to listen on (default: ${DEFAULT_PORT})
  --token <value>        Use a fixed token instead of the persisted/generated one
                          (other users can read it in the process list; prefer the
                          WAYFARER_BRIDGE_TOKEN environment variable)
  --rotate-token          Generate and persist a fresh token, replacing the saved one
  --allow-origin <url>    Additional allowed Origin (repeatable). Defaults already
                          include localhost dev and the hosted Wayfarer app.
  --cert <file>           Serve HTTPS with this PEM certificate (with --key). Safari
                          reaches the bridge from the hosted app only over HTTPS;
                          make one with mkcert or openssl (README.md)
  --key <file>            The certificate's PEM private key
  --ca <file>             A file of PEM certificates to trust besides the public
                          authorities, for a server whose certificate your own
                          authority signed
  --help                  Show this help

HTTP_PROXY, HTTPS_PROXY and NO_PROXY (in either case) are honoured for the
requests the bridge sends.

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

  const code = pairingCode();
  const server = createServer({ token, allowedOrigins, ca: args.ca, tls: args.tls, pairing: { code } });
  const scheme = args.tls ? "https" : "http";

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use. Pass --port <n> to use a different one.`);
    } else {
      console.error("Failed to start wayfarer-bridge:", err.message);
    }
    process.exitCode = 1;
  });

  server.listen(port, "127.0.0.1", () => {
    console.log("");
    console.log(`  wayfarer-bridge v${pkg.version} — listening on ${scheme}://127.0.0.1:${port}`);
    console.log("");
    console.log(`  Pairing code: ${code}`);
    console.log("  (enter it in Wayfarer's Local Bridge settings and press Pair; it works once)");
    console.log("");
    console.log(`  Bridge token: ${token}`);
    console.log(`  (persisted at ${TOKEN_FILE} — reused across restarts unless you pass --rotate-token)`);
    console.log("");
    console.log("  Allowed origins:");
    for (const origin of allowedOrigins) {
      console.log(`    - ${origin}`);
    }
    console.log("");
    console.log("  Or paste the address and the token into Wayfarer's Local Bridge settings.");
    console.log("  Anyone with this token who can reach an allowed origin can make this process");
    console.log("  issue HTTP requests on your behalf — stop it (Ctrl+C) when you're done, and");
    console.log("  only add origins you trust with --allow-origin.");
    console.log("");
  });

  const shutdown = () => {
    console.log("\nShutting down wayfarer-bridge...");
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) main();

module.exports = { parseArgs, pairingCode };
