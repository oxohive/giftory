import { describe, expect, it, jest } from '@jest/globals'
import { RazorpayConfigurationError, resolveRazorpayCredentials } from '../lib/credentials'
import { applyRazorpayEnvPreset, readRazorpayEnvPreset } from '../lib/preset'
import { features } from '../acl'
import { integration } from '../integration'

const asEnv = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv

const env = asEnv({
  RAZORPAY_KEY_ID: 'rzp_test_env',
  RAZORPAY_KEY_SECRET: 'env_secret',
  RAZORPAY_WEBHOOK_SECRET: 'env_webhook',
})

describe('resolveRazorpayCredentials', () => {
  it('prefers stored credentials and falls back to env per field', () => {
    expect(resolveRazorpayCredentials({ keyId: 'rzp_live_stored', keySecret: 'stored' }, env)).toEqual({
      keyId: 'rzp_live_stored',
      keySecret: 'stored',
      webhookSecret: 'env_webhook',
      mode: 'live',
    })
    expect(resolveRazorpayCredentials(null, env)).toEqual({
      keyId: 'rzp_test_env', keySecret: 'env_secret', webhookSecret: 'env_webhook', mode: 'test',
    })
  })

  it('prefers OM_INTEGRATION_RAZORPAY_* over RAZORPAY_*', () => {
    const resolved = resolveRazorpayCredentials({}, asEnv({ ...(env as Record<string, string>), OM_INTEGRATION_RAZORPAY_KEY_ID: 'rzp_test_om' }))
    expect(resolved.keyId).toBe('rzp_test_om')
  })

  it('rejects a mode that contradicts the key prefix', () => {
    expect(() => resolveRazorpayCredentials({ keyId: 'rzp_test_x', keySecret: 's', mode: 'live' }, asEnv({})))
      .toThrow(RazorpayConfigurationError)
  })
})

describe('Razorpay env preset', () => {
  it('returns null when nothing is configured and throws on partial config without echoing values', () => {
    expect(readRazorpayEnvPreset(asEnv({}))).toBeNull()
    let message = ''
    try {
      readRazorpayEnvPreset(asEnv({ RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 'leaky_secret' }))
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('Incomplete Razorpay env preset')
    expect(message).not.toContain('leaky_secret')
  })

  it('saves credentials once and skips when already configured', async () => {
    const credentialsService = {
      getRaw: jest.fn(async () => null as Record<string, unknown> | null),
      save: jest.fn(async (..._args: unknown[]) => undefined),
    }
    const integrationStateService = {
      get: jest.fn(async () => null),
      upsert: jest.fn(async () => undefined),
    }
    const scope = { tenantId: 't1', organizationId: 'o1' }
    const result = await applyRazorpayEnvPreset({
      credentialsService: credentialsService as never,
      integrationStateService: integrationStateService as never,
      scope,
      env,
    })
    expect(result).toEqual({ status: 'configured', enabled: true, mode: 'test' })
    expect(credentialsService.save).toHaveBeenCalledWith('gateway_razorpay', {
      keyId: 'rzp_test_env', keySecret: 'env_secret', webhookSecret: 'env_webhook', mode: 'test',
    }, scope)

    credentialsService.getRaw.mockResolvedValueOnce({ keyId: 'existing' })
    const second = await applyRazorpayEnvPreset({
      credentialsService: credentialsService as never,
      integrationStateService: integrationStateService as never,
      scope,
      env,
    })
    expect(second.status).toBe('skipped')
    expect(credentialsService.save).toHaveBeenCalledTimes(1)
  })
})

describe('gateway_razorpay module contract', () => {
  it('binds the integration to the payment_gateways hub under gateway_<providerKey>', () => {
    expect(integration.id).toBe(`gateway_${integration.providerKey}`)
    expect(integration.hub).toBe('payment_gateways')
    expect(integration.healthCheck?.service).toBe('razorpayHealthCheck')
    const keys = integration.credentials?.fields.map((field) => field.key)
    expect(keys).toEqual(['mode', 'keyId', 'keySecret', 'webhookSecret'])
  })

  it('declares ACL features that depend on payment_gateways features', () => {
    expect(features.map((feature) => feature.id)).toEqual(['gateway_razorpay.view', 'gateway_razorpay.configure'])
    expect(features[0].dependsOn).toContain('payment_gateways.view')
    expect(features[1].dependsOn).toContain('payment_gateways.manage')
  })
})
