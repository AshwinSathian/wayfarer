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

Because there is no persisted verifier, the UI validates a passphrase by decrypting one stored envelope. With no secrets stored, there is nothing to check against, so any passphrase "unlocks" ([#66](https://github.com/AshwinSathian/wayfarer/issues/66)).

## Known limitations

- **Secrets can't be used in requests yet.** A protected variable holds a `{{$secret.<id>}}` placeholder, and the request resolver doesn't decrypt it. Since v1.1.0, a request that still contains such a placeholder is blocked with an inline error instead of being sent with the placeholder ([#60](https://github.com/AshwinSathian/wayfarer/issues/60)).
- **No passphrase rotation.** Each secret is encrypted under a key derived from the passphrase that was unlocked when it was saved, and there is no way to re-encrypt existing secrets under a new passphrase ([#66](https://github.com/AshwinSathian/wayfarer/issues/66)). The vault v2 design (a data key wrapped by the passphrase key) fixes this.
- **A forgotten passphrase is unrecoverable.** There is no escrow; the only way out is to delete the secrets.

Secrets never leave the browser: the app has no backend, and today it can't even put them in a request.
