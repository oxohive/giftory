'use client'

import { Menu, Package, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { cn } from '@gift/ui'
import { PortalNav } from './PortalNav'
import type { DealerRole } from './nav-items'

/**
 * The dealer portal's authenticated app shell: a persistent sidebar on desktop, a hamburger
 * drawer on mobile, both rendering the same PortalNav. Session resolution (and therefore a real
 * `role`) is TASK-04's to wire in; this component accepts `role` as a prop so it can be dropped
 * in without changing this file. `role` undefined/null shows every nav entry (see nav-items.ts).
 */
export function PortalShell({ role, children }: { role?: DealerRole | null; children: ReactNode }) {
  const pathname = usePathname()
  // "Open for this path" — navigating anywhere closes the drawer without a dedicated effect.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === pathname
  const setOpen = (next: boolean) => setOpenAt(next ? pathname : null)

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 lg:hidden">
        <button
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="portal-nav-mobile"
          onClick={() => setOpen(!open)}
          className="rounded-md p-2 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
        <Link href="/" className="flex items-center gap-2 font-semibold text-foreground">
          <Package className="size-5 text-primary" aria-hidden="true" />
          Partner Studio
        </Link>
        <span className="size-9" aria-hidden="true" />
      </header>

      {open ? (
        <div id="portal-nav-mobile" className="border-b border-border bg-surface px-4 py-3 lg:hidden">
          <PortalNav role={role} onNavigate={() => setOpen(false)} />
        </div>
      ) : null}

      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface px-4 py-6 lg:flex lg:flex-col lg:gap-6">
        <Link href="/" className="flex items-center gap-2 px-2 font-semibold text-foreground">
          <Package className="size-5 text-primary" aria-hidden="true" />
          Partner Studio
        </Link>
        <PortalNav role={role} />
      </aside>

      <main id="main" className={cn('min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10')}>{children}</main>
    </div>
  )
}
