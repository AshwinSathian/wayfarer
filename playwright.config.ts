import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env["CI"];
// BASE_URL points the suite at a deployed site (production, or a version
// preview URL) and skips the local servers. Run it with `--grep @smoke`.
const BASE_URL = process.env["BASE_URL"];

// How long a claim test waits for what it expects. On GitHub's runners 15 s,
// not Playwright's 5: a claim test has no retry, and a WebKit job there ran
// five times slower than a laptop, so a step that derives a vault key or
// restores a backup did not show its result in 5 s (e2e/FLAKES.md: five
// jobs, each green on the rerun of the same commit). No test asserts a
// duration; a longer wait changes only how long a failure takes.
const CLAIMS_EXPECT_MS = process.env["GITHUB_ACTIONS"] ? 15_000 : 5_000;

const BROWSERS = [
  { name: "chromium", device: devices["Desktop Chrome"] },
  { name: "firefox", device: devices["Desktop Firefox"] },
  { name: "webkit", device: devices["Desktop Safari"] },
] as const;

export default defineConfig({
  testDir: "./e2e",
  // The default also matches *.test.mjs, which are Node test suites (F54).
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [["list"], ["html", { open: "never" }], ["json", { outputFile: "test-results/results.json" }]] : "list",
  use: {
    baseURL: BASE_URL ?? "http://localhost:4200",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  // P1.3: every spec runs in all three engines. Tests tagged @claim back a
  // public claim (docs/claims.md), so they run in their own projects with
  // retries disabled: a claim test that fails once fails CI. With no retry
  // there is no "first retry" to trace, so these keep the trace of a failure.
  projects: BROWSERS.flatMap(({ name, device }) => [
    { name, use: { ...device }, grepInvert: /@claim\b/ },
    { name: `claims-${name}`, use: { ...device, trace: "retain-on-failure" as const }, grep: /@claim\b/, retries: 0, expect: { timeout: CLAIMS_EXPECT_MS } },
  ]),
  webServer: BASE_URL
    ? undefined
    : [
        {
          // Deterministic request target (P1.2); e2e never calls the internet.
          command: "node e2e/support/echo-server.mjs",
          url: "http://127.0.0.1:4300/status/200",
          reuseExistingServer: !CI,
        },
        {
          // CI serves the production build through prod-server.mjs, which
          // applies public/_headers like Cloudflare does, so e2e sees
          // production's CSP (e2e/tripwire.spec.ts F01). A prebuilt dist/
          // (the CI build artifact, P1.7) is served as-is; otherwise build.
          // A production build also avoids Angular's dev server compiling
          // Monaco's `?worker` imports on demand, which raced under a cold
          // server and intermittently broke e2e/layout.spec.ts in CI.
          // Locally, `ng serve` is kept for fast iteration.
          command: CI
            ? "(test -f dist/wayfarer/browser/index.html || npm run build) && node e2e/support/prod-server.mjs dist/wayfarer/browser 4200"
            : "npx ng serve --configuration development",
          url: "http://localhost:4200",
          reuseExistingServer: !CI,
          timeout: 180_000,
        },
      ],
});
