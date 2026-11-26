/**
 * Accessibility regression suite for the dealer portal (axe-core + scripted keyboard/reflow checks).
 *
 *   npm run test:a11y            # builds the app, starts the mock API + `next start`, runs the suite
 *   A11Y_SKIP_BUILD=1 npm run test:a11y   # reuse an existing `.next` production build
 *   A11Y_DEV=1 npm run test:a11y          # use `next dev` instead (faster to iterate, slower per page)
 *   A11Y_REUSE=1 npm run test:a11y        # use servers already running on the ports below
 *
 * Never talks to a real backend: `OM_API_BASE_URL` points at tests/a11y/mock-api.mjs.
 * Ports: portal 3210, mock API 3299 (override with A11Y_PORT / MOCK_API_PORT).
 */
import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const appDir = fileURLToPath(new URL('../..', import.meta.url))
const PORT = Number(process.env.A11Y_PORT ?? 3210)
const MOCK_PORT = Number(process.env.MOCK_API_PORT ?? 3299)
// `localhost`, not 127.0.0.1: `next dev` refuses dev-only resources (HMR, chunks) from other origins.
const baseURL = `http://localhost:${PORT}`

// Off by default: silently reusing whatever already listens on the port (e.g. a stale `next dev`)
// produced confusing failures. Set A11Y_REUSE=1 to test against servers you started yourself.
const REUSE = Boolean(process.env.A11Y_REUSE)

const nextCommand = process.env.A11Y_DEV
  ? `npx next dev --port ${PORT}`
  : `${process.env.A11Y_SKIP_BUILD ? '' : 'npm run build && '}npx next start --port ${PORT}`

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.mjs$/,
  outputDir: '../../test-results/a11y',
  fullyParallel: true,
  workers: process.env.A11Y_WORKERS ? Number(process.env.A11Y_WORKERS) : 2,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: `node tests/a11y/mock-api.mjs`,
      cwd: appDir,
      env: { MOCK_API_PORT: String(MOCK_PORT) },
      url: `http://127.0.0.1:${MOCK_PORT}/api/__health`,
      reuseExistingServer: REUSE,
      timeout: 30_000,
    },
    {
      command: nextCommand,
      cwd: appDir,
      env: { OM_API_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, NEXT_TELEMETRY_DISABLED: '1' },
      url: `${baseURL}/login`,
      reuseExistingServer: REUSE,
      timeout: 600_000,
    },
  ],
})
