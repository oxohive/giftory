"use client"

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { RecordNotFoundState, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DealerLedgerView } from './DealerLedgerView'

type DealerDetail = {
  id: string
  businessName: string
}

const DEALERS_LIST_HREF = '/backend/payouts'

/**
 * Resolves the dealer's display name for the ledger page header via
 * `GET /api/dealer_org_rbac/admin/dealers/{id}` (verified working, 404 for
 * an unapproved/unknown dealer) before rendering `DealerLedgerView`. Kept
 * separate from `DealerLedgerView` so that component stays focused on
 * ledger/balance data only.
 */
export function DealerLedgerPage({ dealerProfileId }: { dealerProfileId: string }) {
  const t = useT()
  const { data, isLoading, error, isError } = useQuery<DealerDetail>({
    queryKey: ['payouts-admin-dealer-detail', dealerProfileId],
    queryFn: () => readApiResultOrThrow<DealerDetail>(
      `/api/dealer_org_rbac/admin/dealers/${encodeURIComponent(dealerProfileId)}`,
      undefined,
      { errorMessage: t('payouts.admin.ledger.error.dealer', 'Failed to load dealer') },
    ),
    retry: false,
  })

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
              label={t('payouts.admin.ledger.error.dealerNotFound', 'Dealer not found or not approved')}
              backHref={DEALERS_LIST_HREF}
              backLabel={t('payouts.admin.dealerPicker.title', 'Payouts')}
            />
          </PageBody>
        </Page>
      )
    }
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={error instanceof Error ? error.message : t('payouts.admin.ledger.error.dealer', 'Failed to load dealer')} />
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <DealerLedgerView dealerProfileId={dealerProfileId} dealerLabel={data?.businessName} />
    </Page>
  )
}
