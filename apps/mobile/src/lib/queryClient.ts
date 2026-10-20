import { QueryClient } from '@tanstack/react-query'

/**
 * Single app-wide React Query client (TASK-09).
 *
 * TASK-05 (catalog) and TASK-06 (cart) each built their own local
 * `QueryClient` singleton (`catalogQueryClient` in
 * `src/features/catalog/lib/queryClient.tsx`, `cartQueryClient` in
 * `src/features/cart/lib/queryClient.tsx`) as a stand-in because no
 * app-wide provider existed yet. Both of those files/providers have been
 * removed in favor of this single instance, mounted once in `App.tsx` above
 * `RootTabNavigator`, so every feature's `useQuery`/`useMutation` calls share
 * one cache — critical for `useCart()` being callable from the catalog
 * (add-to-cart) and checkout screens without "No QueryClient set" crashes or
 * a split cache.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})
