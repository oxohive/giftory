import { defineConfig } from '@playwright/test'

/**
 * Storefront + admin E2E tests — Phase 1 checklist.
 *
 * Run from this directory:
 *   npx playwright test
 *
 * Override servers:
 *   BASE_URL=http://localhost:3100 ADMIN_URL=http://localhost:3000 npx playwright test
 */
export default defineConfig({
  testDir: './__integration__',
  testMatch: ['**/*.spec.ts'],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 1,
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3100',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: './playwright-report', open: 'never' }],
  ],
  outputDir: './playwright-results',
})
