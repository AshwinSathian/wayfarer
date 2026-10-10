/** The modules a script may `require`, besides `atob` and `btoa`. Each is built by `scripts/build-vm-libs.mjs`. */
export const VM_LIBRARIES = ["chai", "crypto-js", "lodash", "moment", "uuid"] as const;
export type VmLibrary = (typeof VM_LIBRARIES)[number];

/**
 * The libraries a script may ask for: those whose name is written in it,
 * when it says `require` at all. `require` inside the engine cannot wait
 * for a download, so they are fetched before the script starts.
 */
export function librariesOf(source: string): VmLibrary[] {
  // ponytail: a name that is put together at run time ("lod" + "ash") is not found; `require` then says the name must be written out.
  const named = /\brequire\b/.test(source) ? VM_LIBRARIES.filter((name) => source.includes(name)) : [];
  // pm.expect is chai's.
  return /\bexpect\b/.test(source) && !named.includes("chai") ? ["chai", ...named] : named;
}

/**
 * The text of every library `source` may ask for, and of no other: what a
 * script can `require` does not depend on the scripts that ran before it.
 * `load` fetches one (`loadLibrary` in `library-loader.ts`); `cache` is the
 * caller's, kept between runs.
 */
export async function loadLibraries(source: string, load: (name: VmLibrary) => Promise<string>, cache: Map<string, string>): Promise<Map<string, string>> {
  const loaded = new Map<string, string>();
  for (const name of librariesOf(source)) {
    const text = cache.get(name) ?? (await load(name));
    cache.set(name, text);
    loaded.set(name, text);
  }
  return loaded;
}
