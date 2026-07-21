import { SecretId } from "../../models/secrets.models";

/**
 * A protected environment variable's value is replaced with a literal
 * `{{$secret.<id>}}` reference string, pointing at the encrypted row in the
 * `secrets` IndexedDB store rather than holding plaintext. Shared here so
 * every UI surface that needs to recognize/build/parse that reference
 * (EnvironmentsManagerComponent's per-variable lock icon, the dedicated
 * Secrets management view) agrees on exactly one format.
 */
const SECRET_REFERENCE_PATTERN = /\{\{\s*\$secret\.([a-z0-9-]+)\s*\}\}/i;

export function isSecretReference(value: string | undefined): boolean {
  return typeof value === "string" && SECRET_REFERENCE_PATTERN.test(value);
}

export function extractSecretId(value: string | undefined): SecretId | null {
  if (!value) {
    return null;
  }
  const match = value.match(SECRET_REFERENCE_PATTERN);
  return match ? match[1] : null;
}

export function buildSecretReference(id: SecretId): string {
  return `{{$secret.${id}}}`;
}
