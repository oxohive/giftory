'use client'

import { X } from 'lucide-react'
import { useId, useState, type KeyboardEvent } from 'react'
import { cn, Input } from '@gift/ui'

/**
 * Free-text tag input for `productTypeCodes`. There is deliberately no suggestion list and no
 * `<select>`/closed `TagsInput` here: `data/validators.ts`'s `capabilitiesUpsertSchema` validates
 * this field as `z.array(z.string().trim().min(1).max(100)).max(100)` — plain strings, no
 * `z.enum` — confirming the already-documented finding (restated in this task's own briefing,
 * and in the admin capability editor's own `CapabilitiesForm.tsx` comment) that this field is
 * genuinely free text with no canonical product-type registry anywhere in this schema. This
 * mirrors that admin editor's `allowCustomValues` convention for the identical field, built
 * locally here since `@gift/ui` has no shared `TagsInput` (only the admin-side
 * `@open-mercato/ui` package does, and that package is not a dependency of this app).
 */
export function ProductTypeTagsInput({
  value,
  onChange,
  disabled,
  error,
  describedBy,
}: {
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  error?: string
  describedBy?: string
}) {
  const [draft, setDraft] = useState('')
  const inputId = useId()

  function commitDraft() {
    const trimmed = draft.trim()
    setDraft('')
    if (!trimmed) return
    if (value.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return
    onChange([...value, trimmed])
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commitDraft()
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div
      className={cn(
        'flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-surface px-2 py-1.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring',
        error && 'border-danger',
      )}
    >
      {value.map((code, index) => (
        <span
          key={`${code}-${index}`}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
        >
          {code}
          {!disabled ? (
            <button
              type="button"
              onClick={() => removeAt(index)}
              aria-label={`Remove ${code}`}
              className="rounded-full hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          ) : null}
        </span>
      ))}
      <Input
        id={inputId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commitDraft}
        disabled={disabled}
        placeholder={value.length ? '' : 'Add a product type and press Enter'}
        aria-describedby={describedBy}
        className="h-7 flex-1 min-w-[10ch] border-0 bg-transparent px-1 focus-visible:outline-none"
      />
    </div>
  )
}
