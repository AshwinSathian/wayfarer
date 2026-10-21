// Builds the CLI: one file, dist/wayfarer-cli.mjs, with @wayfarer/core (a
// package that is not published) and what core uses bundled in. The script
// engine stays a dependency: its WebAssembly file is loaded from its own
// package. The licences of what is bundled go into dist/THIRD_PARTY_LICENSES.txt.
import { build } from "esbuild";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));
const dist = join(here, "dist");
mkdirSync(dist, { recursive: true });

const result = await build({
  entryPoints: [join(here, "src/main.ts")],
  outfile: join(dist, "wayfarer-cli.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  tsconfig: join(here, "tsconfig.json"),
  external: Object.keys(pkg.dependencies),
  define: { VERSION: JSON.stringify(pkg.version) },
  // A bundled CommonJS module (yaml) asks for Node's own modules with `require`.
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);',
  },
  legalComments: "none",
  metafile: true,
  logLevel: "warning",
});

// Each package of node_modules that went into the file, with its licence.
const packages = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const match = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input);
  if (match) packages.add(match[1]);
}
const root = join(here, "../..");
const notices = [...packages].sort().map((name) => {
  const folder = join(root, "node_modules", name);
  const { version, license } = JSON.parse(readFileSync(join(folder, "package.json"), "utf8"));
  const file = ["LICENSE", "LICENSE.md", "LICENSE.txt", "license"].map((entry) => join(folder, entry)).find(existsSync);
  if (!file) throw new Error(`${name} has no licence file to ship with the CLI.`);
  return `${"-".repeat(80)}\n${name}@${version} (${license})\n\n${readFileSync(file, "utf8").trim()}\n`;
});
const vmLibraries = readFileSync(join(root, "packages/core/src/scripting/vm-libs/licenses.txt"), "utf8");
writeFileSync(
  join(dist, "THIRD_PARTY_LICENSES.txt"),
  `wayfarer-cli bundles the packages below. The script engine (quickjs-emscripten) is a dependency and carries its own.\n\n${notices.join("\n")}\n${vmLibraries}`,
);
