'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LogOut, MapPin, Package, User } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { StateMessage } from '@/components/state-message'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { customerApi, type CustomerProfile } from '@/lib/api/customer'
import { CUSTOMER_QUERY_KEY, useRequireCustomer } from '@/lib/auth/use-customer'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/account', label: 'Profile', icon: User },
  { href: '/account/orders', label: 'Orders', icon: Package },
  { href: '/account/addresses', label: 'Addresses', icon: MapPin },
]

/** Layout + auth guard for signed-in account pages. */
export function AccountShell({ title, children }: { title: string; children: (profile: CustomerProfile) => ReactNode }) {
  const customer = useRequireCustomer()
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  const logout = useMutation({
    mutationFn: customerApi.logout,
    onSettled: async () => {
      queryClient.setQueryData(CUSTOMER_QUERY_KEY, null)
      await queryClient.invalidateQueries()
      router.replace('/')
    },
  })

  if (customer.isError) {
    return (
      <div className="container-page py-12">
        <StateMessage
          kind="error"
          title="We couldn’t load your account"
          action={
            <Button variant="outline" onClick={() => customer.refetch()}>
              Try again
            </Button>
          }
        >
          {customer.error instanceof Error ? customer.error.message : 'Please try again.'}
        </StateMessage>
      </div>
    )
  }

  if (!customer.data) {
    return (
      <div className="container-page grid gap-4 py-8" aria-busy="true">
        <span className="sr-only" role="status">
          Loading your account…
        </span>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="container-page py-8">
      <p className="text-sm text-muted-foreground">Hello, {customer.data.user.displayName}</p>
      <h1 className="mb-6 text-3xl font-semibold">{title}</h1>
      <div className="grid gap-8 md:grid-cols-[14rem_1fr]">
        <nav aria-label="Account" className="flex gap-1 overflow-x-auto md:flex-col">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/account' ? pathname === href : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium hover:bg-surface-muted',
                  active ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden="true" /> {label}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium text-muted-foreground hover:bg-surface-muted"
          >
            <LogOut className="size-4" aria-hidden="true" /> Sign out
          </button>
        </nav>
        <div className="min-w-0">{children(customer.data)}</div>
      </div>
    </div>
  )
}
