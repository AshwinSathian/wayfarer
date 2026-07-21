/**
 * A "protected" environment variable's value isn't the secret itself — it's
 * a `{{$secret.<id>}}` placeholder pointing at an entry in the encrypted
 * secrets vault (see `docs/secrets.md`). These two pure helpers are the
 * only place that placeholder format is parsed/recognized.
 */

const SECRET_PLACEHOLDER_PATTERN = /\{\{\s*\$secret\.([a-z0-9-]+)\s*\}\}/i;

export function isSecretValue(value: string | undefined): boolean {
  return typeof value === "string" && SECRET_PLACEHOLDER_PATTERN.test(value);
}

export function extractSecretId(value: string): string | null {
  const match = value.match(SECRET_PLACEHOLDER_PATTERN);
  return match ? match[1] : null;
}
