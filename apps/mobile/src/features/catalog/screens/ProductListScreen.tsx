import React, { useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import type { CatalogStackParamList } from '../../../navigation/types'
import { useTheme } from '../../../theme'
import { ErrorState } from '../../../components/ui/ErrorState'
import { EmptyState } from '../../../components/ui/EmptyState'
import { ScreenHeader } from '../../../components/ui/ScreenHeader'
import { useProducts } from '../hooks/useProducts'
import { useCategories } from '../hooks/useCategories'
import { useOccasions } from '../hooks/useOccasions'
import { ProductCard } from '../components/ProductCard'
import { ProductCardSkeleton } from '../components/ProductCardSkeleton'
import { ProductFilters, type ProductFiltersValue } from '../components/ProductFilters'
import { ProductFiltersSheet } from '../components/ProductFiltersSheet'
import { DEFAULT_PAGE_SIZE } from '../constants'
import type { ProductListParams } from '../../../lib/api/catalog'
import { classifyApiError } from '../../../lib/api/errors'
import { useSingleTapNavigation } from '../../../lib/useSingleTapNavigation'

type Props = NativeStackScreenProps<CatalogStackParamList, 'ProductList'>

// First-load placeholder grid: enough rows to fill a typical screen.
const SKELETON_PLACEHOLDERS = ['s1', 's2', 's3', 's4', 's5', 's6']

function parsePrice(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

/**
 * Relies on the app-wide `QueryClientProvider` mounted once in `App.tsx`
 * (TASK-09) — no local provider wrapper needed here.
 */
export default function ProductListScreen({ navigation, route }: Props): JSX.Element {
  const theme = useTheme()
  const params = route.params

  // NOTE: `CatalogStackParamList['ProductList']` names this nav param `category`
  // (a string), while `ProductListParams` (TASK-04's catalog.ts) names the
  // equivalent query param `categoryId`. There's no other category identifier
  // available on this route, so `params.category` is treated as a category id
  // here. Flagged for TASK-09 in case a different task passes a slug instead.
  const [filters, setFilters] = useState<ProductFiltersValue>({
    search: params?.search ?? '',
    categoryId: params?.category,
    occasion: params?.occasion,
    recipient: undefined,
    giftOnly: false,
    minPrice: '',
    maxPrice: '',
    sort: 'newest',
  })

  const handleFilterChange = (patch: Partial<ProductFiltersValue>) => {
    setFilters((prev) => ({ ...prev, ...patch }))
  }

  const queryParams: ProductListParams = useMemo(
    () => ({
      search: filters.search.trim() || undefined,
      categoryId: filters.categoryId,
      occasion: filters.occasion,
      recipient: filters.recipient,
      giftOnly: filters.giftOnly || undefined,
      minPrice: parsePrice(filters.minPrice),
      maxPrice: parsePrice(filters.maxPrice),
      sort: filters.sort,
      pageSize: DEFAULT_PAGE_SIZE,
    }),
    [filters],
  )

  const { data, isLoading, isFetching, isError, error, refetch } = useProducts(queryParams)
  const { data: categories } = useCategories()
  const { data: occasions } = useOccasions()
  const { guard } = useSingleTapNavigation()

  // Sheet lives once per screen; `ProductFilters`' compact "Filters" button
  // opens it via this ref (TASK-14 — see ProductFiltersSheet.tsx for why the
  // ref/present() pattern is used instead of a boolean visible prop).
  const filterSheetRef = useRef<BottomSheetModal>(null)

  const filtersSheet = (
    <ProductFiltersSheet
      ref={filterSheetRef}
      value={filters}
      onChange={handleFilterChange}
      categories={categories ?? []}
      occasions={occasions ?? []}
    />
  )

  // Products is reachable two ways: as the "Products" tab's own root (no
  // back needed) or pushed from Home via an occasion tile (back needed) —
  // `canGoBack()` reflects which is true at runtime for THIS instance.
  const screenHeader = (
    <ScreenHeader title="Products" onBack={navigation.canGoBack() ? guard(navigation.goBack) : undefined} />
  )

  const header = (
    <View>
      <ProductFilters
        value={filters}
        onChange={handleFilterChange}
        onOpenFilters={() => filterSheetRef.current?.present()}
      />
      {data ? (
        <View style={styles.resultsRow}>
          <Text
            style={[
              theme.typography.caption,
              { color: theme.colors.textMuted },
            ]}
          >
            {data.total} {data.total === 1 ? 'result' : 'results'}
          </Text>
          {isFetching ? (
            <ActivityIndicator
              size="small"
              color={theme.colors.textMuted}
              style={styles.resultsSpinner}
              accessibilityLabel="Updating results"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  )

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {screenHeader}
        <FlatList
          data={SKELETON_PLACEHOLDERS}
          keyExtractor={(item) => item}
          numColumns={2}
          contentContainerStyle={{ padding: theme.spacing(2) }}
          columnWrapperStyle={styles.row}
          ListHeaderComponent={header}
          renderItem={() => <ProductCardSkeleton />}
        />
        {filtersSheet}
      </View>
    )
  }

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {screenHeader}
        <ErrorState
          message={error ? classifyApiError(error).message : 'Failed to load products'}
          onRetry={() => refetch()}
        />
        {filtersSheet}
      </View>
    )
  }

  if (!data || data.items.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {screenHeader}
        <FlatList
          data={[]}
          keyExtractor={() => 'empty'}
          renderItem={() => null}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              title="No products match these filters"
              description="Try adjusting or clearing some filters."
            />
          }
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={() => refetch()} tintColor={theme.colors.primary} />
          }
        />
        {filtersSheet}
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {screenHeader}
      <FlatList
        data={data.items}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={{ padding: theme.spacing(2) }}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={() => refetch()} tintColor={theme.colors.primary} />
        }
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            onPress={guard(() => navigation.navigate('ProductDetail', { handle: item.handle }))}
          />
        )}
      />
      {filtersSheet}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  row: {
    justifyContent: 'space-between',
  },
  emptyContainer: {
    flexGrow: 1,
  },
  resultsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  resultsSpinner: {
    marginLeft: 8,
  },
})
