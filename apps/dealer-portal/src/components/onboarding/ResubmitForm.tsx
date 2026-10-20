'use client'

import { ApiError } from '@gift/api-client'
import { Button, ErrorNotice, Field, fieldDescribedBy, Input, LoadingState, Select } from '@gift/ui'
import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { fetchOnboardingStatus, resubmitApplication, type ResubmitValues } from '@/lib/features/onboarding/api'
import { BUSINESS_TYPE_LABELS, DEALER_BUSINESS_TYPES, INDIAN_STATE_OPTIONS } from '@/lib/features/onboarding/constants'
import { mergeFieldErrors, validateResubmitForm, type FieldErrors } from '@/lib/features/onboarding/validators'

interface EditableValues {
  businessName: string
  contactEmail: string
  phone: string
  businessType: string
  city: string
  state: string
  pincode: string
  gstin: string
  pan: string
}

/**
 * Rejection-reason + resubmission screen (`/onboarding/resubmit`, the path TASK-04's `/pending`
 * page already links to). Pre-fills every editable field from the applicant's current
 * application so a rejected-for-one-reason applicant never has to re-type everything —
 * EXCEPT `gstin`/`pan`, which `GET .../onboarding/status` never returns at all (the backend's
 * own serializer omits them — verified in `commands/register.ts`'s `serializeDealerProfile`).
 * Those two are shown blank with an explicit "leave blank to keep what's on file" hint rather
 * than a guessed placeholder; omitting them from the submitted body keeps the previously
 * recorded value unchanged (`executeResubmit` in `commands/resubmit.ts` only overwrites a field
 * when the parsed input actually includes it).
 *
 * Does NOT render a "note" field: resubmit's `note` body field is explicitly "accepted but not
 * persisted anywhere" per API-CONTRACTS.md — a note input here would imply a save that never
 * happens, which this screen deliberately avoids building.
 */
