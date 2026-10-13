/**
 * Status-to-tone mapping shared by every status badge in the dealer portal and admin screens.
 * Values are the real enums from tasks/phase-2-ui/API-CONTRACTS.md (dealer_onboarding.kycStatus,
 * dealer_orders assignment status). Unknown values fall back to a neutral tone rather than
 * throwing, since new statuses may be introduced without every caller upgrading first.
 */
export type StatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger'

const TONE_BY_STATUS: Record<string, StatusTone> = {
  // dealer_onboarding.kycStatus
  pending_verification: 'neutral',
  under_review: 'info',
  approved: 'success',
  rejected: 'danger',
  // dealer_orders assignment status
  assigned: 'info',
  acknowledged: 'info',
  in_production: 'warning',
  ready_for_dispatch: 'warning',
  dispatched: 'success',
  cancelled: 'danger',
}

export function statusTone(value: string): StatusTone {
  return TONE_BY_STATUS[value] ?? 'neutral'
}

/** "in_production" -> "in production". Callers needing title case should wrap with CSS (`capitalize`). */
export function statusLabel(value: string): string {
  return value.replaceAll('_', ' ')
}
