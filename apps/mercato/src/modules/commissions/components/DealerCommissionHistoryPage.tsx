"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { RecordNotFoundState, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useDealerDetail } from './dealerLookup'
import { DealerCommissionHistoryView } from './DealerCommissionHistoryView'

const DEALERS_PICKER_HREF = '/backend/commission-rules/dealers'

/**
 * Resolves the dealer's display name via
 * `GET /api/dealer_org_rbac/admin/dealers/{id}` before rendering
 * `DealerCommissionHistoryView`, mirroring
 * `payouts/components/DealerLedgerPage.tsx`'s identical precedent.
 */
export function DealerCommissionHistoryPage({ dealerProfileId }: { dealerProfileId: string }) {
  const t = useT()
  const { data, isLoading, error, isError } = useDealerDetail(dealerProfileId)

  if (isLoading) {
    return (
      <Page>
        <PageBody>
          <Spinner />
        </PageBody>
      </Page>
    )
  }

  if (isError) {
    const status = (error as { status?: number } | undefined)?.status
    if (status === 404) {
      return (
        <Page>
          <PageBody>
            <RecordNotFoundState
              label={t('commissions.admin.dealerHistory.error.dealerNotFound', 'Dealer not found or not approved')}
              backHref={DEALERS_PICKER_HREF}
              backLabel={t('commissions.admin.dealerHistory.picker.table.title', 'Approved dealers')}
            />
          </PageBody>
        </Page>
      )
    }
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={error instanceof Error ? error.message : t('commissions.admin.dealerHistory.error.dealer', 'Failed to load dealer')} />
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <DealerCommissionHistoryView dealerProfileId={dealerProfileId} dealerLabel={data?.businessName} />
    </Page>
  )
}
