"use client"

/**
 * Dealer lookups for the commissions admin UI, sourced from
 * `dealer_org_rbac`'s already-shipped admin dealers endpoints
 * (`GET /api/dealer_org_rbac/admin/dealers`, `GET .../admin/dealers/{id}`,
 * both "Verified working" per CONTRACT-HANDOFF.md). This is a read-only
 * cross-module HTTP call to a documented contract — not a cross-module
 * import — the same pattern `payouts/components/DealersLedgerPicker.tsx`
 * and `DealerLedgerPage.tsx` already use for the identical need (resolving
 * a dealer's display name / picking a dealer from a list). No ORM relation,
 * no direct import of another module's code.
 */
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { apiCall, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import type { FilterOption } from '@open-mercato/ui/backend/FilterOverlay'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export type DealerOption = {
  id: string
  businessName: string
  contactEmail: string
  city: string | null
  state: string | null
}

export type DealerListResponse = {
  items: DealerOption[]
  total: number
  page: number
  pageSize: number
}

const DEALERS_API_PATH = 'dealer_org_rbac/admin/dealers'

/** Load dealer combobox/select options for a given free-text search term. */
export async function loadDealerOptions(query?: string): Promise<FilterOption[]> {
  const call = await apiCall<DealerListResponse>(
    `/api/${DEALERS_API_PATH}?${new URLSearchParams({ pageSize: '25', ...(query ? { search: query } : {}) }).toString()}`,
  )
  if (!call.ok || !call.result) return []
  return call.result.items.map((d) => ({ value: d.id, label: d.businessName }))
}

/** Paged dealer list for the "browse dealers" picker page. */
export function useDealerList(params: { page: number; pageSize: number; search?: string }) {
  return useQuery<DealerListResponse>({
    queryKey: ['commissions-admin-dealers-list', params.page, params.pageSize, params.search ?? ''],
    queryFn: () => fetchCrudList<DealerOption>(DEALERS_API_PATH, {
      page: params.page,
      pageSize: params.pageSize,
      ...(params.search ? { search: params.search } : {}),
    }),
  })
}

/** Resolve a single dealer's display fields (used to label history/rule-scope views). */
export function useDealerDetail(dealerProfileId: string | null | undefined) {
  const t = useT()
  return useQuery<DealerOption>({
    queryKey: ['commissions-admin-dealer-detail', dealerProfileId],
    queryFn: async () => {
      // `readApiResultOrThrow` attaches `.status` to the thrown error and
      // prefers the server's own message, falling back to this translated
      // one only when the server response carries none — same pattern as
      // `payouts/components/DealerLedgerPage.tsx`'s identical dealer lookup.
      const result = await readApiResultOrThrow<DealerOption>(
        `/api/${DEALERS_API_PATH}/${encodeURIComponent(String(dealerProfileId))}`,
        undefined,
        { errorMessage: t('commissions.admin.dealerHistory.error.dealer', 'Failed to load dealer') },
      )
      return result
    },
    enabled: Boolean(dealerProfileId),
    retry: false,
  })
}

/**
 * Build an id -> businessName lookup map for a known set of dealer ids
 * (e.g. the dealers referenced by the rules currently on screen), so the
 * rules table can render dealer names instead of raw UUIDs (per
 * `.ai/guides/backend-ui.md`: "render display names, never raw IDs").
 * Deliberately bounded to the ids actually in view, not a full-directory
 * fetch.
 */
export function useDealerNameMap(dealerProfileIds: string[]): { names: Map<string, string>; isLoading: boolean } {
  const idsKey = React.useMemo(
    () => Array.from(new Set(dealerProfileIds.filter(Boolean))).sort().join(','),
    [dealerProfileIds],
  )
  const ids = React.useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey])

  const { data, isLoading } = useQuery<Map<string, string>>({
    queryKey: ['commissions-admin-dealer-name-map', idsKey],
    queryFn: async () => {
      const entries = await Promise.all(ids.map(async (id) => {
        const call = await apiCall<DealerOption>(`/api/${DEALERS_API_PATH}/${encodeURIComponent(id)}`)
        return [id, call.ok && call.result ? call.result.businessName : id] as const
      }))
      return new Map(entries)
    },
    enabled: ids.length > 0,
  })

  return { names: data ?? new Map(), isLoading: ids.length > 0 && isLoading }
}
