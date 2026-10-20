'use client'

import { ApiError } from '@gift/api-client'
import { Button, EmptyState, ErrorNotice, Field, fieldDescribedBy, Input, Select } from '@gift/ui'
import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { registerDealer } from '@/lib/features/onboarding/api'
import { BUSINESS_TYPE_LABELS, DEALER_BUSINESS_TYPES, INDIAN_STATE_OPTIONS } from '@/lib/features/onboarding/constants'
import {
  mergeFieldErrors,
  normalizeRegisterValues,
  validateRegisterForm,
  type FieldErrors,
  type RegisterFormValues,
} from '@/lib/features/onboarding/validators'

const EMPTY_VALUES: RegisterFormValues = {
  businessName: '',
  contactEmail: '',
  phone: '',
  gstin: '',
  pan: '',
  businessType: '',
  city: '',
  state: '',
  pincode: '',
}

/**
 * Registration screen. `organizationId` identifies the marketplace organization used to resolve
 * the platform tenant (`POST .../register`'s required body field) — the backend accepts any
 * existing org id here by design (API-CONTRACTS.md calls tenant selection "caller-controlled...
 * not a UI blocker"), so this screen takes it from the registration link's own query string
 * (`?organizationId=...`) rather than guessing or hard-coding one. See this task's handoff for
 * why no env-var default was wired in from here (would require editing files outside this
 * task's owned paths) and what a follow-up should add.
 */
export function RegisterForm({ organizationId }: { organizationId: string | null }) {
  const [values, setValues] = useState<RegisterFormValues>(EMPTY_VALUES)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [duplicateEmail, setDuplicateEmail] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  function setField<K extends keyof RegisterFormValues>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  if (!organizationId) {
    return (
      <EmptyState title="Registration link is incomplete">
        This registration page needs a valid marketplace reference to continue. Please use the
        registration link provided to you, or contact the marketplace for a new one.
      </EmptyState>
    )
  }

  if (success) {
    return (
      <div className="grid gap-4">
        <h1 className="text-lg font-semibold text-foreground">Registration submitted</h1>
        <p className="text-sm text-foreground">{success}</p>
        <Link href="/login" className="text-sm text-primary underline-offset-4 hover:underline">
          Go to sign in
        </Link>
      </div>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setDuplicateEmail(false)

    const errors = validateRegisterForm(values)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    if (!organizationId) return

    setSubmitting(true)
    try {
      const normalized = normalizeRegisterValues(values)
      const result = await registerDealer(organizationId, normalized)
      setSuccess(result.message)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 422) {
          setFieldErrors((prev) => mergeFieldErrors(prev, err.details))
          setFormError('Please fix the highlighted fields and try again.')
        } else if (err.status === 409) {
          setDuplicateEmail(true)
          setFormError(err.message)
        } else if (err.code === 'org_not_found') {
          setFormError('This registration link is no longer valid. Please contact the marketplace for a new one.')
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
        <h1 className="text-lg font-semibold text-foreground">Become a dealer</h1>
        <p className="text-sm text-muted-foreground">
          Tell us about your business. We will email you once your application is reviewed.
        </p>
      </div>

      {formError ? <ErrorNotice message={formError} /> : null}
      {duplicateEmail ? (
        <p className="text-sm text-muted-foreground">
          Already applied?{' '}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>{' '}
          to check your application status.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="businessName" label="Business name" required error={fieldErrors.businessName} className="sm:col-span-2">
          <Input
            id="businessName"
            name="businessName"
            autoComplete="organization"
            required
            value={values.businessName}
            onChange={(e) => setField('businessName', e.target.value)}
            aria-invalid={Boolean(fieldErrors.businessName)}
            aria-describedby={fieldDescribedBy('businessName', fieldErrors.businessName)}
          />
        </Field>

        <Field id="contactEmail" label="Contact email" required error={fieldErrors.contactEmail}>
          <Input
            id="contactEmail"
            name="contactEmail"
            type="email"
            autoComplete="email"
            required
            value={values.contactEmail}
            onChange={(e) => setField('contactEmail', e.target.value)}
            aria-invalid={Boolean(fieldErrors.contactEmail)}
            aria-describedby={fieldDescribedBy('contactEmail', fieldErrors.contactEmail)}
          />
        </Field>

        <Field id="phone" label="Phone" required error={fieldErrors.phone}>
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            value={values.phone}
            onChange={(e) => setField('phone', e.target.value)}
            aria-invalid={Boolean(fieldErrors.phone)}
            aria-describedby={fieldDescribedBy('phone', fieldErrors.phone)}
          />
        </Field>

        <Field id="businessType" label="Business type" required error={fieldErrors.businessType}>
          <Select
            id="businessType"
            name="businessType"
            required
            value={values.businessType}
            onChange={(e) => setField('businessType', e.target.value)}
            aria-invalid={Boolean(fieldErrors.businessType)}
            aria-describedby={fieldDescribedBy('businessType', fieldErrors.businessType)}
          >
            <option value="">Select…</option>
            {DEALER_BUSINESS_TYPES.map((type) => (
              <option key={type} value={type}>
                {BUSINESS_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="gstin" label="GSTIN" required error={fieldErrors.gstin} hint="15-character GST identification number">
          <Input
            id="gstin"
            name="gstin"
            required
            value={values.gstin}
            onChange={(e) => setField('gstin', e.target.value.toUpperCase())}
            aria-invalid={Boolean(fieldErrors.gstin)}
            aria-describedby={fieldDescribedBy('gstin', fieldErrors.gstin, true)}
            maxLength={15}
          />
        </Field>

        <Field id="pan" label="PAN" required error={fieldErrors.pan} hint="10-character PAN of the business/proprietor">
          <Input
            id="pan"
            name="pan"
            required
            value={values.pan}
            onChange={(e) => setField('pan', e.target.value.toUpperCase())}
            aria-invalid={Boolean(fieldErrors.pan)}
            aria-describedby={fieldDescribedBy('pan', fieldErrors.pan, true)}
            maxLength={10}
          />
        </Field>

        <Field id="city" label="City" required error={fieldErrors.city}>
          <Input
            id="city"
            name="city"
            autoComplete="address-level2"
            required
            value={values.city}
            onChange={(e) => setField('city', e.target.value)}
            aria-invalid={Boolean(fieldErrors.city)}
            aria-describedby={fieldDescribedBy('city', fieldErrors.city)}
          />
        </Field>

        <Field id="state" label="State" required error={fieldErrors.state}>
          <Select
            id="state"
            name="state"
            required
            value={values.state}
            onChange={(e) => setField('state', e.target.value)}
            aria-invalid={Boolean(fieldErrors.state)}
            aria-describedby={fieldDescribedBy('state', fieldErrors.state)}
          >
            <option value="">Select…</option>
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
            name="pincode"
            inputMode="numeric"
            autoComplete="postal-code"
            required
            value={values.pincode}
            onChange={(e) => setField('pincode', e.target.value)}
            aria-invalid={Boolean(fieldErrors.pincode)}
            aria-describedby={fieldDescribedBy('pincode', fieldErrors.pincode)}
            maxLength={6}
          />
        </Field>
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? 'Submitting…' : 'Submit application'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}
