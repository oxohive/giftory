import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listCategories, type Category } from '../../../lib/api/catalog'
import type { ApiError } from '../../../lib/api/errors'

/** Category filter options for the Product List screen. */
export function useCategories(): UseQueryResult<Category[], ApiError> {
  return useQuery<Category[], ApiError>({
    queryKey: ['catalog', 'categories'],
    queryFn: listCategories,
  })
}
