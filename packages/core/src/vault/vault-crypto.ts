import type { ValidationIssue } from "../model/validate";

/**
 * The vault's cryptography (plan D8), with no state and no storage.
 *
 * A random AES-GCM-256 data key (DEK) encrypts every secret. A key derived
 * from the passphrase (KEK) wraps the DEK, and only the wrapped DEK is
 * stored. Changing the passphrase wraps the same DEK again, so no secret is
 * touched. A wrong passphrase fails to unwrap: that is the check, also for
 * a vault with no secret in it.
 */

// OWASP's 2023 minimum for PBKDF2-HMAC-SHA256.
export const KDF_ITERATIONS = 600_000;
/** A file may ask for more work than the app's own vault, up to this: beyond it the page would hang. */
const MAX_KDF_ITERATIONS = 10_000_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const AES = { name: "AES-GCM", length: 256 } as const;

/** A WebCrypto key. Named through `importKey`, which the Node types and the DOM types both have: core compiles without the DOM's `CryptoKey`. */
export type VaultKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

export const VAULT_FILE_FORMAT = "wayfarer/vault/2";

/** How the passphrase key is derived, and the data key wrapped under it. Stored as the `vault` record of `meta`. */
export interface VaultRecord {
  v: 2;
  kdf: { alg: "PBKDF2-SHA256"; iterations: number; salt: string };
  /** base64url of the 12-byte IV followed by the wrapped key. */
  wrappedDek: string;
}

/** One secret, encrypted under the data key with the secret's id as additional authenticated data. */
export interface SecretEnvelope {
  v: 2;
  iv: string;
  ct: string;
}

/** A vault as a file: the record and every secret, still encrypted. Opened with the passphrase the vault had when it was written. */
export interface VaultFile {
  $id: typeof VAULT_FILE_FORMAT;
  vault: VaultRecord;
  secrets: { id: string; name: string; environmentId?: string; envelope: SecretEnvelope }[];
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

/** The key that wraps the data key: PBKDF2-SHA-256 over the passphrase exactly as typed. */
async function deriveKek(passphrase: string, kdf: VaultRecord["kdf"]): Promise<VaultKey> {
  // crypto.subtle only exists in a secure context (https or localhost).
  if (!crypto.subtle) {
    throw new Error("The vault needs a secure page: open Wayfarer over https or on localhost.");
  }
  const material = await crypto.subtle.importKey("raw", utf8(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromBase64Url(kdf.salt), iterations: kdf.iterations, hash: "SHA-256" },
    material,
    AES,
    false,
    ["wrapKey", "unwrapKey"]
  );
}

async function wrap(dek: VaultKey, passphrase: string): Promise<VaultRecord> {
  const kdf: VaultRecord["kdf"] = { alg: "PBKDF2-SHA256", iterations: KDF_ITERATIONS, salt: toBase64Url(randomBytes(SALT_BYTES)) };
  const iv = randomBytes(IV_BYTES);
  const wrapped = new Uint8Array(await crypto.subtle.wrapKey("raw", dek, await deriveKek(passphrase, kdf), { name: "AES-GCM", iv }));
  return { v: 2, kdf, wrappedDek: toBase64Url(new Uint8Array([...iv, ...wrapped])) };
}

/** The data key, or `null` when the passphrase is not the vault's. */
async function unwrap(record: VaultRecord, passphrase: string, extractable: boolean): Promise<VaultKey | null> {
  const bytes = fromBase64Url(record.wrappedDek);
  const kek = await deriveKek(passphrase, record.kdf);
  try {
    return await crypto.subtle.unwrapKey(
      "raw",
      bytes.slice(IV_BYTES),
      kek,
      { name: "AES-GCM", iv: bytes.slice(0, IV_BYTES) },
      AES,
      extractable,
      ["encrypt", "decrypt"]
    );
  } catch (error) {
    // AES-GCM authentication failed: the passphrase is wrong. Anything else is a real error.
    if (error instanceof Error && error.name === "OperationError") return null;
    throw error;
  }
}

/** A new vault: a random data key wrapped under `passphrase`, and that key as an unlocked session holds it. */
export async function createVault(passphrase: string): Promise<{ record: VaultRecord; dek: VaultKey }> {
  if (!crypto.subtle) {
    throw new Error("The vault needs a secure page: open Wayfarer over https or on localhost.");
  }
  // Extractable only here, to be wrapped; the key that is kept is not.
  const fresh = await crypto.subtle.generateKey(AES, true, ["encrypt", "decrypt"]);
  const record = await wrap(fresh, passphrase);
  const dek = await unwrap(record, passphrase, false);
  if (!dek) throw new Error("The new vault could not be opened with its own passphrase.");
  return { record, dek };
}

/** The data key as a key that cannot be exported, or `null` when the passphrase is wrong. */
export function unwrapDek(record: VaultRecord, passphrase: string): Promise<VaultKey | null> {
  return unwrap(record, passphrase, false);
}

/** The same data key wrapped under `next`, or `null` when `current` is wrong. No secret changes. */
export async function rewrapDek(record: VaultRecord, current: string, next: string): Promise<VaultRecord | null> {
  const dek = await unwrap(record, current, true);
  return dek ? wrap(dek, next) : null;
}

export async function encryptSecret(dek: VaultKey, id: string, plaintext: string): Promise<SecretEnvelope> {
  const iv = randomBytes(IV_BYTES);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: utf8(id) }, dek, utf8(plaintext));
  return { v: 2, iv: toBase64Url(iv), ct: toBase64Url(new Uint8Array(ct)) };
}

