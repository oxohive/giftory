import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listProducts, type ListEnvelope, type Product, type ProductListParams } from '../../../lib/api/catalog'
import type { ApiError } from '../../../lib/api/errors'

/**
 * Product List screen's data source. `params` is forwarded verbatim to
 * `listProducts()` (and therefore straight onto the `GET
 * /api/storefront/catalog/products` query string) — all filtering/sorting
 * happens server-side, never re-applied client-side, so results always match
 * what calling the API directly with the same params would return.
 */
export function useProducts(params: ProductListParams): UseQueryResult<ListEnvelope<Product>, ApiError> {
  return useQuery<ListEnvelope<Product>, ApiError>({
    queryKey: ['catalog', 'products', params],
    queryFn: () => listProducts(params),
  })
}
