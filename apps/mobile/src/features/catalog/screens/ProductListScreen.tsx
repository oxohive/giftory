import React, { useMemo, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { CatalogStackParamList } from '../../../navigation/types'
import { useTheme } from '../../../theme'
import { LoadingState } from '../../../components/ui/LoadingState'
import { ErrorState } from '../../../components/ui/ErrorState'
import { EmptyState } from '../../../components/ui/EmptyState'
import { useProducts } from '../hooks/useProducts'
import { useCategories } from '../hooks/useCategories'
import { useOccasions } from '../hooks/useOccasions'
import { ProductCard } from '../components/ProductCard'
import { ProductFilters, type ProductFiltersValue } from '../components/ProductFilters'
import { DEFAULT_PAGE_SIZE } from '../constants'
import type { ProductListParams } from '../../../lib/api/catalog'

type Props = NativeStackScreenProps<CatalogStackParamList, 'ProductList'>

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

  const { data, isLoading, isError, error, refetch } = useProducts(queryParams)
  const { data: categories } = useCategories()
  const { data: occasions } = useOccasions()

  const header = (
    <View>
      <ProductFilters
        value={filters}
        onChange={handleFilterChange}
        categories={categories ?? []}
        occasions={occasions ?? []}
      />
      {data ? (
        <Text
          style={[
            theme.typography.caption,
            { color: theme.colors.textMuted, paddingHorizontal: theme.spacing(2) },
          ]}
        >
          {data.total} {data.total === 1 ? 'result' : 'results'}
        </Text>
      ) : null}
    </View>
  )

  if (isLoading) {
    return <LoadingState label="Loading products..." />
  }

  if (isError) {
    return (
      <ErrorState
        message={error?.message ?? 'Failed to load products'}
        onRetry={() => refetch()}
      />
    )
  }

  if (!data || data.items.length === 0) {
    return (
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
      />
    )
  }

  return (
    <FlatList
      data={data.items}
      keyExtractor={(item) => item.id}
      numColumns={2}
      contentContainerStyle={{ padding: theme.spacing(2) }}
      columnWrapperStyle={styles.row}
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <ProductCard
          product={item}
          onPress={() => navigation.navigate('ProductDetail', { handle: item.handle })}
        />
      )}
    />
  )
}

const styles = StyleSheet.create({
  row: {
    justifyContent: 'space-between',
  },
  emptyContainer: {
    flexGrow: 1,
  },
})
