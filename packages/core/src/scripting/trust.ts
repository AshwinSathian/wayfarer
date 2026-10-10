/**
 * Whether a collection's scripts may run (plan D6). `trusted` says the
 * collection was made here or its scripts were reviewed here; `approved`
 * holds the SHA-256 of every script text that review, or a later edit in
 * this app, covered. A script runs only when its own digest is in the list,
 * so text that reached the collection any other way does not run.
 */
export interface ScriptTrust {
  trusted: boolean;
  /** Absent on a collection stored before P3.8: nothing is approved. */
  approved?: string[];
}

/** The SHA-256 of a script's text, in hex. */
export async function scriptDigest(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The scripts of a request that would run: the ones that are not blank. */
export function scriptsOf(request: { scripts: { pre: string; post: string } }): string[] {
  return [request.scripts.pre, request.scripts.post].filter((script) => script.trim());
}

/** True when every one of `scripts` is approved. No script needs no approval. */
export async function scriptsApproved(trust: ScriptTrust | undefined, scripts: string[]): Promise<boolean> {
  if (!scripts.length) return true;
  if (!trust?.trusted) return false;
  const approved = new Set(trust.approved ?? []);
  const digests = await Promise.all(scripts.map(scriptDigest));
  return digests.every((digest) => approved.has(digest));
}
