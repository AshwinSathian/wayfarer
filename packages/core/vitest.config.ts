import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // vm-libs holds generated text (scripts/build-vm-libs.mjs), not code of this package.
      exclude: ["src/**/*.spec.ts", "src/index.ts", "src/scripting/vm-libs/**"],
      reporter: ["text-summary", "json-summary"],
      // The resolver decides what goes on the wire: every branch of it is tested (P2.4).
      thresholds: { lines: 90, "src/variables/resolver.ts": { branches: 100 } },
    },
  },
});
