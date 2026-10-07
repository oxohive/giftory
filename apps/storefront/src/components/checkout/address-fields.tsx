'use client'

import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { describedBy, Field } from '@/components/ui/field'
import { Input, Select } from '@/components/ui/input'
import { INDIAN_STATES, type AddressInput } from '@/lib/api/addresses'

type AddressErrors = FieldErrors<AddressInput> | undefined

/**
 * Indian address fields. `prefix` is the form path of the address object
 * (e.g. "address" in the checkout form or "" for a standalone address form).
 */
export function AddressFields<TPrefix extends string>({
  idPrefix,
  register,
  errors,
  prefix,
}: {
  idPrefix: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>
  errors: AddressErrors
  prefix: TPrefix
}) {
  const name = (field: keyof AddressInput) => (prefix ? `${prefix}.${field}` : field)
  const id = (field: string) => `${idPrefix}-${field}`
  const control = (field: keyof AddressInput, hint = false) => ({
    id: id(field),
    'aria-invalid': Boolean(errors?.[field]),
    'aria-describedby': describedBy(id(field), errors?.[field]?.message, hint),
  })

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" value="IN" {...register(name('country'))} />
      <Field id={id('fullName')} label="Full name" required error={errors?.fullName?.message}>
        <Input autoComplete="name" {...control('fullName')} {...register(name('fullName'))} />
      </Field>
      <Field id={id('phone')} label="Mobile number" required error={errors?.phone?.message} hint="For delivery updates">
        <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" {...control('phone', true)} {...register(name('phone'))} />
      </Field>
      <Field id={id('line1')} label="Flat, house no., building, street" required error={errors?.line1?.message} className="sm:col-span-2">
        <Input autoComplete="address-line1" {...control('line1')} {...register(name('line1'))} />
      </Field>
      <Field id={id('line2')} label="Area, landmark (optional)" error={errors?.line2?.message} className="sm:col-span-2">
        <Input autoComplete="address-line2" {...control('line2')} {...register(name('line2'))} />
      </Field>
      <Field id={id('city')} label="City" required error={errors?.city?.message}>
        <Input autoComplete="address-level2" {...control('city')} {...register(name('city'))} />
      </Field>
      <Field id={id('postalCode')} label="PIN code" required error={errors?.postalCode?.message}>
        <Input inputMode="numeric" autoComplete="postal-code" maxLength={6} {...control('postalCode')} {...register(name('postalCode'))} />
      </Field>
      <Field id={id('state')} label="State" required error={errors?.state?.message} className="sm:col-span-2">
        <Select autoComplete="address-level1" defaultValue="" {...control('state')} {...register(name('state'))}>
          <option value="" disabled>
            Choose a state
          </option>
          {INDIAN_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  )
}
