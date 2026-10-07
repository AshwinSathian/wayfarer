/**
 * Trusted Types default policy (P1.9). The CSP sets
 * `require-trusted-types-for 'script'`, so every string that reaches a DOM
 * script sink needs a policy's approval. Angular and Monaco create their own
 * named policies; this default policy covers the one remaining kind of
 * sink: script URLs (Worker, SharedWorker, ServiceWorker registration) on
 * this origin, which are the bundled Monaco, JSON and sandbox workers and
 * /sw.js. Everything else returns null, so the browser blocks it. There is
 * no createHTML and no createScript: no string becomes markup or code.
 */

// TypeScript's DOM lib has no Trusted Types declarations yet.
interface TrustedTypePolicyOptions {
  createScriptURL?: (input: string) => string | null;
}
interface TrustedTypesGlobal {
  trustedTypes?: { createPolicy(name: string, options: TrustedTypePolicyOptions): unknown };
}

export function allowScriptUrl(input: string, origin: string): string | null {
  const url = URL.parse(input, origin);
  return url && url.origin === origin && (url.protocol === "https:" || url.protocol === "http:") ? url.href : null;
}

export function installTrustedTypesPolicy(): void {
  const factory = (globalThis as TrustedTypesGlobal).trustedTypes;
  if (!factory) return; // Browser without Trusted Types: the CSP directive is ignored too.
  const origin = globalThis.location.origin;
  factory.createPolicy("default", {
    createScriptURL: (input) => allowScriptUrl(input, origin),
  });
}
