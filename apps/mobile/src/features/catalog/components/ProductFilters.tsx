import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../../../theme'
import { Input } from '../../../components/ui/Input'
import type { Category, ProductListParams } from '../../../lib/api/catalog'
import type { Occasion } from '../../../lib/api/occasions'
import { RECIPIENT_TYPES, SORT_OPTIONS } from '../constants'
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
  categories: Category[]
  occasions: Occasion[]
}

/**
 * Search/category/price/occasion/recipient/giftOnly/sort filter controls for
 * the Product List screen. This component is purely presentational — every
 * change is pushed up via `onChange`, and the screen is the one that turns
 * `value` into `ProductListParams` for `useProducts()`. No filtering happens
 * here; it only edits the values the API query is built from.
 */
export function ProductFilters(props: ProductFiltersProps): JSX.Element {
  const { value, onChange, categories, occasions } = props
  const theme = useTheme()

  return (
    <View style={{ padding: theme.spacing(2) }}>
      <Input
        label="Search"
        value={value.search}
        onChangeText={(search) => onChange({ search })}
        placeholder="Search products"
        accessibilityLabel="Search products"
      />

      <View style={styles.priceRow}>
        <View style={styles.priceField}>
          <Input
            label="Min price"
            value={value.minPrice}
            onChangeText={(minPrice) => onChange({ minPrice })}
            keyboardType="numeric"
            placeholder="0"
          />
        </View>
        <View style={styles.priceField}>
          <Input
            label="Max price"
            value={value.maxPrice}
            onChangeText={(maxPrice) => onChange({ maxPrice })}
            keyboardType="numeric"
            placeholder="Any"
          />
        </View>
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

      {categories.length > 0 ? (
        <>
          <Text
            style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing(1.5) }]}
          >
            Category
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              <FilterChip
                label="All"
                selected={!value.categoryId}
                onPress={() => onChange({ categoryId: undefined })}
              />
              {categories.map((category) => (
                <FilterChip
                  key={category.id}
                  label={category.name}
                  selected={value.categoryId === category.id}
                  onPress={() => onChange({ categoryId: category.id })}
                />
              ))}
            </View>
          </ScrollView>
        </>
      ) : null}

      {occasions.length > 0 ? (
        <>
          <Text
            style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing(1.5) }]}
          >
            Occasion
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              <FilterChip
                label="All"
                selected={!value.occasion}
                onPress={() => onChange({ occasion: undefined })}
              />
              {occasions.map((occasion) => (
                <FilterChip
                  key={occasion.code}
                  label={occasion.label}
                  selected={value.occasion === occasion.code}
                  onPress={() => onChange({ occasion: occasion.code })}
                />
              ))}
            </View>
          </ScrollView>
        </>
      ) : null}

      <Text
        style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing(1.5) }]}
      >
        Recipient
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          <FilterChip
            label="All"
            selected={!value.recipient}
            onPress={() => onChange({ recipient: undefined })}
          />
          {RECIPIENT_TYPES.map((recipient) => (
            <FilterChip
              key={recipient.code}
              label={recipient.label}
              selected={value.recipient === recipient.code}
              onPress={() => onChange({ recipient: recipient.code })}
            />
          ))}
        </View>
      </ScrollView>

      <View style={styles.chipRow}>
        <FilterChip
          label="Gift-ready only"
          selected={value.giftOnly}
          onPress={() => onChange({ giftOnly: !value.giftOnly })}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  priceRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 12,
  },
  priceField: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
})
