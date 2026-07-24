import { defineConfig, devices } from '@playwright/test';

/*
 * E2E runs against a dedicated vite port, NOT the app's default 3000. In this
 * project 3000 is claimed by the docker `frontend` container serving a stale
 * built bundle; reusing it silently tests old code. Using a separate port with
 * strictPort and reuseExistingServer:false guarantees Playwright boots a fresh
 * dev server from the current source. Override with PW_PORT / BASE_URL.
 */
const PORT = Number(process.env.PW_PORT || 3123);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'playwright-results.xml' }],
    ['json', { outputFile: 'playwright-results.json' }],
    ['line'],
  ],
  use: {
    baseURL: process.env.BASE_URL || `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
