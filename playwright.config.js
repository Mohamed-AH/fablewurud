/**
 * Playwright Configuration for E2E Testing
 * @see https://playwright.dev/docs/test-configuration
 */

const { defineConfig, devices } = require('@playwright/test');

// CI optimization: only run Chromium in CI unless full suite requested
const isCI = !!process.env.CI;
const runFullSuite = process.env.FULL_BROWSER_SUITE === 'true';

module.exports = defineConfig({
  // Test directory
  testDir: './tests/e2e',

  // Seed and clean up the test database
  globalSetup: './tests/e2e/global-setup.js',
  globalTeardown: './tests/e2e/global-teardown.js',

  // Maximum time one test can run for
  timeout: 30 * 1000,

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: isCI,

  // Retry on CI only
  retries: isCI ? 2 : 0,

  // Limit workers to avoid resource contention and timeouts
  // CI: 2 workers for sharding stability
  // Local: 4 workers to balance speed with stability (especially for mobile emulation)
  workers: isCI ? 2 : 4,

  // Reporter to use
  reporter: isCI
    ? [['github'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]]
    : [['html'], ['list']],

  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: process.env.TEST_URL || 'http://localhost:3000',

    // Collect trace when retrying the failed test (saves disk I/O)
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video only on failure (saves disk I/O)
    video: 'retain-on-failure',

    // Navigation timeout
    navigationTimeout: 15000,

    // Action timeout
    actionTimeout: 10000,
  },

  // Configure projects - Chromium only in CI for speed, full suite locally or on demand
  projects: isCI && !runFullSuite
    ? [
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
        },
      ]
    : [
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
        },
        {
          name: 'firefox',
          use: { ...devices['Desktop Firefox'] },
        },
        {
          name: 'webkit',
          use: { ...devices['Desktop Safari'] },
        },
        // Test against mobile viewports
        {
          name: 'Mobile Chrome',
          use: { ...devices['Pixel 5'] },
        },
        {
          name: 'Mobile Safari',
          use: { ...devices['iPhone 12'] },
        },
      ],

  // Run your local dev server before starting the tests
  webServer: {
    command: 'node tests/e2e/start-test-server.js',
    url: 'http://localhost:3000',
    reuseExistingServer: !isCI,
    timeout: 120 * 1000,
    // Environment is handled by start-test-server.js which reads from .mongo-uri file
  },
});
