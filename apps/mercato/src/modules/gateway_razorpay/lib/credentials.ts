/**
 * Credential resolution for the Razorpay gateway.
 *
 * Primary source: the integrations credential service (`gateway_razorpay`, encrypted, per tenant/org),
 * which the payment_gateways host resolves and hands to the adapter as `credentials`.
 * Fallback: process env (OM_INTEGRATION_RAZORPAY_* preferred, RAZORPAY_* accepted) for any field
 * the stored credentials leave empty. Stored values always win.
 *
 * Never log or return the secret values produced here.
 */

export const RAZORPAY_INTEGRATION_ID = 'gateway_razorpay'
export const RAZORPAY_PROVIDER_KEY = 'razorpay'

export type RazorpayMode = 'test' | 'live'

export type RazorpayCredentials = {
  keyId: string
  keySecret: string
  webhookSecret: string
  mode: RazorpayMode
}

export const RAZORPAY_ENV_KEYS = {
  keyId: ['OM_INTEGRATION_RAZORPAY_KEY_ID', 'RAZORPAY_KEY_ID'],
  keySecret: ['OM_INTEGRATION_RAZORPAY_KEY_SECRET', 'RAZORPAY_KEY_SECRET'],
  webhookSecret: ['OM_INTEGRATION_RAZORPAY_WEBHOOK_SECRET', 'RAZORPAY_WEBHOOK_SECRET'],
  mode: ['OM_INTEGRATION_RAZORPAY_MODE', 'RAZORPAY_MODE'],
} as const

export class RazorpayConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RazorpayConfigurationError'
  }
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function readRazorpayEnvValue(env: NodeJS.ProcessEnv, keys: readonly string[]): string {
  for (const key of keys) {
    const value = env[key]?.trim()
    if (value) return value
  }
  return ''
}

export function inferRazorpayModeFromKeyId(keyId: string): RazorpayMode | null {
  if (keyId.startsWith('rzp_test_')) return 'test'
  if (keyId.startsWith('rzp_live_')) return 'live'
  return null
}

function parseMode(value: string): RazorpayMode | null {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'test' || normalized === 'live') return normalized
  return null
}

/**
 * Merge stored credentials with env fallbacks. Returns partially-empty values; use
 * `requireRazorpayApiCredentials` / `requireRazorpayWebhookSecret` at the call site.
 */
export function resolveRazorpayCredentials(
  stored: Record<string, unknown> | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): RazorpayCredentials {
  const source = stored ?? {}
  const keyId = readString(source.keyId) || readRazorpayEnvValue(env, RAZORPAY_ENV_KEYS.keyId)
  const keySecret = readString(source.keySecret) || readRazorpayEnvValue(env, RAZORPAY_ENV_KEYS.keySecret)
  const webhookSecret = readString(source.webhookSecret) || readRazorpayEnvValue(env, RAZORPAY_ENV_KEYS.webhookSecret)
  const explicitMode = parseMode(readString(source.mode) || readRazorpayEnvValue(env, RAZORPAY_ENV_KEYS.mode))
  const inferredMode = inferRazorpayModeFromKeyId(keyId)

  if (explicitMode && inferredMode && explicitMode !== inferredMode) {
    throw new RazorpayConfigurationError(
      `Razorpay mode is "${explicitMode}" but the configured Key ID is a ${inferredMode}-mode key`,
    )
  }

  return {
    keyId,
    keySecret,
    webhookSecret,
    mode: explicitMode ?? inferredMode ?? 'test',
  }
}

export function requireRazorpayApiCredentials(credentials: RazorpayCredentials): RazorpayCredentials {
  if (!credentials.keyId || !credentials.keySecret) {
    throw new RazorpayConfigurationError('Razorpay Key ID and Key Secret are required')
  }
  return credentials
}

export function requireRazorpayWebhookSecret(credentials: RazorpayCredentials): string {
  if (!credentials.webhookSecret) {
    throw new RazorpayConfigurationError('Razorpay webhook secret is required')
  }
  return credentials.webhookSecret
}
