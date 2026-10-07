'use client'

import { Gift, Menu, Search, ShoppingBag, User, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCustomer } from '@/lib/auth/use-customer'
import { useCart } from '@/lib/cart/cart-context'
import { siteConfig } from '@/lib/site'
import { cn } from '@/lib/utils'
import { ThemeToggle } from './theme-toggle'

const NAV = [
  { href: '/products', label: 'All gifts' },
  { href: '/products?occasion=birthday', label: 'Birthday' },
  { href: '/products?occasion=anniversary', label: 'Anniversary' },
  { href: '/products?occasion=corporate', label: 'Corporate' },
]

function SearchForm({ className, onDone }: { className?: string; onDone?: () => void }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const term = q.trim()
    router.push(term ? `/products?q=${encodeURIComponent(term)}` : '/products')
    onDone?.()
  }
  return (
    <form role="search" onSubmit={submit} className={cn('relative', className)}>
      <label htmlFor="site-search" className="sr-only">
        Search gifts
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        id="site-search"
        type="search"
        placeholder="Search gifts…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-10 pl-9"
      />
    </form>
  )
}

export function SiteHeader() {
  const { itemCount, ready } = useCart()
  const customer = useCustomer()
  const pathname = usePathname()
  // The menu is "open for a given path": navigating anywhere closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === pathname
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(open) : next
    setOpenAt(value ? pathname : null)
  }

  const accountLabel = customer.data ? `Account (${customer.data.user.displayName})` : 'Sign in'

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <div className="container-page flex h-16 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </Button>
        <Link href="/" className="flex items-center gap-2 font-display text-xl font-semibold">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Gift className="size-4" aria-hidden="true" />
          </span>
          {siteConfig.name}
        </Link>
        <nav aria-label="Primary" className="ml-6 hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-surface-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <SearchForm className="ml-auto hidden w-64 lg:block" />
        <div className="ml-auto flex items-center gap-1 lg:ml-2">
          <ThemeToggle />
          <Button asChild variant="ghost" size="icon">
            <Link href={customer.data ? '/account' : '/account/login'} aria-label={accountLabel} title={accountLabel}>
              <User aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon" className="relative">
            <Link href="/cart" aria-label={`Cart, ${ready ? itemCount : 0} items`}>
              <ShoppingBag aria-hidden="true" />
              {ready && itemCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground"
                >
                  {itemCount}
                </span>
              ) : null}
            </Link>
          </Button>
        </div>
      </div>
      {open ? (
        <div id="mobile-nav" className="border-t border-border bg-background md:hidden">
          <div className="container-page grid gap-3 py-4">
            <SearchForm onDone={() => setOpen(false)} />
            <nav aria-label="Mobile" className="grid">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-md px-2 py-3 font-medium hover:bg-surface-muted">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </header>
  )
}
