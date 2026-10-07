import { createRazorpayClient, RazorpayApiError, type RazorpayClientOptions } from './client'
import { resolveRazorpayCredentials } from './credentials'

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy'
  message: string
  details: Record<string, unknown>
  checkedAt: Date
}

/**
 * Health probe: one authenticated read (`GET /orders?count=1`). Messages and details never
 * include key material; only mode, the public key id suffix, and Razorpay's error code.
 */
export function createRazorpayHealthCheck(clientOptions: RazorpayClientOptions = {}) {
  return {
    async check(credentials: Record<string, unknown>): Promise<HealthCheckResult> {
      const checkedAt = new Date()
      let mode: string | null = null
      let keyIdSuffix: string | null = null
      try {
        const resolved = resolveRazorpayCredentials(credentials)
        mode = resolved.mode
        keyIdSuffix = resolved.keyId ? resolved.keyId.slice(-4) : null
        const client = createRazorpayClient(resolved, clientOptions)
        await client.listOrders(1)
        return {
          status: 'healthy',
          message: `Connected to Razorpay (${resolved.mode} mode)`,
          details: {
            mode: resolved.mode,
            keyIdSuffix,
            webhookSecretConfigured: Boolean(resolved.webhookSecret),
          },
          checkedAt,
        }
      } catch (error: unknown) {
        const code = error instanceof RazorpayApiError ? error.code : null
        const status = error instanceof RazorpayApiError ? error.status : null
        const message = error instanceof RazorpayApiError && error.status === 401
          ? 'Razorpay rejected the Key ID / Key Secret'
          : error instanceof Error
            ? error.message
            : 'Unknown error'
        return {
          status: 'unhealthy',
          message: `Razorpay connection failed: ${message}`,
          details: { mode, keyIdSuffix, httpStatus: status, code },
          checkedAt,
        }
      }
    },
  }
}

export const razorpayHealthCheck = createRazorpayHealthCheck()
