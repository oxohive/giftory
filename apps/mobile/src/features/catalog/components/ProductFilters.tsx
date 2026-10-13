import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../../../theme'
import { Input } from '../../../components/ui/Input'
import { Button } from '../../../components/ui/Button'
import type { ProductListParams } from '../../../lib/api/catalog'
import { SORT_OPTIONS } from '../constants'
import { FilterChip } from './FilterChip'

export interface ProductFiltersValue {
  search: string
  categoryId?: string
  occasion?: string
  recipient?: string
  giftOnly: boolean
  minPrice: string
  maxPrice: string
  sort: NonNullable<ProductListParams['sort']>
}

export interface ProductFiltersProps {
  value: ProductFiltersValue
  onChange: (patch: Partial<ProductFiltersValue>) => void
  /** Opens the filters bottom sheet (`ProductFiltersSheet`) — owned by the screen. */
  onOpenFilters: () => void
}

/**
 * Compact filter bar for the Product List screen (TASK-14): search box +
 * sort chips stay inline since they're used on every visit, while
 * category/occasion/recipient/price/gift-only now live in
 * `ProductFiltersSheet`, opened via the "Filters" button below. Purely
 * presentational — every change is still pushed up via `onChange`; the
 * screen turns `value` into `ProductListParams` for `useProducts()`.
 */
export function ProductFilters(props: ProductFiltersProps): JSX.Element {
  const { value, onChange, onOpenFilters } = props
  const theme = useTheme()

  // Count of non-default filters that now live in the sheet (category,
  // occasion, recipient, price range, gift-only). Search and sort are
  // excluded — they're already visible inline, not hidden behind the button.
  const activeFilterCount =
    (value.categoryId ? 1 : 0) +
    (value.occasion ? 1 : 0) +
    (value.recipient ? 1 : 0) +
    (value.giftOnly ? 1 : 0) +
    (value.minPrice.trim() !== '' ? 1 : 0) +
    (value.maxPrice.trim() !== '' ? 1 : 0)

  const filtersLabel = activeFilterCount > 0 ? `Filters (${activeFilterCount} active)` : 'Filters'

  return (
    <View style={{ padding: theme.spacing(2) }}>
      <Input
        label="Search"
        value={value.search}
        onChangeText={(search) => onChange({ search })}
        placeholder="Search products"
        accessibilityLabel="Search products"
      />

      <View style={styles.filtersRow}>
        <Button
          title={filtersLabel}
          variant="secondary"
          onPress={onOpenFilters}
          accessibilityLabel={`${filtersLabel}, opens filter options`}
        />
      </View>

      <Text
        style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing(1.5) }]}
      >
        Sort by
      </Text>
      <View style={styles.chipRow}>
        {SORT_OPTIONS.map((option) => (
          <FilterChip
            key={option.value}
            label={option.label}
            selected={value.sort === option.value}
            onPress={() => onChange({ sort: option.value })}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  filtersRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
})
