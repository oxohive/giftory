import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listOccasions, type Occasion } from '../../../lib/api/occasions'
import type { ApiError } from '../../../lib/api/errors'

/**
 * Home screen's "Shop by occasion" tiles.
 * `listOccasions()` only returns active occasions already (filtered
 * server-side), so no client-side `isActive` filtering is needed here.
 */
export function useOccasions(): UseQueryResult<Occasion[], ApiError> {
  return useQuery<Occasion[], ApiError>({
    queryKey: ['catalog', 'occasions'],
    queryFn: listOccasions,
  })
}
