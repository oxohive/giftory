"use client"

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Page, PageHeader, PageBody } from '@open-mercato/ui/backend/Page'
import { RecordNotFoundState, ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { formatDateTime } from '@open-mercato/shared/lib/time'
import { useDealerOrgAdminAccess } from './useDealerOrgAdminAccess'
import { CapabilitiesForm, type DealerCapabilitiesWire } from './CapabilitiesForm'

const DEALERS_LIST_HREF = '/backend/dealers'

export type DealerDetail = {
  id: string
  organizationId: string
  businessName: string
  contactEmail: string
  phone: string
  businessType: string
  city: string
  state: string
  pincode: string
  kycStatus: string
  approvedAt: string | null
  updatedAt: string
  capabilities: DealerCapabilitiesWire | null
}

function useDealerDetailQuery(dealerProfileId: string) {
  return useQuery<DealerDetail>({
    queryKey: ['dealer_org_rbac-admin-dealer-detail', dealerProfileId],
    queryFn: () => readApiResultOrThrow<DealerDetail>(
      `/api/dealer_org_rbac/admin/dealers/${encodeURIComponent(dealerProfileId)}`,
    ),
    retry: false,
  })
}

/**
 * Admin dealer detail page (CONTRACT-HANDOFF.md: `/backend/dealers/{id}`).
 * Shows the dealer's profile summary and capability configuration, and
 * links out to the dealer's finance screens using the STABLE routes other
 * lanes already shipped — `/backend/dealers/{id}/ledger` (payouts,
 * TASK-16) and `/backend/dealers/{id}/commission` (commissions, TASK-15).
 * This page never duplicates either screen's content.
 */
export function DealerDetailView({ dealerProfileId }: { dealerProfileId: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const { canManage, isLoading: isAccessLoading } = useDealerOrgAdminAccess()
  const { data, isLoading, error, isError } = useDealerDetailQuery(dealerProfileId)

  const handleSaved = React.useCallback(() => {
    // Refetch from the server rather than merging the submitted payload
    // into local state — what renders after a save is always what the
    // server actually persisted.
    void queryClient.invalidateQueries({ queryKey: ['dealer_org_rbac-admin-dealer-detail', dealerProfileId] })
  }, [dealerProfileId, queryClient])

  if (isLoading) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('dealer_org_rbac.admin.detail.loading', 'Loading dealer…')} />
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
              label={t('dealer_org_rbac.admin.detail.error.notFound', 'Dealer not found or not approved')}
              backHref={DEALERS_LIST_HREF}
              backLabel={t('dealer_org_rbac.admin.directory.title', 'Dealers')}
            />
          </PageBody>
        </Page>
      )
    }
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={error instanceof Error ? error.message : t('dealer_org_rbac.admin.detail.error.generic', 'Failed to load dealer')} />
        </PageBody>
      </Page>
    )
  }

  const dealer = data!

  return (
    <Page>
      <PageHeader
        title={dealer.businessName}
        description={dealer.contactEmail}
        actions={<StatusBadge variant="success" dot>{t(`dealer_org_rbac.admin.kycStatus.${dealer.kycStatus}`, dealer.kycStatus)}</StatusBadge>}
      />
      <PageBody className="space-y-6">
        <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted-foreground">{t('dealer_org_rbac.admin.detail.field.phone', 'Phone')}</dt>
            <dd>{dealer.phone}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{t('dealer_org_rbac.admin.detail.field.businessType', 'Business type')}</dt>
            <dd>{t(`dealer_org_rbac.admin.businessType.${dealer.businessType}`, dealer.businessType)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{t('dealer_org_rbac.admin.detail.field.location', 'Location')}</dt>
            <dd>{[dealer.city, dealer.state, dealer.pincode].filter(Boolean).join(', ')}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{t('dealer_org_rbac.admin.detail.field.approvedAt', 'Approved on')}</dt>
            <dd>{dealer.approvedAt ? formatDateTime(dealer.approvedAt) : '—'}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/backend/dealers/${dealer.id}/ledger`}>{t('dealer_org_rbac.admin.detail.links.ledger', 'Payout ledger')}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/backend/dealers/${dealer.id}/commission`}>{t('dealer_org_rbac.admin.detail.links.commission', 'Commission history')}</Link>
          </Button>
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-semibold">{t('dealer_org_rbac.admin.capabilities.sectionTitle', 'Capability configuration')}</h2>
          {dealer.capabilities ? (
            <CapabilitiesForm
              dealerProfileId={dealer.id}
              capabilities={dealer.capabilities}
              canManage={!isAccessLoading && canManage}
              onSaved={handleSaved}
            />
          ) : null}
        </div>
      </PageBody>
    </Page>
  )
}
