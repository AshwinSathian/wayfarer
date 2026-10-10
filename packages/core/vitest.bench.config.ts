import { defineConfig } from "vitest/config";

// The script benchmark (P3.10): `npm -w packages/core run bench`. Not part of `npm test`.
export default defineConfig({ test: { environment: "node", include: ["bench/**/*.bench.ts"] } });
