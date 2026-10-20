import Link from 'next/link'
import type { ReactNode } from 'react'
import { Button, formatDate } from '@gift/ui'
import type { DealerRole } from '@/components/layout/nav-items'
import { PRINTING_METHOD_LABELS, type PrintingMethod } from '@/lib/features/profile/constants'
import type { DealerCapabilitiesWire } from '@/lib/features/profile/types'

/**
 * Read-only capabilities display for `/profile`. Shown to BOTH roles: `dealer_org.view` (the
 * feature this page's data comes from) is granted to `dealer:owner` AND `dealer:staff` per
 * CONTRACT-HANDOFF.md's permission matrix — only `dealer_org.manage_capabilities` (the edit
 * surface) is owner-only. The "Edit capabilities" entry point is therefore rendered only for an
 * owner; a staff viewer sees the identical values with no edit affordance they could not use
 * anyway (same pattern `CapacityCard` already established on the dashboard for this exact
 * capability/role split).
 */
export function CapabilitiesSummaryCard({
  capabilities,
  role,
}: {
  capabilities: DealerCapabilitiesWire
  role: DealerRole
}) {
  const configured = capabilities.updatedAt !== null
  return (
    <section className="rounded-lg border border-border bg-surface p-5" aria-labelledby="capabilities-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="capabilities-heading" className="text-base font-semibold text-foreground">
          Production capabilities
        </h2>
        {role === 'dealer:owner' ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/profile/capabilities">{configured ? 'Edit capabilities' : 'Set up capabilities'}</Link>
          </Button>
        ) : null}
      </div>

      {!configured ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Not configured yet.{role === 'dealer:owner' ? ' Set up capabilities so orders can be matched to this account.' : ''}
        </p>
      ) : (
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Product types</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {capabilities.productTypeCodes.length ? (
                capabilities.productTypeCodes.map((code) => <Chip key={code}>{code}</Chip>)
              ) : (
                <span className="text-sm text-muted-foreground">None set</span>
              )}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Printing methods</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {capabilities.printingMethods.length ? (
                capabilities.printingMethods.map((method) => (
                  <Chip key={method}>{PRINTING_METHOD_LABELS[method as PrintingMethod] ?? method}</Chip>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">None set</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Max daily capacity</dt>
            <dd className="mt-0.5 text-sm font-medium text-foreground">{capabilities.maxDailyCapacity} orders/day</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Minimum order quantity</dt>
            <dd className="mt-0.5 text-sm font-medium text-foreground">{capabilities.minOrderQty}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Serviceable states</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {capabilities.serviceableStates.length ? (
                capabilities.serviceableStates.map((state) => <Chip key={state}>{state}</Chip>)
              ) : (
                <span className="text-sm text-muted-foreground">None set</span>
              )}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Last updated</dt>
            <dd className="mt-0.5 text-sm text-foreground">{capabilities.updatedAt ? formatDate(capabilities.updatedAt) : '—'}</dd>
          </div>
        </dl>
      )}
    </section>
  )
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
      {children}
    </span>
  )
}
