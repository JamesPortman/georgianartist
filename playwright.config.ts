import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: isCI ? 1 : 0,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    // A failing test in CI leaves its trace (DOM snapshots, network, console)
    // and a screenshot in test-results/, which e2e.yml uploads. Without these
    // a CI-only failure left nothing to look at.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Reference screenshots for e2e/visual.spec.ts, one set, with no platform
  // suffix: they are only ever rendered on CI's Linux runner
  // (.github/workflows/visual-baselines.yml).
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  // CI never writes a missing reference: it fails, so a new screenshot can't
  // pass by comparing against itself.
  updateSnapshots: isCI ? "none" : "missing",
  expect: {
    toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.01 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /visual\.spec\.ts/,
    },
    {
      // Run on its own, before the main suite edits the catalogue (npm run test:visual).
      name: "visual",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /visual\.spec\.ts/,
    },
  ],
  webServer: {
    // CI runs the production build (npm run build) first, then serves it.
    // Locally, reuse the dev server the developer already has running.
    command: isCI ? "npm run start" : "/opt/homebrew/bin/npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !isCI,
    timeout: 180000,
  },
});
