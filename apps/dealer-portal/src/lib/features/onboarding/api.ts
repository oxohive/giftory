'use client'

/**
 * Thin wrappers around the dealer_onboarding routes that are plain JSON (register/status/
 * resubmit) and already allowlisted on the existing BFF proxy
 * (`@/lib/http/allowlist.ts` → `dealer_onboarding/dealer/onboarding/{register,status,resubmit}`).
 * These go through `@gift/api-client`'s `request()` unchanged — no binary body, so the proxy's
 * generic `req.text()` body-forwarding (see src/app/api/om/[...path]/route.ts) is lossless here.
 *
 * Document upload/download do NOT go through this proxy — see documentUpload.ts for why and
 * what this task built instead.
 */
import { request, type DealerProfile } from '@gift/api-client'
import type { RegisterFormValues } from './validators'

export interface RegisterResponse {
  id: string
  message: string
}

export async function registerDealer(organizationId: string, values: RegisterFormValues): Promise<RegisterResponse> {
  return request<RegisterResponse>('dealer_onboarding/dealer/onboarding/register', {
    method: 'POST',
    body: JSON.stringify({ organizationId, ...values }),
  })
}

export type OnboardingStatusResponse = DealerProfile

export async function fetchOnboardingStatus(): Promise<OnboardingStatusResponse> {
  return request<OnboardingStatusResponse>('dealer_onboarding/dealer/onboarding/status')
}

export interface ResubmitValues {
  businessName?: string
  contactEmail?: string
  phone?: string
  gstin?: string
  pan?: string
  businessType?: string
  city?: string
  state?: string
  pincode?: string
  note?: string
}

export async function resubmitApplication(values: ResubmitValues): Promise<{ ok: true }> {
  return request<{ ok: true }>('dealer_onboarding/dealer/onboarding/resubmit', {
    method: 'POST',
    body: JSON.stringify(values),
  })
}
