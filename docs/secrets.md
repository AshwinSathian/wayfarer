# Secrets At Rest

Secrets in Wayfarer never leave the browser. Sensitive values are wrapped in an authenticated envelope before they are persisted to IndexedDB.

## Envelope Format

Each secret row stores `{ meta, name, environmentId?, envelope }` where `envelope` is:

```ts
interface SecretEnvelope {
  v: 1;                // schema version
  alg: "AES-GCM";      // authenticated cipher
  salt: string;        // base64url PBKDF2 salt (16 bytes)
  iv: string;          // base64url AES-GCM IV (12 bytes)
  ct: string;          // base64url ciphertext
}
```

All envelope fields use base64url so they stay filename/JSON friendly.

## Key Derivation + Cipher

* **KDF:** PBKDF2 with SHA‑256, 200,000 iterations, 16‑byte salt.
* **Cipher:** AES‑GCM with 256‑bit keys and a random 12‑byte IV per encryption.
* **Plaintext:** Never stored alongside the envelope; the IndexedDB row contains metadata + ciphertext only.

## Locker Model

`SecretCryptoService` keeps the derived passphrase key in memory only:

1. Unlocking imports the passphrase through WebCrypto and holds the base key in RAM.
2. Encrypt/decrypt helpers derive per‑secret keys using the stored base key and the envelope's salt.
3. Locking drops the in‑memory key.
4. A `beforeunload` listener automatically locks when the tab refreshes or closes.

Because there is no persisted verifier, the UI attempts to decrypt a stored envelope to validate the passphrase and surfaces a gentle error when it fails.

## Passphrase Rotation

To rotate secrets:

1. **Unlock** with the current passphrase.
2. **Reveal** or export the environment variables that contain `{{$secret.*}}` placeholders.
3. **Lock**, then **unlock** with the new passphrase.
4. **Re‑encrypt** each sensitive value (Protect Variable → new ciphertext).
5. Optionally delete stale secrets via the IndexedDB `secrets` store (future UI).

At no point does the app send secrets to a backend—everything stays local to the browser profile.
