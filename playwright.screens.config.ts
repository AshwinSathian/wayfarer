import { defineConfig, devices } from "@playwright/test";

// Phase 1.5 only (plan P1.5.17): captures every view and dialog before and
// after the PrimeNG removal, so the two sets can be compared. Not part of
// CI. Run: SCREENS_OUT=screens/before npx playwright test -c playwright.screens.config.ts
// Deleted with docs/ui-migration.md at the end of the phase.
export default defineConfig({
  testDir: "./e2e/screens",
  testMatch: process.env["SCREENS_MATCH"] ?? "capture.ts",
  fullyParallel: true,
  reporter: "list",
  timeout: 240_000,
  use: { ...devices["Desktop Chrome"], baseURL: process.env["SCREENS_BASE_URL"] ?? "http://localhost:4200" },
  webServer: [
    { command: "node e2e/support/echo-server.mjs", url: "http://127.0.0.1:4300/status/200", reuseExistingServer: true },
    {
      command: "(test -f dist/wayfarer/browser/index.html || npm run build) && node e2e/support/prod-server.mjs dist/wayfarer/browser 4200",
      url: "http://localhost:4200",
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
