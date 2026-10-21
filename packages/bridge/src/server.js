"use strict";

const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");
const tls = require("node:tls");
const zlib = require("node:zlib");
const { URL } = require("node:url");
const pkg = require("../package.json");

// 25 MB: for the request as it arrives here (its body is base64 inside JSON, so some 18 MB of bytes) and for the
// target's response, as received and as decoded. Generous for API testing, not "proxy anything".
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const RELAY_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 10 * 60_000;
// What Node can decode, and so what is asked for when the request names nothing.
const ACCEPT_ENCODING = "gzip, deflate, br";

// Headers we never forward as-is: connection-management headers Node sets
// itself for the outgoing request, plus content-length (recomputed from the
// actual body we're about to send). Host is not among them: a Host of the
// user's is sent as written, and without one Node writes the address's.
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
]);

function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(String(a ?? ""), "utf8");
  const bufB = Buffer.from(String(b ?? ""), "utf8");
  if (bufA.length !== bufB.length) {
    // Compare a buffer against itself so the failure path still costs a
    // comparable amount of time regardless of the length mismatch, rather
    // than short-circuiting on length alone.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function isLoopbackHost(host) {
  return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(String(host ?? ""));
}

function sendJson(res, status, payload, extraHeaders = {}) {
  if (res.headersSent) {
    return;
  }
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

/** A pairing code as the user may type it: case and the dash do not matter. */
const normalCode = (code) => String(code).toUpperCase().replace(/[\s-]/g, "");

// After this many wrong codes in a row, pairing takes no code for PAIRING_LOCK_MS: eight characters of 31 cannot be
// guessed three at a time a minute.
const PAIRING_TRIES = 3;
const PAIRING_LOCK_MS = 60_000;

/**
 * The one-time exchange of the code printed in the terminal for the token (P6.2). The code works once; a wrong one
 * counts, and the third in a row locks pairing for a minute, the right code included.
 */
function pairingFor(code, token, clock) {
  let remaining = code === undefined ? undefined : normalCode(code);
  let wrong = 0;
  let lockedUntil = 0;
  return (payload) => {
    if (
      payload === null ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      Object.keys(payload).length !== 1 ||
      typeof payload.code !== "string" ||
      payload.code.length > 32
    ) {
      return { status: 400, body: { error: 'the request must be { "code": "…" }' } };
    }
    const now = clock();
    if (now < lockedUntil) {
      return {
        status: 429,
        body: { error: "too many wrong codes: wait" },
        headers: { "Retry-After": String(Math.ceil((lockedUntil - now) / 1000)) },
      };
    }
    if (remaining === undefined)
      return {
        status: 410,
        body: { error: "this bridge has no pairing code: it was used, or the bridge was started without one" },
      };
    if (!timingSafeEqualStrings(normalCode(payload.code), remaining)) {
      wrong += 1;
      if (wrong >= PAIRING_TRIES) {
        wrong = 0;
        lockedUntil = now + PAIRING_LOCK_MS;
      }
      return { status: 401, body: { error: "wrong pairing code" } };
    }
    remaining = undefined;
    return { status: 200, body: { token } };
  };
}

function setCorsHeaders(res, origin) {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Wayfarer-Bridge-Token");
  res.setHeader("Access-Control-Max-Age", "600");
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(Object.assign(new Error("request body too large"), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Node's flat `rawHeaders` (name, value, name, value) as pairs: two Set-Cookie headers stay two. */
function pairHeaders(rawHeaders) {
  const out = [];
  for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
    out.push([rawHeaders[i], rawHeaders[i + 1]]);
  }
  return out;
}

/**
 * The request's headers as Node takes them, without the ones Node writes
 * itself. A name that repeats keeps every value. Built with no prototype:
 * a header may be named `__proto__`.
 */
function sanitizeOutgoingHeaders(headers) {
  const out = Object.create(null);
  for (const [name, value] of headers) {
    if (HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      continue;
    }
    (out[name] ??= []).push(value);
  }
  // Node takes a Host as one text, not as a list of one.
  for (const name of Object.keys(out)) {
    if (name.toLowerCase() === "host") out[name] = out[name][0];
  }
  return { ...out };
}

/**
 * What a relay request asks for, or the reason it is refused. Every field
 * is checked: a field of the wrong type, or one the bridge does not read,
 * is an error and never a default.
 */
function readPayload(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { error: "the request must be a JSON object" };
  }
  const known = new Set(["method", "url", "headers", "bodyB64", "timeoutMs", "tls"]);
  const unknown = Object.keys(payload).find((key) => !known.has(key));
  if (unknown !== undefined) {
    return { error: `unknown field: ${unknown}` };
  }
  const { method, url, headers, bodyB64, timeoutMs, tls: tlsField } = payload;
  // Exactly { insecure: true }, or absent: verification is never switched off by a value that only looks like yes.
  if (
    tlsField !== undefined &&
    !(
      tlsField !== null &&
      typeof tlsField === "object" &&
      !Array.isArray(tlsField) &&
      Object.keys(tlsField).length === 1 &&
      tlsField.insecure === true
    )
  ) {
    return { error: 'tls must be { "insecure": true }' };
  }
  if (typeof method !== "string" || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,32}$/.test(method)) {
    return { error: "method must be an HTTP method" };
  }
  if (
    !Array.isArray(headers) ||
    !headers.every(
      (pair) => Array.isArray(pair) && pair.length === 2 && typeof pair[0] === "string" && typeof pair[1] === "string",
    )
  ) {
    return { error: "headers must be a list of [name, value] pairs of text" };
  }
  if (
    bodyB64 !== undefined &&
    (typeof bodyB64 !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(bodyB64))
  ) {
    return { error: "bodyB64 must be base64 text" };
  }
  if (timeoutMs !== undefined && !(Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= MAX_TIMEOUT_MS)) {
    return { error: `timeoutMs must be a whole number from 1 to ${MAX_TIMEOUT_MS}` };
  }
  if (headers.filter(([name]) => name.toLowerCase() === "host").length > 1) {
    return { error: "a request has one Host header at most" };
  }
  let target;
  try {
    target = new URL(String(url ?? ""));
  } catch {
    return { error: "invalid or missing target url" };
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return { error: `unsupported protocol: ${target.protocol}` };
  }
  return {
    method: method.toUpperCase(),
    target,
    headers,
    body: bodyB64 === undefined ? undefined : Buffer.from(bodyB64, "base64"),
    timeoutMs: timeoutMs ?? RELAY_TIMEOUT_MS,
    insecure: tlsField !== undefined,
  };
}

/** The authorities a certificate may be signed by: Node's own and the user's (`--ca`). Given alone, the user's would replace them. */
function tlsOptions(ca) {
  return ca === undefined ? {} : { ca: [...tls.rootCertificates, ca] };
}

/**
 * The agents every relay goes out through. Not Node's global ones: these keep no connection for the next request, so
 * each relay makes its own and its making can be timed; and they read the proxy variables (HTTP_PROXY, HTTPS_PROXY,
 * NO_PROXY, in either case) from the environment the bridge was started in, which is Node's own support for them.
 */
function agentsFor(env) {
  const names = ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"];
  const proxyEnv = Object.fromEntries(
    names.filter((name) => typeof env[name] === "string" && env[name] !== "").map((name) => [name, env[name]]),
  );
  const options = Object.keys(proxyEnv).length ? { proxyEnv } : {};
  return { "http:": new http.Agent(options), "https:": new https.Agent(options) };
}

const elapsed = (from, to) => Math.round((to - from) * 10) / 10;

/** The stream that undoes a response's Content-Encoding, or undefined when there is nothing to undo. Null: an encoding Node cannot decode. */
function decoderFor(encoding) {
  const name = String(encoding ?? "")
    .trim()
    .toLowerCase();
  if (name === "" || name === "identity") return undefined;
  if (name === "gzip" || name === "x-gzip") return zlib.createGunzip();
  // Some servers send raw deflate under this name; a browser reads both.
  if (name === "deflate") return zlib.createInflate();
  if (name === "br") return zlib.createBrotliDecompress();
  return null;
}

/** Forwards one relay request to its target and writes the wrapped envelope to `res`. */
function relay(payload, res, { agents, ca }) {
  const request = readPayload(payload);
  if (request.error) {
    sendJson(res, 400, { error: request.error });
    return;
  }
  const { method, target, body } = request;
  const outgoingHeaders = sanitizeOutgoingHeaders(request.headers);
  if (!request.headers.some(([name]) => name.toLowerCase() === "accept-encoding")) {
    outgoingHeaders["Accept-Encoding"] = ACCEPT_ENCODING;
  }
  if (body !== undefined) {
    outgoingHeaders["Content-Length"] = String(body.length);
  }
  const lib = target.protocol === "https:" ? https : http;
  let decoder;
  // One way out for every failure, whenever it comes: the target's response may have ended before its body is
  // found to be too large or not what its header says, and a request that has ended emits no error when destroyed.
  const abort = (status, message, code) => {
    clearTimeout(deadline);
    sendJson(res, status, { error: { message, code } });
    decoder?.destroy();
    outgoing.destroy();
  };

  // When each part of the exchange was over (README.md, "Protocol"): a part that did not happen has no time.
  const at = { start: performance.now() };
  const requestOptions = {
    method,
    headers: outgoingHeaders,
    agent: agents[target.protocol],
    ...tlsOptions(ca),
    ...(request.insecure && { rejectUnauthorized: false }),
  };
  const outgoing = lib.request(target, requestOptions, (upstreamRes) => {
    at.firstByte = performance.now();
    decoder = decoderFor(upstreamRes.headers["content-encoding"]);
    if (decoder === null) {
      abort(
        502,
        `the response's Content-Encoding (${upstreamRes.headers["content-encoding"]}) is not one the bridge can decode`,
        "RELAY_DECODE_ERROR",
      );
      return;
    }
    // Both counts are capped: what arrives, and what it decodes to. A small compressed body can decode to any size.
    const tooLarge = () => abort(502, "response body too large", "RELAY_RESPONSE_TOO_LARGE");
    let encodedSize = 0;
    upstreamRes.on("data", (chunk) => {
      encodedSize += chunk.length;
      if (encodedSize > MAX_BODY_BYTES) tooLarge();
      else decoder?.write(chunk);
    });
    // Not piped: a response with no body (HEAD, 204, 304) may name an encoding, and there is nothing to decode then.
    if (decoder) upstreamRes.on("end", () => (encodedSize > 0 ? decoder.end() : finish()));
    const decoded = decoder ?? upstreamRes;
    const chunks = [];
    let decodedSize = 0;
    decoded.on("data", (chunk) => {
      decodedSize += chunk.length;
      if (decodedSize > MAX_BODY_BYTES) {
        tooLarge();
        return;
      }
      chunks.push(chunk);
    });
    const finish = () => {
      clearTimeout(deadline);
      // After a failure this writes nothing: the answer has gone out.
      sendJson(res, 200, {
        status: upstreamRes.statusCode,
        statusText: upstreamRes.statusMessage ?? "",
        // As received, one entry each, Content-Encoding among them: the body below is decoded, and the two sizes say so.
        headers: pairHeaders(upstreamRes.rawHeaders),
        bodyB64: Buffer.concat(chunks).toString("base64"),
        encodedSize,
        decodedSize,
        timings: timingsOf(at, performance.now()),
      });
    };
    decoded.on("end", finish);
    upstreamRes.on("error", (err) => abort(502, err.message, err.code ?? "RELAY_READ_ERROR"));
    decoder?.on("error", (err) =>
      abort(502, `the response could not be decoded: ${err.message}`, "RELAY_DECODE_ERROR"),
    );
  });

  // One deadline for the whole exchange, as the page's own: a socket's idle timeout would start again with every byte.
  const deadline = setTimeout(() => abort(504, "relay request timed out", "RELAY_TIMEOUT"), request.timeoutMs);
  outgoing.on("error", (err) => abort(502, err.message, err.code ?? "RELAY_ERROR"));
  outgoing.on("socket", (socket) => {
    socket.once("lookup", () => (at.lookup = performance.now()));
    socket.once("connect", () => (at.connect = performance.now()));
    socket.once("secureConnect", () => (at.secure = performance.now()));
  });
  // The page went away (Cancel, or its own timeout): the target is not kept waiting.
  res.on("close", () => {
    if (!res.writableEnded) abort(502, "the page closed the connection", "RELAY_ABORTED");
  });

  outgoing.end(body);
}

/**
 * The phases as durations in milliseconds: the name's lookup, the TCP connection, the TLS handshake, the wait from a
 * ready connection to the response's first byte, and the rest of the response.
 */
function timingsOf(at, end) {
  const ready = at.secure ?? at.connect ?? at.start;
  return {
    ...(at.lookup !== undefined && { dns: elapsed(at.start, at.lookup) }),
    ...(at.connect !== undefined && { tcp: elapsed(at.lookup ?? at.start, at.connect) }),
    ...(at.secure !== undefined && { tls: elapsed(at.connect ?? at.start, at.secure) }),
    ttfb: elapsed(ready, at.firstByte),
    content: elapsed(at.firstByte, end),
  };
}

/**
 * Creates the bridge's HTTP server. Every request must both come from an
 * allowed Origin (checked first, so unknown pages get a generic 403 without
 * learning whether a token would even be checked) and carry the correct
 * bridge token — two independent gates, since either one alone is weaker:
 * Origin headers are browser-enforced but the token is what actually proves
 * the caller is a Wayfarer instance the operator configured, not just any
 * page that happens to be served from an allowed origin.
 */
function createServer({ token, allowedOrigins, ca, env = process.env, tls: certificate, pairing, clock = Date.now }) {
  if (!token) {
    throw new Error("createServer requires a token");
  }
  const outgoing = { agents: agentsFor(env), ca };
  const pair = pairingFor(pairing?.code, token, clock);
  const origins = allowedOrigins instanceof Set ? allowedOrigins : new Set(allowedOrigins ?? []);

  // With a certificate the bridge speaks HTTPS only (P6.2): Safari will not reach http://127.0.0.1 from an HTTPS page.
  const handler = (req, res) => {
    // A loopback name is the only Host a browser sends when it really means
    // this process. Anything else is a DNS-rebinding page whose hostname was
    // re-pointed at 127.0.0.1; refuse it before looking at anything else.
    if (!isLoopbackHost(req.headers.host)) {
      sendJson(res, 421, { error: "unexpected Host header" });
      return;
    }
    const origin = req.headers.origin;
    const originAllowed = typeof origin === "string" && origins.has(origin);

    if (req.method === "OPTIONS") {
      if (originAllowed) {
        setCorsHeaders(res, origin);
        // Private Network Access: a public page's preflight to a loopback address asks whether it may.
        if (req.headers["access-control-request-private-network"] === "true")
          res.setHeader("Access-Control-Allow-Private-Network", "true");
      }
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === "/health" && req.method === "GET") {
      if (originAllowed) {
        setCorsHeaders(res, origin);
      }
      sendJson(res, 200, { ok: true, name: "wayfarer-bridge", version: pkg.version });
      return;
    }

    if (req.url === "/pair" && req.method === "POST") {
      if (!originAllowed) {
        sendJson(res, 403, { error: `origin not allowed: ${origin ?? "(none sent)"}` });
        return;
      }
      setCorsHeaders(res, origin);
      readRequestBody(req)
        .then((raw) => {
          let payload;
          try {
            payload = JSON.parse(raw.toString("utf8"));
          } catch {
            payload = undefined;
          }
          const answer = pair(payload);
          sendJson(res, answer.status, answer.body, answer.headers);
        })
        .catch((err) => sendJson(res, err.statusCode ?? 400, { error: err.message }));
      return;
    }
    if (req.url !== "/relay" || req.method !== "POST") {
      sendJson(res, 404, { error: "not found" });
      return;
    }

    if (!originAllowed) {
      sendJson(res, 403, { error: `origin not allowed: ${origin ?? "(none sent)"}` });
      return;
    }
    setCorsHeaders(res, origin);

    if (!timingSafeEqualStrings(req.headers["x-wayfarer-bridge-token"], token)) {
      sendJson(res, 401, { error: "invalid or missing bridge token" });
      return;
    }

    readRequestBody(req)
      .then((raw) => {
        let payload;
        try {
          payload = raw.length ? JSON.parse(raw.toString("utf8")) : {};
        } catch {
          sendJson(res, 400, { error: "invalid JSON body" });
          return;
        }
        relay(payload, res, outgoing);
      })
      .catch((err) => {
        sendJson(res, err.statusCode ?? 400, { error: err.message });
      });
  };
  return certificate
    ? https.createServer({ cert: certificate.cert, key: certificate.key }, handler)
    : http.createServer(handler);
}

module.exports = {
  createServer,
  isLoopbackHost,
  sanitizeOutgoingHeaders,
  timingSafeEqualStrings,
  tlsOptions,
};
