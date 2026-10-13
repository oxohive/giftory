import { StatusBadge, formatDate } from '@gift/ui'
import type { DealerOrgProfile } from '@/lib/features/profile/types'

/**
 * Read-only display of the dealer's business-identity fields. Deliberately NOT editable: per
 * API-CONTRACTS.md's "Business-profile edit scope" (re-confirmed by this task against the real
 * route source), there is no dealer-facing endpoint to edit `businessName`/`contactEmail`/
 * `phone`/`businessType`/`city`/`state`/`pincode` post-approval — the only dealer-facing `PUT` in
 * `dealer_org_rbac` is capabilities-only. Building an editor for any of these fields would be
 * building against a contract that does not exist, which this task's own briefing explicitly
 * forbids. `gstin`/`pan` are not shown at all — the backend's own serializer never returns them
 * from this route (same omission as `dealer_onboarding`'s status endpoint).
 */
export function BusinessProfileCard({ profile }: { profile: DealerOrgProfile }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-5" aria-labelledby="business-profile-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="business-profile-heading" className="text-base font-semibold text-foreground">
          Business profile
        </h2>
        <StatusBadge value={profile.kycStatus} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        These details are read-only here. To correct a business-identity detail, contact support —
        there is no self-service editor for this information once your account is approved.
      </p>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Business name" value={profile.businessName} />
        <Field label="Contact email" value={profile.contactEmail} />
        <Field label="Phone" value={profile.phone} />
        <Field label="Business type" value={businessTypeLabel(profile.businessType)} />
        <Field label="City" value={profile.city} />
        <Field label="State" value={profile.state} />
        <Field label="Pincode" value={profile.pincode} />
        <Field label="Approved on" value={profile.approvedAt ? formatDate(profile.approvedAt) : '—'} />
      </dl>
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground">{value || '—'}</dd>
    </div>
  )
}

function businessTypeLabel(value: string): string {
  switch (value) {
    case 'proprietorship':
      return 'Proprietorship'
    case 'partnership':
      return 'Partnership'
    case 'pvt_ltd':
      return 'Private limited company'
    case 'llp':
      return 'Limited liability partnership'
    default:
      return value
  }
}
