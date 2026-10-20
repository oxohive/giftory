'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@gift/api-client'
import { Button, ErrorNotice, LoadingState, PermissionDenied, SessionExpired } from '@gift/ui'
import { fetchDealerOrgProfile, saveDealerCapabilities } from '@/lib/features/profile/api'
import { mapCapabilitiesSaveError, type CapabilitiesSaveError } from '@/lib/features/profile/errors'
import {
  areCapabilitiesFormValuesEqual,
  buildCapabilitiesPayload,
  mergeFieldErrors,
  validateCapabilitiesForm,
} from '@/lib/features/profile/validators'
import type { CapabilitiesFormValues, DealerCapabilitiesWire, FieldErrors } from '@/lib/features/profile/types'
import { CapabilitiesForm } from './CapabilitiesForm'
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard'

function toFormValues(capabilities: DealerCapabilitiesWire): CapabilitiesFormValues {
  return {
    productTypeCodes: capabilities.productTypeCodes,
    printingMethods: capabilities.printingMethods,
    maxDailyCapacity: capabilities.maxDailyCapacity,
    serviceableStates: capabilities.serviceableStates,
    minOrderQty: capabilities.minOrderQty,
  }
}

/**
 * `/profile/capabilities` — the only editable surface on the dealer profile (owner-only; the page
 * component one level up calls `requireRole(['dealer:owner'])`). Backed by
 * `PUT /api/dealer_org_rbac/dealer/profile/capabilities`.
 *
 * Mutation discipline (this task's own acceptance items):
 *  - On success, this component does NOT paint the submitted payload as the new truth. It
 *    invalidates and refetches the real `GET .../dealer/profile` query and re-derives `values`/
 *    `original` from THAT response (the `useEffect` below) — so what's on screen after a save
 *    is always what the server actually persisted, never an optimistic echo. Reloading the page
 *    re-runs the exact same fetch, so "save, then reload, and see it persisted" is the same code
 *    path, not two different ones that could drift.
 *  - `dirty` (unsaved-changes) is computed as a real inequality against the last server-fetched
 *    snapshot, not a boolean flag toggled by hand — see `areCapabilitiesFormValuesEqual`.
 *  - A 409 (`commands/capabilities.ts`'s real optimistic-concurrency check — a concurrent save
 *    changed `updatedAt` since this page fetched it) is surfaced as its own case with a
 *    "reload the latest values" action, never retried silently and never allowed to clobber the
 *    concurrent change.
 */
export function CapabilitiesEditView() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['dealer-org-profile'], queryFn: fetchDealerOrgProfile, retry: false })

  const [values, setValues] = useState<CapabilitiesFormValues | null>(null)
  const [original, setOriginal] = useState<CapabilitiesFormValues | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [saveError, setSaveError] = useState<CapabilitiesSaveError | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  // Re-sync local edit state whenever the server-backed data actually changes — first load, a
  // successful save (this component refetches below, which changes the real `updatedAt`), or a
  // "reload latest values" after a 409 — never from a locally-held optimistic copy. Adjusted
  // during render (React's documented "adjusting state when a prop changes" escape hatch) rather
  // than in a `useEffect`, so a fetched row never paints the previous render's stale form values
  // even for a single frame, and so this never trips the "no setState synchronously in an effect"
  // lint rule for a case that has no external system to subscribe to. `undefined` is used as the
  // "not yet synced" sentinel because `updatedAt` itself is only ever a real string or `null`.
  const [syncedUpdatedAt, setSyncedUpdatedAt] = useState<string | null | undefined>(undefined)
  if (query.data && query.data.capabilities.updatedAt !== syncedUpdatedAt) {
    const next = toFormValues(query.data.capabilities)
    setValues(next)
    setOriginal(next)
    setLastUpdatedAt(query.data.capabilities.updatedAt)
    setSyncedUpdatedAt(query.data.capabilities.updatedAt)
  }

  const dirty = values !== null && original !== null && !areCapabilitiesFormValuesEqual(values, original)
  useUnsavedChangesGuard(dirty, 'You have unsaved capability changes. Leave this page and discard them?')

  if (query.isLoading) return <LoadingState label="Loading your capabilities…" />

  if (query.isError) {
    const err = query.error
    if (err instanceof ApiError && err.isUnauthorized) {
      return <SessionExpired onSignIn={() => router.push('/login')} />
    }
    if (err instanceof ApiError && err.isForbidden) {
      return (
        <PermissionDenied message="You do not have permission to manage this organization's capabilities." />
      )
    }
    const message = err instanceof Error ? err.message : 'Could not load your capabilities.'
    return <ErrorNotice message={message} onRetry={() => void query.refetch()} />
  }

  if (!values) return null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaveError(null)
    setSuccess(false)
    if (!values) return

    const errors = validateCapabilitiesForm(values)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    const payload = buildCapabilitiesPayload(values, lastUpdatedAt)
    setSubmitting(true)
    try {
      await saveDealerCapabilities(payload)
      // Refetch the real GET rather than trusting the PUT's own echoed response — see this
      // component's doc comment above for why.
      await queryClient.invalidateQueries({ queryKey: ['dealer-org-profile'] })
      await query.refetch()
      setSuccess(true)
    } catch (err) {
      const mapped = mapCapabilitiesSaveError(err, 'Could not save your capabilities. Please try again.')
      setSaveError(mapped)
      if (mapped.kind === 'validation') {
        setFieldErrors((prev) => mergeFieldErrors(prev, mapped.details))
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReloadLatest() {
    setSaveError(null)
    await query.refetch()
  }

  function handleReset() {
    if (!original) return
    setValues(original)
    setFieldErrors({})
    setSaveError(null)
    setSuccess(false)
  }

  return (
    <div className="grid max-w-2xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Edit capabilities</h1>
        <p className="text-sm text-muted-foreground">
          These settings help match orders to your production capacity. Business-identity details
          are not editable here — see{' '}
          <Link href="/profile" className="text-primary underline-offset-4 hover:underline">
            your profile
          </Link>
          .
        </p>
      </div>

      {success ? (
        <p role="status" className="rounded-md border border-success/40 bg-success/10 p-3 text-sm text-foreground">
          Capabilities saved.
        </p>
      ) : null}

      {saveError ? (
        <div className="grid gap-2">
          <ErrorNotice
            message={
              saveError.kind === 'conflict'
                ? 'These capabilities were updated by someone else since you loaded this page.'
                : saveError.message
            }
            onRetry={saveError.kind === 'conflict' ? handleReloadLatest : undefined}
          />
          {saveError.details?.length ? (
            <ul className="list-disc pl-5 text-sm text-danger">
              {saveError.details.map((detail, index) => {
                const path = Array.isArray(detail.path) ? detail.path.join('.') : String(detail.path)
                return <li key={`${path}-${index}`}>{path ? `${path}: ${detail.message}` : detail.message}</li>
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="grid gap-6" noValidate aria-busy={submitting}>
        <CapabilitiesForm values={values} onChange={setValues} errors={fieldErrors} disabled={submitting} />

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={submitting || !dirty}>
            {submitting ? 'Saving…' : 'Save capabilities'}
          </Button>
          <Button type="button" variant="outline" disabled={submitting || !dirty} onClick={handleReset}>
            Reset
          </Button>
          <Button asChild variant="ghost">
            <Link href="/profile">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
