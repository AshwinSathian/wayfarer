/**
 * Trusted Types default policy (P1.9). The CSP sets
 * `require-trusted-types-for 'script'`, so every string that reaches a DOM
 * script sink needs a policy's approval. Angular and Monaco create their own
 * named policies; this default policy covers the one remaining kind of
 * sink: script URLs (Worker, SharedWorker, ServiceWorker registration) on
 * this origin, which are the bundled Monaco, JSON and sandbox workers and
 * the app's sw.js. Everything else returns null, so the browser blocks it. There is
 * no createHTML and no createScript: no string becomes markup or code.
 */

// TypeScript's DOM lib has no Trusted Types declarations yet.
interface TrustedTypePolicyOptions {
  createScriptURL?: (input: string) => string | null;
}
interface TrustedTypesGlobal {
  trustedTypes?: { createPolicy(name: string, options: TrustedTypePolicyOptions): unknown };
}

/** `input` read against `base` (the page's base URL), if it is on the base's origin. */
export function allowScriptUrl(input: string, base: string): string | null {
  const url = URL.parse(input, base);
  return url && url.origin === new URL(base).origin && (url.protocol === "https:" || url.protocol === "http:")
    ? url.href
    : null;
}

export function installTrustedTypesPolicy(): void {
  const factory = (globalThis as TrustedTypesGlobal).trustedTypes;
  if (!factory) return; // Browser without Trusted Types: the CSP directive is ignored too.
  factory.createPolicy("default", {
    createScriptURL: (input) => allowScriptUrl(input, document.baseURI),
  });
}
