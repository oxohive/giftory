'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

/**
 * App-wide providers. Only React Query lives here for now — session/auth state is TASK-04's
 * (lane B) to add, on top of this QueryClientProvider, so it doesn't need to touch this file.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: false, staleTime: 30_000 },
          mutations: { retry: false },
        },
      }),
  )
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
