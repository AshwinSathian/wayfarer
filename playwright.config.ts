import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: process.env["CI"] ? 1 : undefined,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4200",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // In CI, build once and serve the static production output instead of
    // `ng serve`. This isn't just about speed: Angular's dev server
    // (Vite-based) compiles each `?worker` module on demand, on first
    // request, rather than pre-bundling it at build time. Under a cold
    // server — which CI always is, since `reuseExistingServer` is false —
    // several of Monaco's `?worker` imports requested concurrently for the
    // first time could race that on-demand transform and resolve to a
    // module whose `.default` was `undefined` instead of the worker
    // constructor, intermittently but reproducibly failing
    // e2e/layout.spec.ts's rapid-transition test in CI while always passing
    // locally against an already-warm dev server. A production build has no
    // on-demand compilation step for this to race against — it's the
    // structural fix, not a retry/timeout band-aid around the symptom.
    // Locally, `ng serve` is kept for fast iteration when writing/debugging
    // a spec (reusing a dev server you may already have running).
    command: process.env["CI"]
      ? "npm run build -- --configuration=production && python3 -m http.server 4200 --directory dist/wayfarer/browser"
      : "npx ng serve --configuration development",
    url: "http://localhost:4200",
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
  },
});
