import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { APIRequestContext, APIResponse } from '@playwright/test'

/**
 * Helpers for `dealer-isolation-cross-tenant.spec.ts`.
 *
 * This spec provisions brand-new tenants by running the real `mercato auth setup` /
 * `mercato auth add-user` CLI commands against `process.env.DATABASE_URL`. That is only
 * safe against a throwaway database, so `assertThrowawayEnvironment()` refuses to run
 * unless DATABASE_URL and BASE_URL both point at a local host. Under the sanctioned
 * vehicle (`yarn test:integration:ephemeral`) DATABASE_URL is the Testcontainers Postgres
 * the harness just started (`localhost:<random port>`), so the guard passes. Run in any
 * other way (e.g. a shell that happens to export the shared Supabase DATABASE_URL) and the
 * spec fails before touching anything.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** apps/mercato — five levels up from src/modules/dealer_orders/__integration__/fixtures. */
export const MERCATO_APP_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..')

export const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5001'

const EMAIL_CAPTURE_PATH =
  process.env.OM_TEST_EMAIL_CAPTURE_PATH ?? path.join(MERCATO_APP_DIR, '.ai', 'qa', 'email-capture.jsonl')

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal']

function allowedHosts(): string[] {
  const extra = (process.env.OM_ISOLATION_SPEC_ALLOWED_DB_HOSTS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  return [...LOCAL_HOSTS, ...extra]
}

function hostOf(raw: string, label: string): string {
  try {
    return new URL(raw).hostname.toLowerCase()
  } catch {
    throw new Error(`[isolation-spec] ${label} is not a valid URL; refusing to run.`)
  }
}

/**
 * Fail closed unless both the database and the app under test are local throwaway
 * instances. Never prints the URLs themselves (they may carry credentials).
 */
export function assertThrowawayEnvironment(): void {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error(
      '[isolation-spec] DATABASE_URL is not set. Run this spec through `yarn test:integration:ephemeral` ' +
        '(apps/mercato), which starts a disposable Postgres and passes its URL to Playwright.',
    )
  }
  const dbHost = hostOf(databaseUrl, 'DATABASE_URL')
  if (!allowedHosts().includes(dbHost)) {
    throw new Error(
      `[isolation-spec] DATABASE_URL host "${dbHost}" is not a local throwaway database. This spec creates ` +
        'tenants and users, so it refuses to run against a shared database. (If your Docker host is remote, ' +
        'add it to OM_ISOLATION_SPEC_ALLOWED_DB_HOSTS.)',
    )
  }
  const appHost = hostOf(BASE_URL, 'BASE_URL')
  if (!allowedHosts().includes(appHost)) {
    throw new Error(`[isolation-spec] BASE_URL host "${appHost}" is not local; refusing to run against a deployed backend.`)
  }
}

