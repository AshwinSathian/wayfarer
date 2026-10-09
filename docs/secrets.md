# Secrets vault

The vault keeps values you mark as secret (an API key, a token, a password) encrypted in this browser's IndexedDB. It never leaves the browser: the app has no backend.

## Keys

| Key | What it is | Where it lives |
|---|---|---|
| Data key | A random AES-GCM-256 key, made when you choose the passphrase. It encrypts every secret. | Stored only wrapped (encrypted) under the passphrase key. Unwrapped, it is in the memory of an unlocked tab, as a key WebCrypto will not export. |
| Passphrase key | Derived from your passphrase with PBKDF2-SHA-256, 600,000 iterations (OWASP's 2023 minimum) and a random 16-byte salt. It wraps the data key with AES-GCM. | Nowhere. It is derived when you unlock, used once, and dropped. |

The passphrase is used exactly as you type it: a space at the end is part of it.

## What is stored

The vault record, in the `meta` store under the key `vault`:

```ts
interface VaultRecord {
  v: 2;
  kdf: { alg: "PBKDF2-SHA256"; iterations: 600000; salt: string }; // 16-byte salt
  wrappedDek: string; // a 12-byte IV, then the data key encrypted under the passphrase key
}
```

Each secret, in the `secrets` store, as `{ meta, id, name, environmentId?, envelope }`:

```ts
interface SecretEnvelope {
  v: 2;
  iv: string; // a random 12-byte IV for this secret
  ct: string; // the value, encrypted under the data key
}
```

The secret's id is authenticated with its ciphertext (AES-GCM additional data): a ciphertext copied onto another secret's row does not decrypt. Binary fields are base64url. The plaintext is not stored anywhere.

## Unlocking and locking

- **Unlock** derives the passphrase key and unwraps the data key. A wrong passphrase fails to unwrap, and that is the check: it works the same when the vault holds no secret yet.
- **Lock** drops the data key. A lock in one tab locks every open tab of the app.
- **A reload or closing the tab** drops it too: nothing that can open a secret is stored.
- **Idle lock.** A tab locks itself after 15 minutes without a key press or a click. Settings, "Lock the vault when idle", takes 1 to 240 minutes; 0 never locks. Idleness is counted per tab, so a tab left in the background locks itself and not the one you are working in.

Unlocking costs one key derivation, a fraction of a second. Reading or writing a secret after that costs none.

## Changing the passphrase

Secrets, "Change passphrase", asks for the current passphrase and the new one. The data key is wrapped again under the new passphrase and stored; no secret is rewritten. The old passphrase no longer opens the vault. Tabs that are unlocked stay unlocked, since the data key is the same.

Changing the passphrase does not help once someone has both a copy of the vault from before and the old passphrase: that copy still opens with it.

## Vault file

Secrets, "Export vault", writes `wayfarer-vault.json` after you enter the passphrase:

```jsonc
{
  "$id": "wayfarer/vault/2",
  "vault": { "v": 2, "kdf": { "alg": "PBKDF2-SHA256", "iterations": 600000, "salt": "…" }, "wrappedDek": "…" },
  "secrets": [{ "id": "…", "name": "API_TOKEN", "environmentId": "…", "envelope": { "v": 2, "iv": "…", "ct": "…" } }]
}
```

The file holds ciphertext and names only. It opens with the passphrase the vault had when the file was written; a later change of passphrase does not change old files.

"Import vault" needs this vault unlocked. It asks for the file's passphrase, decrypts the file's secrets in memory and stores them encrypted under this vault's data key. A secret keeps its id, so an environment variable that refers to it finds it; a stored secret with the same id is replaced. A file that is not a vault file, is over 10 MB, was written with another passphrase, or holds a secret that does not decrypt is refused whole: nothing is imported.

## Using a secret in a request

A protected variable holds `{{$secret.<id>}}`. When a request that uses it is sent:

1. **Vault unlocked:** the secret is decrypted in memory and placed into the request. It reaches the server as its plaintext.
2. **Vault locked:** the unlock dialog opens. With the passphrase, the request is sent. Closing the dialog sends nothing.
3. **The vault does not have that secret** (it was deleted, or the environment came from another browser without its vault file): the reference is all there is, and the request is refused. A `{{$secret.…}}` reference is never sent, also not by "Send anyway".

The plaintext then exists in three places only: the vault (encrypted), this tab's memory, and the request on the wire. Everything that is stored, exported or copied goes through the redactor first:

| Where | What happens |
|---|---|
| History: the request as sent, the response, the request as composed | The secret is masked as `***`, also where the server sent it back |
| Export → Copy as cURL, Copy as HAR | Masked, also in the "with credentials" variants |
| Copy as cURL in the composer | The secret is not read at all: its reference stays as written |
| Collection export | Holds the reference, never the value |

The redactor does not track where a value came from. It looks for every secret of the request in the output: as text, percent-encoded (as a component, as a form field, and as a browser writes it into a URL), JSON-escaped, and inside base64 at each of the three positions a value can start in. `btoa("user:" + secret)` does not contain `btoa(secret)`, which is why the positions matter.

## Short secrets

A value shorter than 6 characters is stored encrypted like any other, and the editor warns when you protect one: text that short cannot be found and masked where a server sends it back.

## Known limitations

- **A secret typed outside the vault is not a secret.** Only a value protected in the Environments editor is in the vault. A token typed into a header or the Auth tab is plain text in the saved request.
- **Masking finds the encodings it knows.** A secret is looked for as text, percent-encoded, JSON-escaped and inside base64. A server that sends it back hashed, reversed or in an encoding of its own is not recognised.
- **A forgotten passphrase is unrecoverable.** There is no escrow; the only way out is Reset all data.
- **PBKDF2 is not memory-hard.** A weak passphrase can be guessed offline by someone who has the vault record. Choose a long one.
- **Secrets saved before version 2.0 are not carried over.** They were encrypted one key per secret; the upgrade removes them and says so.
