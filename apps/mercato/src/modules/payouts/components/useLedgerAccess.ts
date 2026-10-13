"use client"

import * as React from 'react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { hasFeature } from '@open-mercato/shared/security/features'

type FeatureCheckResponse = {
  granted?: string[]
}

const CHECKED_FEATURES = ['payouts.view', 'payouts.manage']

/**
 * Resolves the current admin's grants for the two payouts features via the
 * shared `/api/auth/feature-check` endpoint (see
 * `@open-mercato/webhooks`'s `useWebhookFeatureAccess` for the precedent this
 * mirrors). The page itself is already server-side gated on `payouts.view`
 * via `page.meta.ts` `requireFeatures` — this hook exists so the "Record
 * payout" / "Add adjustment" actions can be hidden client-side for a
 * `payouts.view`-only admin (e.g. `employee`) without duplicating role-name
 * checks. Backend ACL on the POST routes (`payouts.manage`) stays
 * authoritative regardless of what this hook reports.
 */
export function useLedgerAccess() {
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
    canView: hasFeature(granted, 'payouts.view'),
    canManage: hasFeature(granted, 'payouts.manage'),
  }
}
