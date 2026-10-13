"use client"

import * as React from 'react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { hasFeature } from '@open-mercato/shared/security/features'

type FeatureCheckResponse = {
  granted?: string[]
}

const CHECKED_FEATURES = ['dealer_org.admin']

/**
 * Resolves the current admin's grant for `dealer_org.admin` via the shared
 * `/api/auth/feature-check` endpoint — mirrors `payouts/components/
 * useLedgerAccess.ts`'s identical precedent.
 *
 * Important, verified-against-source asymmetry (see `components/__tests__/
 * adminAclContract.test.ts`): unlike `payouts`/`commissions`, which split
 * `.view` and `.manage` into two features (so an `employee` role can see a
 * read-only screen), `dealer_org_rbac`'s admin routes — the directory list,
 * the dealer detail GET, and the capabilities PUT — are ALL gated by this
 * one `dealer_org.admin` feature, and `setup.ts` grants it only to
 * `superadmin`/`admin`. There is no server-side "view only" grant for this
 * module's admin surface for this hook to distinguish, and editing
 * `acl.ts`/`setup.ts` to add one is outside this task's owned paths
 * (`backend/`, `components/`, `i18n/` only). So `canManage` here is
 * currently equivalent to "can see this page at all" — this hook still
 * exists (rather than assuming every caller who loaded the page can write)
 * so that IF a future backend change splits the feature, this is the one
 * place the UI needs to update, and so the Save button is never rendered
 * enabled on a mere assumption. The real enforcement is, and remains, the
 * server's `requireFeatures` check on the PUT route — this hook only
 * decides what to show, never what the server allows.
 */
export function useDealerOrgAdminAccess() {
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
    canManage: hasFeature(granted, 'dealer_org.admin'),
  }
}
