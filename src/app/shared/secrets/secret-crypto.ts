import { Injectable, signal } from "@angular/core";
import { SecretEnvelope } from "../../models/secrets";

interface DeriveOptions {
  iterations?: number;
  hash?: AlgorithmIdentifier;
}

// OWASP's 2023 minimum for PBKDF2-HMAC-SHA256.
const DEFAULT_ITERATIONS = 600_000;
const DEFAULT_HASH: AlgorithmIdentifier = "SHA-256";
const AES_KEY_LENGTH = 256;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

@Injectable({
  providedIn: "root",
})
export class SecretCrypto {
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();
  // A signal, so every view and effect that reads `isUnlocked` follows unlock and lock.
  private readonly sessionBaseKey = signal<CryptoKey | null>(null);

  async deriveKey(
    passphrase: string,
    salt: Uint8Array,
    options: DeriveOptions = {}
  ): Promise<CryptoKey> {
    const material = await this.importPassphrase(passphrase);
    return this.deriveFromMaterial(material, salt, options);
  }

  async encrypt(plaintext: string, passphrase: string): Promise<SecretEnvelope> {
    const salt = this.randomBytes(SALT_LENGTH);
    const key = await this.deriveKey(passphrase, salt);
    return this.encryptWithKey(plaintext, key, salt);
  }

  async decrypt(envelope: SecretEnvelope, passphrase: string): Promise<string> {
    const salt = this.fromBase64Url(envelope.salt);
    const iv = this.fromBase64Url(envelope.iv);
    const ciphertext = this.fromBase64Url(envelope.ct);
    const key = await this.deriveKey(passphrase, salt);
    return this.decryptWithKey(ciphertext, key, iv);
  }

  async unlock(passphrase: string): Promise<void> {
    this.sessionBaseKey.set(await this.importPassphrase(passphrase));
  }

  lock(): void {
    this.sessionBaseKey.set(null);
  }

  get isUnlocked(): boolean {
    return this.sessionBaseKey() !== null;
  }

  async encryptWithSession(plaintext: string): Promise<SecretEnvelope> {
    const salt = this.randomBytes(SALT_LENGTH);
    const key = await this.deriveFromMaterial(this.ensureSession(), salt);
    return this.encryptWithKey(plaintext, key, salt);
  }

  async decryptWithSession(envelope: SecretEnvelope): Promise<string> {
    const salt = this.fromBase64Url(envelope.salt);
    const iv = this.fromBase64Url(envelope.iv);
    const ciphertext = this.fromBase64Url(envelope.ct);
    const key = await this.deriveFromMaterial(this.ensureSession(), salt);
    return this.decryptWithKey(ciphertext, key, iv);
  }

  private async encryptWithKey(
    plaintext: string,
    key: CryptoKey,
    salt: Uint8Array
  ): Promise<SecretEnvelope> {
    const iv = this.randomBytes(IV_LENGTH);
    const data = this.encoder.encode(plaintext);
    const buffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: this.toBuffer(iv) },
      key,
      this.toBuffer(data)
    );
    return {
      v: 1,
      alg: "AES-GCM",
      salt: this.toBase64Url(salt),
      iv: this.toBase64Url(iv),
      ct: this.toBase64Url(new Uint8Array(buffer)),
    };
  }

  private async decryptWithKey(
    ciphertext: Uint8Array,
    key: CryptoKey,
    iv: Uint8Array
  ): Promise<string> {
    const buffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: this.toBuffer(iv) },
      key,
      this.toBuffer(ciphertext)
    );
    return this.decoder.decode(buffer);
  }

  private async importPassphrase(passphrase: string): Promise<CryptoKey> {
    if (typeof crypto === "undefined" || !crypto.subtle) {
      throw new Error("WebCrypto API is not available in this environment.");
    }
    return crypto.subtle.importKey(
      "raw",
      this.encoder.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
  }

  private async deriveFromMaterial(
    material: CryptoKey,
    salt: Uint8Array,
    options: DeriveOptions = {}
  ): Promise<CryptoKey> {
    const iterations = options.iterations ?? DEFAULT_ITERATIONS;
    const hash = options.hash ?? DEFAULT_HASH;
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: this.toBuffer(salt),
        iterations,
        hash,
      },
      material,
      {
        name: "AES-GCM",
        length: AES_KEY_LENGTH,
      },
      false,
      ["encrypt", "decrypt"]
    );
  }

  private randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  private toBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  private toBase64Url(bytes: Uint8Array): string {
    const binary = Array.from(bytes)
      .map((b) => String.fromCharCode(b))
      .join("");
    if (typeof btoa !== "function") {
      throw new Error("Base64 encoding is not supported in this environment.");
    }
    const base64 = btoa(binary);
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  private fromBase64Url(value: string): Uint8Array {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.length % 4 ? 4 - (normalized.length % 4) : 0;
    const padded = normalized + "=".repeat(pad);
    if (typeof atob !== "function") {
      throw new Error("Base64 decoding is not supported in this environment.");
    }
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private ensureSession(): CryptoKey {
    const key = this.sessionBaseKey();
    if (!key) {
      throw new Error("Secret store is locked.");
    }
    return key;
  }
}