/** Rejects when the envelope was not written for this id under this key. */
export async function decryptSecret(dek: VaultKey, id: string, envelope: SecretEnvelope): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(envelope.iv), additionalData: utf8(id) },
    dek,
    fromBase64Url(envelope.ct)
  );
  return new TextDecoder().decode(plain);
}

type Fields = Record<string, unknown>;

/** An own field of an object, or `undefined`: a file's "constructor" key must not read `Object.prototype`. */
function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && Object.hasOwn(value, key) ? (value as Fields)[key] : undefined;
}

const isBase64Url = (value: unknown): boolean => typeof value === "string" && /^[\w-]+$/.test(value);

/** Checks a vault file against what the app writes. A file is untrusted. */
export function validateVaultFile(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fail = (path: string, message: string) => issues.push({ path, message });
  if (typeof value !== "object" || value === null) {
    fail("$", "Value must be an object.");
    return issues;
  }
  if (field(value, "$id") !== VAULT_FILE_FORMAT) {
    fail("$id", `Not a Wayfarer vault file: "$id" must be "${VAULT_FILE_FORMAT}".`);
    return issues;
  }

  const vault = field(value, "vault");
  if (typeof vault !== "object" || vault === null) {
    fail("vault", "Value must be an object.");
  } else {
    if (field(vault, "v") !== 2) fail("vault.v", "Value must be 2.");
    const kdf = field(vault, "kdf");
    if (typeof kdf !== "object" || kdf === null) {
      fail("vault.kdf", "Value must be an object.");
    } else {
      if (field(kdf, "alg") !== "PBKDF2-SHA256") fail("vault.kdf.alg", 'Value must be "PBKDF2-SHA256".');
      const iterations = field(kdf, "iterations");
      if (!(Number.isInteger(iterations) && (iterations as number) >= KDF_ITERATIONS && (iterations as number) <= MAX_KDF_ITERATIONS)) {
        fail("vault.kdf.iterations", `Value must be a whole number from ${KDF_ITERATIONS} to ${MAX_KDF_ITERATIONS}.`);
      }
      if (!isBase64Url(field(kdf, "salt"))) fail("vault.kdf.salt", "Value must be base64url text.");
    }
    if (!isBase64Url(field(vault, "wrappedDek"))) fail("vault.wrappedDek", "Value must be base64url text.");
  }

  const secrets = field(value, "secrets");
  if (!Array.isArray(secrets)) {
    fail("secrets", "Value must be an array.");
    return issues;
  }
  secrets.forEach((secret: unknown, index) => {
    const path = `secrets[${index}]`;
    if (typeof secret !== "object" || secret === null) {
      fail(path, "Value must be an object.");
      return;
    }
    const id = field(secret, "id");
    if (typeof id !== "string" || !id) fail(`${path}.id`, "Value must be a non-empty string.");
    if (typeof field(secret, "name") !== "string") fail(`${path}.name`, "Value must be a string.");
    const environmentId = field(secret, "environmentId");
    if (environmentId !== undefined && typeof environmentId !== "string") fail(`${path}.environmentId`, "Value must be a string.");
    const envelope = field(secret, "envelope");
    if (typeof envelope !== "object" || envelope === null) {
      fail(`${path}.envelope`, "Value must be an object.");
      return;
    }
    if (field(envelope, "v") !== 2) fail(`${path}.envelope.v`, "Value must be 2.");
    if (!isBase64Url(field(envelope, "iv"))) fail(`${path}.envelope.iv`, "Value must be base64url text.");
    if (!isBase64Url(field(envelope, "ct"))) fail(`${path}.envelope.ct`, "Value must be base64url text.");
  });
  return issues;
}
