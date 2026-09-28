/**
 * Trusted Types default policy (P1.9). The CSP sets
 * `require-trusted-types-for 'script'`, so every string that reaches a DOM
 * script sink needs a policy's approval. Angular and Monaco create their own
 * named policies; this default policy covers the remaining sinks, and only
 * these:
 * - script URLs (Worker, SharedWorker, ServiceWorker registration) on this
 *   origin: the bundled Monaco, JSON and sandbox workers and /sw.js;
 * - the empty string as HTML: PrimeNG's Tooltip clears itself with
 *   `innerHTML = ""` before appending text.
 * Everything else returns null, so the browser blocks it. There is no
 * createScript: string-to-code stays impossible.
 */

// TypeScript's DOM lib has no Trusted Types declarations yet.
interface TrustedTypePolicyOptions {
  createHTML?: (input: string) => string | null;
  createScriptURL?: (input: string) => string | null;
}
interface TrustedTypesGlobal {
  trustedTypes?: { createPolicy(name: string, options: TrustedTypePolicyOptions): unknown };
}

export function allowScriptUrl(input: string, origin: string): string | null {
  const url = URL.parse(input, origin);
  return url && url.origin === origin && (url.protocol === "https:" || url.protocol === "http:") ? url.href : null;
}

export function allowHtml(input: string): string | null {
  return input === "" ? "" : null;
}

export function installTrustedTypesPolicy(): void {
  const factory = (globalThis as TrustedTypesGlobal).trustedTypes;
  if (!factory) return; // Browser without Trusted Types: the CSP directive is ignored too.
  const origin = globalThis.location.origin;
  factory.createPolicy("default", {
    createScriptURL: (input) => allowScriptUrl(input, origin),
    createHTML: allowHtml,
  });
}
