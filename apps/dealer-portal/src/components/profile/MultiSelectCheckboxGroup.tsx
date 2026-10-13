'use client'

import { Checkbox, cn } from '@gift/ui'

export interface CheckboxOption {
  value: string
  label: string
}

/**
 * Closed-enum multi-select, rendered as a fieldset of checkboxes rather than a dropdown — used
 * for `printingMethods` (5 options) and `serviceableStates` (37 options), both validated
 * server-side against a real `z.enum(...)` (see `data/validators.ts`'s `capabilitiesUpsertSchema`
 * and this app's `lib/features/profile/constants.ts`, copied from it verbatim). Mirrors the admin
 * capability editor's own convention for these two fields — a closed, enum-sourced control, never
 * a free-text field — the inverse of `ProductTypeTagsInput`, which is intentionally open because
 * that field has no enum behind it at all.
 */
export function MultiSelectCheckboxGroup({
  legend,
  options,
  value,
  onChange,
  disabled,
  columns = 2,
  describedBy,
}: {
  legend: string
  options: CheckboxOption[]
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  columns?: 2 | 3
  describedBy?: string
}) {
  const selected = new Set(value)

  function toggle(optionValue: string) {
    if (selected.has(optionValue)) {
      onChange(value.filter((v) => v !== optionValue))
    } else {
      onChange([...value, optionValue])
    }
  }

  return (
    <fieldset
      className="rounded-md border border-input bg-surface p-3"
      aria-describedby={describedBy}
      disabled={disabled}
    >
      <legend className="px-1 text-xs font-medium text-muted-foreground">{legend}</legend>
      <div className={cn('mt-1 grid gap-2', columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={selected.has(option.value)}
              onChange={() => toggle(option.value)}
              disabled={disabled}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
