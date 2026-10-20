/**
 * Typed, validated env for the API client. Reads from `../config`'s
 * `rawConfig` (created by TASK-01 from `EXPO_PUBLIC_*` vars) and fails fast
 * with a clear message at module-load time if required values are missing,
 * rather than letting `apiRequest()` fail obscurely on the first call.
 */
import { rawConfig } from '../config'

export interface AppEnv {
  apiBaseUrl: string
  organizationId?: string
  orgSlug?: string
  razorpayKeyId: string
}

function resolveEnv(): AppEnv {
  const apiBaseUrl = rawConfig.apiBaseUrl
  if (!apiBaseUrl) {
    throw new Error(
      'Missing EXPO_PUBLIC_API_BASE_URL. Set it in apps/mobile/.env (see .env.example). ' +
        'Dev default is http://localhost:3000, but that only works from a simulator on ' +
        'the same machine as the backend. On a physical device, "localhost" resolves to ' +
        "the device itself, not your dev machine — you must use your machine's LAN IP " +
        '(e.g. http://192.168.1.50:3000) instead. There is deliberately no automatic ' +
        'fallback here: hardcoding one would silently break on-device testing.',
    )
  }

  const organizationId = rawConfig.organizationId || undefined
  const orgSlug = rawConfig.orgSlug || undefined
  if (!organizationId && !orgSlug) {
    throw new Error(
      'Missing tenant/org scope: set EXPO_PUBLIC_ORG_ID or EXPO_PUBLIC_ORG_SLUG in ' +
        'apps/mobile/.env. The backend resolves org scope via (1) custom domain, (2) ' +
        'signed-in session, or (3) an organizationId/orgSlug query parameter — this app ' +
        'has no custom domain, so at least one of these two vars is required; apiRequest() ' +
        'appends whichever is set to every request automatically.',
    )
  }

  // razorpayKeyId is typed as required above (TASK-07's checkout flow needs it
  // unconditionally to open the Razorpay native checkout), so validate it here
  // too rather than letting `env.razorpayKeyId` silently be `undefined` at
  // runtime despite its non-optional type.
  const razorpayKeyId = rawConfig.razorpayKeyId
  if (!razorpayKeyId) {
    throw new Error(
      'Missing EXPO_PUBLIC_RAZORPAY_KEY_ID. Set it in apps/mobile/.env (see .env.example).',
    )
  }

  return { apiBaseUrl, organizationId, orgSlug, razorpayKeyId }
}

export const env: AppEnv = resolveEnv()
