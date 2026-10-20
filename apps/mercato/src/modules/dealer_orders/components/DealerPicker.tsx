'use client'

import * as React from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@open-mercato/ui/primitives/select'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export type DealerOption = {
  id: string
  businessName: string
  city: string | null
  state: string | null
  capabilities: {
    productTypeCodes: string[]
    serviceableStates: string[]
    maxDailyCapacity: number
    minOrderQty: number
  }
}

/**
 * Approved-dealer picker for the assign/reassign dialogs.
 *
 * Per CONTRACT-HANDOFF.md ("eligible-dealer filtering question"), the
 * backend applies NO server-side eligibility check on `dealerProfileId` at
 * all — it accepts any dealer with zero validation against product types,
 * serviceable states, or capacity. FEAT-011 AC #2 ("show only dealers whose
 * capabilities include the order's product types") is explicitly a
 * client-side DISPLAY HINT per that doc, not an enforced filter: this
 * picker shows every approved dealer and surfaces each one's capability
 * summary so the admin can make an informed choice, but never removes a
 * dealer from the list or blocks a selection on it. See this task's
 * handoff for why the order's own line/product-type data was not
 * cross-referenced here (the injected tab's `context.record` does not
 * carry order lines — see `widget.client.tsx`'s doc comment).
 */
export function DealerPicker({
  dealers,
  isLoading,
  value,
  onChange,
  disabled,
}: {
  dealers: DealerOption[]
  isLoading: boolean
  value: string
  onChange: (dealerProfileId: string) => void
  disabled?: boolean
}) {
  const t = useT()
  const selected = dealers.find((d) => d.id === value) ?? null

  return (
    <div className="space-y-2">
      <Select value={value} onValueChange={onChange} disabled={disabled || isLoading}>
        <SelectTrigger id="dealer-order-assignment-dealer">
          <SelectValue
            placeholder={
              isLoading
                ? t('dealer_orders.admin.dealerPicker.loading', 'Loading dealers…')
                : t('dealer_orders.admin.dealerPicker.placeholder', 'Select an approved dealer')
            }
          />
        </SelectTrigger>
        <SelectContent>
          {dealers.length === 0 && !isLoading ? (
            <div className="p-2 text-sm text-muted-foreground">
              {t('dealer_orders.admin.dealerPicker.empty', 'No approved dealers found')}
            </div>
          ) : null}
          {dealers.map((dealer) => (
            <SelectItem key={dealer.id} value={dealer.id}>
              {dealer.businessName}
              {dealer.city ? ` — ${dealer.city}${dealer.state ? `, ${dealer.state}` : ''}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected ? (
        <p className="text-xs text-muted-foreground">
          {t('dealer_orders.admin.dealerPicker.capabilitiesHint', 'Capabilities (not enforced — informational only)')}:{' '}
          {selected.capabilities.productTypeCodes.length
            ? selected.capabilities.productTypeCodes.join(', ')
            : t('dealer_orders.admin.dealerPicker.noProductTypes', 'no product types declared')}
          {' · '}
          {selected.capabilities.serviceableStates.length
            ? selected.capabilities.serviceableStates.join(', ')
            : t('dealer_orders.admin.dealerPicker.noStates', 'no serviceable states declared')}
          {' · '}
          {t('dealer_orders.admin.dealerPicker.maxDaily', 'max {{count}}/day', { count: selected.capabilities.maxDailyCapacity })}
        </p>
      ) : null}
    </div>
  )
}
