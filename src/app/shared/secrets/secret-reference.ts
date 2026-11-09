/**
 * Every vault secret a value refers to, once each, also a reference inside
 * other text: what an export in plain text replaces (`exportedValue`) and
 * what the Secrets view lists as a use. Whether a value is protected (one
 * reference and nothing else) is core's `protectedSecretId`.
 */
export function secretIdsIn(value: string | undefined): string[] {
  return [...new Set([...(value ?? "").matchAll(/\{\{\s*\$secret\.([a-z0-9-]+)\s*\}\}/gi)].map((match) => match[1]))];
}
