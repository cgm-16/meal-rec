// ABOUTME: Playwright configuration for PWA and E2E testing
// ABOUTME: Configures test settings, browsers, and server options

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  // Global timeout configurations - increased for complex admin operations
  timeout: process.env.CI ? 120000 : 90000, // 2 minutes in CI, 90s locally
  expect: {
    timeout: process.env.CI ? 30000 : 20000, // 30s in CI, 20s locally
  },
  
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    
    // Action and navigation timeouts - increased for complex operations
    actionTimeout: process.env.CI ? 30000 : 20000, // 30s in CI, 20s locally
    navigationTimeout: process.env.CI ? 60000 : 45000, // 60s in CI, 45s locally
    
    // Screenshot on failure for debugging
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  webServer: {
    command: 'node scripts/health-check.js && node scripts/e2e-seed.js && pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 240000 : 180000, // 4 minutes in CI, 3 minutes locally
    ignoreHTTPSErrors: true,
    
    // Add environment variables for the web server
    env: {
      NODE_ENV: 'test',
      MONGO_URL: 'mongodb://localhost:27017/meal-rec-e2e-test',
      NEXTAUTH_SECRET: 'test-secret-for-playwright',
      NEXTAUTH_URL: 'http://localhost:3000',
      // Disable Sentry in E2E tests to avoid DSN errors
      NEXT_PUBLIC_SENTRY_DSN: '',
      SENTRY_AUTH_TOKEN: 'disabled',
    },
  },
});