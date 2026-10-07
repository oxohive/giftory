import { parseBooleanToken } from '@open-mercato/shared/lib/boolean'
import type { IntegrationScope } from '@open-mercato/shared/modules/integrations/types'
import type { CredentialsService } from '@open-mercato/core/modules/integrations/lib/credentials-service'
import type { IntegrationLogService } from '@open-mercato/core/modules/integrations/lib/log-service'
import type { IntegrationStateService } from '@open-mercato/core/modules/integrations/lib/state-service'
import {
  inferRazorpayModeFromKeyId,
  RAZORPAY_ENV_KEYS,
  RAZORPAY_INTEGRATION_ID,
  readRazorpayEnvValue,
  type RazorpayMode,
} from './credentials'

type RazorpayEnvPreset = {
  credentials: {
    keyId: string
    keySecret: string
    webhookSecret: string
    mode: RazorpayMode
  }
  force: boolean
  enabled: boolean
}

export type ApplyRazorpayPresetResult =
  | { status: 'skipped'; reason: string }
  | { status: 'configured'; enabled: boolean; mode: RazorpayMode }

function readBooleanEnv(env: NodeJS.ProcessEnv, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const parsed = parseBooleanToken(env[key])
    if (parsed !== null) return parsed
  }
  return undefined
}

/**
 * Reads RAZORPAY_* / OM_INTEGRATION_RAZORPAY_* env vars. Returns null when none are set and
 * throws (without echoing values) when only some are set.
 */
export function readRazorpayEnvPreset(env: NodeJS.ProcessEnv = process.env): RazorpayEnvPreset | null {
  const keyId = readRazorpayEnvValue(env, RAZORPAY_ENV_KEYS.keyId)
  const keySecret = readRazorpayEnvValue(env, RAZORPAY_ENV_KEYS.keySecret)
  const webhookSecret = readRazorpayEnvValue(env, RAZORPAY_ENV_KEYS.webhookSecret)
  if (!keyId && !keySecret && !webhookSecret) return null

  if (!keyId || !keySecret || !webhookSecret) {
    throw new Error(
      '[gateway_razorpay] Incomplete Razorpay env preset. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_WEBHOOK_SECRET.',
    )
  }

  const explicitMode = readRazorpayEnvValue(env, RAZORPAY_ENV_KEYS.mode).toLowerCase()
  const inferredMode = inferRazorpayModeFromKeyId(keyId)
  if (explicitMode && explicitMode !== 'test' && explicitMode !== 'live') {
    throw new Error('[gateway_razorpay] RAZORPAY_MODE must be "test" or "live".')
  }
  if (explicitMode && inferredMode && explicitMode !== inferredMode) {
    throw new Error(`[gateway_razorpay] RAZORPAY_MODE is "${explicitMode}" but RAZORPAY_KEY_ID is a ${inferredMode}-mode key.`)
  }
  const mode = (explicitMode || inferredMode || 'test') as RazorpayMode

  return {
    credentials: { keyId, keySecret, webhookSecret, mode },
    force: readBooleanEnv(env, ['OM_INTEGRATION_RAZORPAY_FORCE_PRECONFIGURE', 'RAZORPAY_FORCE_PRECONFIGURE']) ?? false,
    enabled: readBooleanEnv(env, ['OM_INTEGRATION_RAZORPAY_ENABLED', 'RAZORPAY_ENABLED']) ?? true,
  }
}

async function hasExistingRazorpayConfiguration(
  credentialsService: CredentialsService,
  integrationStateService: IntegrationStateService,
  scope: IntegrationScope,
): Promise<boolean> {
  const [credentials, state] = await Promise.all([
    credentialsService.getRaw(RAZORPAY_INTEGRATION_ID, scope),
    integrationStateService.get(RAZORPAY_INTEGRATION_ID, scope),
  ])
  return Boolean(credentials) || Boolean(state)
}

/** Idempotent: skips when credentials/state already exist unless `force` is set. */
export async function applyRazorpayEnvPreset(params: {
  credentialsService: CredentialsService
  integrationStateService: IntegrationStateService
  integrationLogService?: IntegrationLogService
  scope: IntegrationScope
  force?: boolean
  env?: NodeJS.ProcessEnv
}): Promise<ApplyRazorpayPresetResult> {
  const preset = readRazorpayEnvPreset(params.env)
  if (!preset) {
    return { status: 'skipped', reason: 'No Razorpay preset env variables were provided.' }
  }

  const force = params.force ?? preset.force
  if (!force && await hasExistingRazorpayConfiguration(params.credentialsService, params.integrationStateService, params.scope)) {
    return { status: 'skipped', reason: 'Razorpay credentials or state already exist. Use force to overwrite them.' }
  }

  await params.credentialsService.save(RAZORPAY_INTEGRATION_ID, preset.credentials, params.scope)
  await params.integrationStateService.upsert(RAZORPAY_INTEGRATION_ID, { isEnabled: preset.enabled }, params.scope)

  if (params.integrationLogService) {
    await params.integrationLogService.scoped(RAZORPAY_INTEGRATION_ID, params.scope).info(
      'Razorpay integration was preconfigured from environment variables.',
      { enabled: preset.enabled, mode: preset.credentials.mode },
    )
  }

  return { status: 'configured', enabled: preset.enabled, mode: preset.credentials.mode }
}
