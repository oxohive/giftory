import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getProductByHandle, type ProductDetail } from '../../../lib/api/catalog'
import type { ApiError } from '../../../lib/api/errors'

/**
 * Product Detail screen's data source. The `gift` block returned inline by
 * `getProductByHandle()` is used directly (per TASK-05's spec: prefer it over
 * a separate `GET /api/gift_catalog/storefront/profiles` call) — it's always
 * populated (with defaults) by TASK-04's `toProductDetail()` mapper, so no
 * secondary profiles fetch is needed.
 */
export function useProductDetail(handle: string): UseQueryResult<ProductDetail, ApiError> {
  return useQuery<ProductDetail, ApiError>({
    queryKey: ['catalog', 'product', handle],
    queryFn: () => getProductByHandle(handle),
    enabled: Boolean(handle),
  })
}
