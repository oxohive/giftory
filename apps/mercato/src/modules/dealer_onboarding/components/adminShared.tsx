'use client'
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'

export type DealerRow = { id: string; businessName: string; contactEmail: string; phone: string; businessType: string; city: string; state: string; pincode: string; kycStatus: string; rejectionReason: string | null; updatedAt: string; capabilities?: Capabilities | null }
export type Capabilities = { productTypeCodes: string[]; printingMethods: string[]; serviceableStates: string[]; maxDailyCapacity: number; minOrderQty: number; updatedAt?: string | null }
export type ListResult<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number }

export function useAdminResource<T>(url: string) {
  const scope = useOrganizationScopeVersion()
  return useQuery({ queryKey: ['dealer-admin', url, scope], queryFn: () => readApiResultOrThrow<T>(url) })
}

export function ResourceError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useT()
  return <Alert variant="destructive"><AlertDescription role="alert">{error instanceof Error ? error.message : t('dealer_onboarding.admin.loadError', 'Unable to load this record. Check your access and try again.')} <Button variant="outline" onClick={retry}>{t('dealer_onboarding.admin.retry', 'Retry')}</Button></AlertDescription></Alert>
}

export function DealerSummary({ dealer }: { dealer: DealerRow }) {
  const t = useT()
  const fields = ['businessName', 'contactEmail', 'phone', 'businessType', 'city', 'state', 'pincode', 'kycStatus'] as const
  return <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">{fields.map(field => <div key={field}><dt className="text-sm text-muted-foreground">{t(`dealer_onboarding.admin.${field}`, field)}</dt><dd className="break-words">{field === 'kycStatus' || field === 'businessType' ? t(`dealer_onboarding.${field}.${dealer[field]}`, dealer[field]) : dealer[field]}</dd></div>)}</dl>
}
