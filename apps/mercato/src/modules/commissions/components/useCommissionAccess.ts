"use client"

import * as React from 'react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { hasFeature } from '@open-mercato/shared/security/features'

type FeatureCheckResponse = {
  granted?: string[]
}

const CHECKED_FEATURES = ['commissions.view', 'commissions.manage']

/**
 * Resolves the current admin's grants for the two commissions features via
 * the shared `/api/auth/feature-check` endpoint — mirrors
 * `payouts/components/useLedgerAccess.ts`'s precedent for the identical
 * need. The pages themselves are already server-side gated on
 * `commissions.view` via `page.meta.ts` `requireFeatures`; this hook exists
 * so "Create rule" / "Deactivate" can be hidden client-side for a
 * `commissions.view`-only admin (e.g. `employee`) without duplicating
 * role-name checks. Backend ACL on the POST/DELETE routes
 * (`commissions.manage`) stays authoritative regardless of what this hook
 * reports — hiding the affordance is a UX nicety, not the security boundary.
 */
export function useCommissionAccess() {
  const [granted, setGranted] = React.useState<string[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const call = await apiCall<FeatureCheckResponse>('/api/auth/feature-check', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ features: CHECKED_FEATURES }),
        })
        if (!cancelled) {
          setGranted(Array.isArray(call.result?.granted) ? call.result.granted : [])
        }
      } catch {
        if (!cancelled) setGranted([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  return {
    isLoading,
    granted,
    canView: hasFeature(granted, 'commissions.view'),
    canManage: hasFeature(granted, 'commissions.manage'),
  }
}
