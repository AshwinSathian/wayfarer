import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/index.ts"],
      reporter: ["text-summary", "json-summary"],
      // The resolver decides what goes on the wire: every branch of it is tested (P2.4).
      thresholds: { lines: 90, "src/variables/resolver.ts": { branches: 100 } },
    },
  },
});
