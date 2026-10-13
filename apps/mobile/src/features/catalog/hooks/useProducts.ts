import { useQuery, keepPreviousData, type UseQueryResult } from '@tanstack/react-query'
import { listProducts, type ListEnvelope, type Product, type ProductListParams } from '../../../lib/api/catalog'
import type { ApiError } from '../../../lib/api/errors'

/**
 * Product List screen's data source. `params` is forwarded verbatim to
 * `listProducts()` (and therefore straight onto the `GET
 * /api/storefront/catalog/products` query string) — all filtering/sorting
 * happens server-side, never re-applied client-side, so results always match
 * what calling the API directly with the same params would return.
 *
 * Every filter change produces a different `queryKey`, which React Query
 * treats as a brand-new query with no cached data — without
 * `placeholderData`, the screen's `isLoading` check would go true on every
 * filter tap and replace the whole screen (filters included) with a loading
 * spinner, confirmed on a real device. `keepPreviousData` keeps the prior
 * results (and `isLoading`) steady while the new filter fetches in the
 * background; callers should check `isFetching` instead if they want a
 * lighter in-place indicator during that refetch.
 */
export function useProducts(params: ProductListParams): UseQueryResult<ListEnvelope<Product>, ApiError> {
  return useQuery<ListEnvelope<Product>, ApiError>({
    queryKey: ['catalog', 'products', params],
    queryFn: () => listProducts(params),
    placeholderData: keepPreviousData,
  })
}
