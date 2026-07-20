'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const CONFIG_DIR = path.join(os.homedir(), '.wayfarer-local-bridge');
const TOKEN_FILE = path.join(CONFIG_DIR, 'token');

function generateToken() {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * Reuses the same token across restarts (so the user doesn't have to
 * re-paste it into Wayfarer's settings every time) unless `rotate` is set
 * or no token has been persisted yet. Stored 0600 in the user's home
 * directory, outside the repo, so it's never accidentally committed.
 */
function loadOrCreateToken({ rotate = false } = {}) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  } catch {
    // best-effort — an unwritable home directory just means no persistence
  }

  if (!rotate) {
    try {
      const existing = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
      if (existing) {
        return existing;
      }
    } catch {
      // no token persisted yet
    }
  }

  const token = generateToken();
  try {
    fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  } catch {
    // could not persist (read-only fs, etc.) — still usable for this run
  }
  return token;
}

module.exports = { loadOrCreateToken, generateToken, TOKEN_FILE, CONFIG_DIR };