export function ResubmitForm() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const [notRejected, setNotRejected] = useState(false)
  const [values, setValues] = useState<EditableValues | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    fetchOnboardingStatus()
      .then((status) => {
        if (status.kycStatus !== 'rejected') {
          setNotRejected(true)
          return
        }
        setRejectionReason(status.rejectionReason ?? null)
        setValues({
          businessName: status.businessName,
          contactEmail: status.contactEmail,
          phone: status.phone,
          businessType: status.businessType,
          city: status.city,
          state: status.state,
          pincode: status.pincode,
          gstin: '',
          pan: '',
        })
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'))
      .finally(() => setLoading(false))
  }, [])

  function setField<K extends keyof EditableValues>(key: K, value: string) {
    setValues((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  if (loading) return <LoadingState label="Loading your application…" />
  if (loadError) return <ErrorNotice message={loadError} />
  if (notRejected) {
    return (
      <div className="grid gap-3 text-center">
        <p className="text-sm text-muted-foreground">
          Resubmission is only available for a rejected application.
        </p>
        <Link href="/onboarding/status" className="text-sm text-primary underline-offset-4 hover:underline">
          View application status
        </Link>
      </div>
    )
  }
  if (!values) return null

  if (success) {
    return (
      <div className="grid gap-4 text-center">
        <h1 className="text-lg font-semibold text-foreground">Application resubmitted</h1>
        <p className="text-sm text-muted-foreground">Your application is back under review.</p>
        <Link
          href="/onboarding/status"
          className="inline-flex h-10 w-fit items-center justify-self-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          View application status
        </Link>
      </div>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!values) return
    setFormError(null)

    const errors = validateResubmitForm({
      businessName: values.businessName,
      contactEmail: values.contactEmail,
      phone: values.phone,
      businessType: values.businessType,
      city: values.city,
      state: values.state,
      pincode: values.pincode,
      ...(values.gstin.trim() ? { gstin: values.gstin } : {}),
      ...(values.pan.trim() ? { pan: values.pan } : {}),
    })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    const payload: ResubmitValues = {
      businessName: values.businessName.trim(),
      contactEmail: values.contactEmail.trim(),
      phone: values.phone.trim(),
      businessType: values.businessType,
      city: values.city.trim(),
      state: values.state.trim().toUpperCase(),
      pincode: values.pincode.trim(),
    }
    if (values.gstin.trim()) payload.gstin = values.gstin.trim().toUpperCase()
    if (values.pan.trim()) payload.pan = values.pan.trim().toUpperCase()

    setSubmitting(true)
    try {
      await resubmitApplication(payload)
      setSuccess(true)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 422) {
          setFieldErrors((prev) => mergeFieldErrors(prev, err.details))
          setFormError('Please fix the highlighted fields and try again.')
        } else {
          setFormError(err.message)
        }
      } else {
        setFormError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate aria-busy={submitting}>
      <div>
        <h1 className="text-lg font-semibold text-foreground">Resubmit application</h1>
        <p className="text-sm text-muted-foreground">Update the details below and resubmit for review.</p>
      </div>

      <div className="grid gap-1 rounded-md border border-danger/40 bg-danger/10 p-4">
        <p className="text-sm font-medium text-foreground">Why it was rejected</p>
        <p className="text-sm text-foreground">{rejectionReason ?? 'No reason was provided.'}</p>
      </div>

      <p className="text-sm text-muted-foreground">
        Missing or incorrect documents?{' '}
        <Link href="/onboarding/documents" className="text-primary underline-offset-4 hover:underline">
          Review or replace your KYC documents
        </Link>
        .
      </p>

      {formError ? <ErrorNotice message={formError} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="businessName" label="Business name" required error={fieldErrors.businessName} className="sm:col-span-2">
          <Input
            id="businessName"
            value={values.businessName}
            onChange={(e) => setField('businessName', e.target.value)}
            required
            aria-invalid={Boolean(fieldErrors.businessName)}
            aria-describedby={fieldDescribedBy('businessName', fieldErrors.businessName)}
          />
        </Field>
        <Field id="contactEmail" label="Contact email" required error={fieldErrors.contactEmail}>
          <Input
            id="contactEmail"
            type="email"
            value={values.contactEmail}
            onChange={(e) => setField('contactEmail', e.target.value)}
            required
            aria-invalid={Boolean(fieldErrors.contactEmail)}
            aria-describedby={fieldDescribedBy('contactEmail', fieldErrors.contactEmail)}
          />
        </Field>
        <Field id="phone" label="Phone" required error={fieldErrors.phone}>
          <Input
            id="phone"
            type="tel"
            value={values.phone}
            onChange={(e) => setField('phone', e.target.value)}
            required
            aria-invalid={Boolean(fieldErrors.phone)}
            aria-describedby={fieldDescribedBy('phone', fieldErrors.phone)}
          />
        </Field>
        <Field id="businessType" label="Business type" required error={fieldErrors.businessType}>
          <Select
            id="businessType"
            value={values.businessType}
            onChange={(e) => setField('businessType', e.target.value)}
            required
            aria-invalid={Boolean(fieldErrors.businessType)}
            aria-describedby={fieldDescribedBy('businessType', fieldErrors.businessType)}
          >
            {DEALER_BUSINESS_TYPES.map((type) => (
              <option key={type} value={type}>
                {BUSINESS_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id="gstin"
          label="GSTIN"
          error={fieldErrors.gstin}
          hint="Leave blank to keep the GSTIN already on file (not shown here for privacy)."
        >
          <Input
            id="gstin"
            value={values.gstin}
            onChange={(e) => setField('gstin', e.target.value.toUpperCase())}
            maxLength={15}
            aria-invalid={Boolean(fieldErrors.gstin)}
            aria-describedby={fieldDescribedBy('gstin', fieldErrors.gstin, true)}
          />
        </Field>
        <Field
          id="pan"
          label="PAN"
          error={fieldErrors.pan}
          hint="Leave blank to keep the PAN already on file (not shown here for privacy)."
        >
          <Input
            id="pan"
            value={values.pan}
            onChange={(e) => setField('pan', e.target.value.toUpperCase())}
            maxLength={10}
            aria-invalid={Boolean(fieldErrors.pan)}
            aria-describedby={fieldDescribedBy('pan', fieldErrors.pan, true)}
          />
        </Field>
        <Field id="city" label="City" required error={fieldErrors.city}>
          <Input
            id="city"
            value={values.city}
            onChange={(e) => setField('city', e.target.value)}
            required
            aria-invalid={Boolean(fieldErrors.city)}
            aria-describedby={fieldDescribedBy('city', fieldErrors.city)}
          />
        </Field>
        <Field id="state" label="State" required error={fieldErrors.state}>
          <Select
            id="state"
            value={values.state}
            onChange={(e) => setField('state', e.target.value)}
            required
            aria-invalid={Boolean(fieldErrors.state)}
            aria-describedby={fieldDescribedBy('state', fieldErrors.state)}
          >
            {INDIAN_STATE_OPTIONS.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="pincode" label="Pincode" required error={fieldErrors.pincode}>
          <Input
            id="pincode"
            inputMode="numeric"
            value={values.pincode}
            onChange={(e) => setField('pincode', e.target.value)}
            required
            maxLength={6}
            aria-invalid={Boolean(fieldErrors.pincode)}
            aria-describedby={fieldDescribedBy('pincode', fieldErrors.pincode)}
          />
        </Field>
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? 'Resubmitting…' : 'Resubmit application'}
      </Button>
    </form>
  )
}
