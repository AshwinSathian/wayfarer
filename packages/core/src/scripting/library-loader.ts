import type { VmLibrary } from "./libraries";

// Not exported from the package's index: the bundler makes a file of every
// `import()` it meets, so only what runs scripts (the app's worker, the CLI)
// imports this module, as "@wayfarer/core/library-loader". One file each,
// fetched when a script first names the library.
const LOADERS: Record<VmLibrary, () => Promise<{ default: string }>> = {
  chai: () => import("./vm-libs/chai"),
  "crypto-js": () => import("./vm-libs/crypto-js"),
  lodash: () => import("./vm-libs/lodash"),
  moment: () => import("./vm-libs/moment"),
  uuid: () => import("./vm-libs/uuid"),
};

/** The text of one library, built by `scripts/build-vm-libs.mjs`. */
export async function loadLibrary(name: VmLibrary): Promise<string> {
  return (await LOADERS[name]()).default;
}
