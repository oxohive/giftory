import React, { forwardRef, useCallback, useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet'
import { useTheme } from '../../../theme'
import { Input } from '../../../components/ui/Input'
import type { Category } from '../../../lib/api/catalog'
import type { Occasion } from '../../../lib/api/occasions'
import { RECIPIENT_TYPES } from '../constants'
import { FilterChip } from './FilterChip'
import type { ProductFiltersValue } from './ProductFilters'

export interface ProductFiltersSheetProps {
  value: ProductFiltersValue
  onChange: (patch: Partial<ProductFiltersValue>) => void
  categories: Category[]
  occasions: Occasion[]
}

/**
 * Bottom-sheet content for the Product List filters (TASK-14). Holds every
 * control that used to live inline in `ProductFilters` *except* search and
 * sort, which stay visible on the main screen. Presentational only — same
 * `value`/`onChange` contract as before, just relocated behind a "Filters"
 * trigger so the product grid isn't pushed ~1200px down the screen.
 *
 * Rendered once from `ProductListScreen`; opened via `ref.current?.present()`
 * from the compact `ProductFilters` bar. Requires `<GestureHandlerRootView>`
 * + `<BottomSheetModalProvider>` around the app root — see this task's final
 * report for the exact `App.tsx` snippet (not wired here; `App.tsx` is a
 * shared touch-point with TASK-10/TASK-12 in this wave).
 */
export const ProductFiltersSheet = forwardRef<BottomSheetModal, ProductFiltersSheetProps>(
  function ProductFiltersSheet(props, ref) {
    const { value, onChange, categories, occasions } = props
    const theme = useTheme()

    const snapPoints = useMemo(() => ['75%'], [])

    const renderBackdrop = useCallback(
      (backdropProps: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...backdropProps}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior="close"
        />
      ),
      [],
    )

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={{
          backgroundColor: theme.colors.surface,
          borderTopLeftRadius: theme.radii.lg,
          borderTopRightRadius: theme.radii.lg,
        }}
        handleIndicatorStyle={{ backgroundColor: theme.colors.border }}
        accessibilityLabel="Product filters"
      >
        <BottomSheetScrollView contentContainerStyle={{ padding: theme.spacing(2) }}>
          <Text style={[theme.typography.subheading, { color: theme.colors.text }]}>Filters</Text>

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
        </BottomSheetScrollView>
      </BottomSheetModal>
    )
  },
)

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
