'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { customerApi, type CustomerProfile } from '@/lib/api/customer'
import { ApiError } from '@/lib/api/http'

export const CUSTOMER_QUERY_KEY = ['customer', 'profile'] as const

/** Current shopper profile, or `null` when signed out. */
export function useCustomer() {
  return useQuery<CustomerProfile | null>({
    queryKey: CUSTOMER_QUERY_KEY,
    queryFn: async () => {
      try {
        return await customerApi.profile()
      } catch (error) {
        if (error instanceof ApiError && error.isUnauthorized) return null
        throw error
      }
    },
    staleTime: 60_000,
    retry: (count, error) => !(error instanceof ApiError && error.status < 500 && error.status > 0) && count < 2,
  })
}

/** Redirects to the login page when the shopper is signed out. */
export function useRequireCustomer() {
  const query = useCustomer()
  const router = useRouter()
  useEffect(() => {
    if (query.isSuccess && query.data === null) {
      const next = typeof window !== 'undefined' ? window.location.pathname : '/account'
      router.replace(`/account/login?next=${encodeURIComponent(next)}`)
    }
  }, [query.isSuccess, query.data, router])
  return query
}

export function useInvalidateCustomer() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: CUSTOMER_QUERY_KEY })
}