function runMercatoCli(args: string[]): string {
  const cliEntry = path.join(MERCATO_APP_DIR, 'scripts', 'mercato-cli.mjs')
  try {
    return execFileSync(process.execPath, [cliEntry, ...args], {
      cwd: MERCATO_APP_DIR,
      encoding: 'utf8',
      timeout: 240_000,
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        // `setupInitialTenant` blanks the passwords of the seeded demo users
        // (superadmin@acme.com, admin@acme.com, ...) whenever self-service onboarding is
        // enabled — which the ephemeral harness turns on. Other specs in the same run log in
        // as those users, so this child process must not inherit that flag.
        SELF_SERVICE_ONBOARDING_ENABLED: 'false',
        OM_CLI_QUIET: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string }
    const tail = `${err.stdout ?? ''}\n${err.stderr ?? ''}`.trim().split('\n').slice(-20).join('\n')
    throw new Error(`[isolation-spec] mercato ${args.slice(0, 2).join(' ')} failed: ${err.message ?? 'unknown error'}\n${tail}`)
  }
}

export type ProvisionedTenant = {
  label: string
  tenantId: string
  /** The tenant's root ("marketplace") organization — what dealer invite links carry. */
  organizationId: string
  adminEmail: string
  adminPassword: string
}

const TEST_PASSWORD = 'IsoTest!Pass1234'

/**
 * Creates a brand-new tenant + root organization (`mercato auth setup`, which also runs every
 * module's `onTenantCreated` hook and default role ACLs — including the `dealer:owner` and
 * `dealer:staff` roles), then a tenant-scoped, non-superadmin `admin` user in it
 * (`mercato auth add-user`). The tenant's primary user is a superadmin and is not used.
 */
export function provisionTenant(label: string, runId: string): ProvisionedTenant {
  const slug = `iso-${label.toLowerCase()}-${runId}`.replace(/[^a-z0-9-]/g, '-').slice(0, 63)
  const setupOut = runMercatoCli([
    'auth',
    'setup',
    '--orgName',
    `Isolation Tenant ${label} ${runId}`,
    '--orgSlug',
    slug,
    '--email',
    `root-${slug}@test.local`,
    '--password',
    TEST_PASSWORD,
    '--json',
  ])
  const jsonLine = setupOut
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{') && line.includes('"tenantId"'))
    .pop()
  if (!jsonLine) throw new Error(`[isolation-spec] auth setup for tenant ${label} printed no JSON result`)
  const parsed = JSON.parse(jsonLine) as { tenantId?: string; organizationId?: string; reusedExistingUser?: boolean }
  if (!parsed.tenantId || !parsed.organizationId) {
    throw new Error(`[isolation-spec] auth setup for tenant ${label} returned no tenant/organization id`)
  }
  if (parsed.reusedExistingUser) {
    throw new Error(`[isolation-spec] auth setup for tenant ${label} reused an existing user instead of creating a fresh tenant`)
  }

  const adminEmail = `admin-${slug}@test.local`
  const addUserOut = runMercatoCli([
    'auth',
    'add-user',
    '--email',
    adminEmail,
    '--password',
    TEST_PASSWORD,
    '--organizationId',
    parsed.organizationId,
    '--roles',
    'admin',
  ])
  if (!/User created with id [0-9a-f-]{36}/i.test(addUserOut)) {
    throw new Error(`[isolation-spec] auth add-user for tenant ${label} did not report a created user`)
  }

  return { label, tenantId: parsed.tenantId, organizationId: parsed.organizationId, adminEmail, adminPassword: TEST_PASSWORD }
}

// ── HTTP helpers (same login/cookie handling as dealer-marketplace-journey.spec.ts) ──

export type Jar = Record<string, string>

export function cookieHeader(jar: Jar): string {
  return Object.entries(jar)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ')
}

export async function loginAs(request: APIRequestContext, email: string, password: string): Promise<Jar | null> {
  const res = await request.post(`${BASE_URL}/api/auth/login`, { form: { email, password } })
  if (res.status() !== 200) return null
  const jar: Jar = {}
  for (const header of res.headersArray().filter((entry) => entry.name.toLowerCase() === 'set-cookie')) {
    const [pair] = header.value.split(';')
    const idx = pair.indexOf('=')
    if (idx > 0) jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim()
  }
  return jar
}

/** Every captured email (as JSON text) whose content mentions `recipient`, oldest first. */
export function capturedEmailsFor(recipient: string): string[] {
  if (!existsSync(EMAIL_CAPTURE_PATH)) return []
  const needle = recipient.toLowerCase()
  return readFileSync(EMAIL_CAPTURE_PATH, 'utf8')
    .split('\n')
    .filter((line) => line.trim() && line.toLowerCase().includes(needle))
}

function readLatestEmailFor(recipient: string): unknown | null {
  const lines = capturedEmailsFor(recipient)
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i])
    } catch {
      // skip malformed line
    }
  }
  return null
}

function extractToken(entry: unknown): string | null {
  const text = JSON.stringify(entry)
  const match = text.match(/token=([A-Za-z0-9_\-.]{10,})/) || text.match(/reset\/([A-Za-z0-9_\-.]{10,})/)
  return match ? match[1] : null
}

/** Waits (bounded) for the invite email to be captured, sets the password, and logs in. */
export async function completeInvite(
  request: APIRequestContext,
  email: string,
  password: string,
  timeoutMs = 20_000,
): Promise<Jar | null> {
  const deadline = Date.now() + timeoutMs
  let token: string | null = null
  while (!token && Date.now() < deadline) {
    const entry = readLatestEmailFor(email)
    token = entry ? extractToken(entry) : null
    if (!token) await new Promise((resolve) => setTimeout(resolve, 500))
  }
  if (!token) return null
  const confirm = await request.post(`${BASE_URL}/api/auth/reset/confirm`, { form: { token, password } })
  if (confirm.status() !== 200) return null
  return loginAs(request, email, password)
}

/** Response body as text (never throws). */
export async function bodyText(res: APIResponse): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}
