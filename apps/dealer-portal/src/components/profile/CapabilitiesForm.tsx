'use client'

import { Field, Input } from '@gift/ui'
import { INDIAN_STATE_CODES, PRINTING_METHODS, PRINTING_METHOD_LABELS } from '@/lib/features/profile/constants'
import type { CapabilitiesFormValues, FieldErrors } from '@/lib/features/profile/types'
import { MultiSelectCheckboxGroup } from './MultiSelectCheckboxGroup'
import { ProductTypeTagsInput } from './ProductTypeTagsInput'

const PRINTING_METHOD_OPTIONS = PRINTING_METHODS.map((value) => ({ value, label: PRINTING_METHOD_LABELS[value] }))
const STATE_OPTIONS = INDIAN_STATE_CODES.map((value) => ({ value, label: value }))

/** The capability fields only — presentational and controlled, no fetch/mutation logic of its
 *  own (that lives in CapabilitiesEditView, which owns the save/refetch/conflict flow). */
export function CapabilitiesForm({
  values,
  onChange,
  errors,
  disabled,
}: {
  values: CapabilitiesFormValues
  onChange: (next: CapabilitiesFormValues) => void
  errors: FieldErrors
  disabled?: boolean
}) {
  function setField<K extends keyof CapabilitiesFormValues>(key: K, value: CapabilitiesFormValues[K]) {
    onChange({ ...values, [key]: value })
  }

  return (
    <div className="grid gap-5">
      <Field
        id="productTypeCodes"
        label="Product types"
        error={errors.productTypeCodes}
        hint="Free text — there is no fixed catalog yet. Press Enter or comma to add."
      >
        <ProductTypeTagsInput
          value={values.productTypeCodes}
          onChange={(next) => setField('productTypeCodes', next)}
          disabled={disabled}
          error={errors.productTypeCodes}
          describedBy={errors.productTypeCodes ? 'productTypeCodes-error' : undefined}
        />
      </Field>

      <Field id="printingMethods" label="Printing methods" error={errors.printingMethods}>
        <MultiSelectCheckboxGroup
          legend="Printing methods"
          options={PRINTING_METHOD_OPTIONS}
          value={values.printingMethods}
          onChange={(next) => setField('printingMethods', next)}
          disabled={disabled}
          describedBy={errors.printingMethods ? 'printingMethods-error' : undefined}
        />
      </Field>

      <Field id="serviceableStates" label="Serviceable states" error={errors.serviceableStates}>
        <MultiSelectCheckboxGroup
          legend="Serviceable states"
          options={STATE_OPTIONS}
          value={values.serviceableStates}
          onChange={(next) => setField('serviceableStates', next)}
          disabled={disabled}
          columns={3}
          describedBy={errors.serviceableStates ? 'serviceableStates-error' : undefined}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="maxDailyCapacity" label="Max daily capacity" required error={errors.maxDailyCapacity}>
          <Input
            id="maxDailyCapacity"
            type="number"
            inputMode="numeric"
            min={0}
            max={100000}
            value={values.maxDailyCapacity}
            onChange={(e) => setField('maxDailyCapacity', e.target.value === '' ? '' : Number(e.target.value))}
            disabled={disabled}
            required
          />
        </Field>
        <Field id="minOrderQty" label="Minimum order quantity" required error={errors.minOrderQty}>
          <Input
            id="minOrderQty"
            type="number"
            inputMode="numeric"
            min={1}
            max={10000}
            value={values.minOrderQty}
            onChange={(e) => setField('minOrderQty', e.target.value === '' ? '' : Number(e.target.value))}
            disabled={disabled}
            required
          />
        </Field>
      </div>
    </div>
  )
}
