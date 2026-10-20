'use client'

import { cn } from '@gift/ui'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { visibleNavItems, type DealerRole } from './nav-items'

export function PortalNav({
  role,
  className,
  onNavigate,
}: {
  /** `null`/`undefined` while the session is still resolving — see visibleNavItems. */
  role?: DealerRole | null
  className?: string
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const items = visibleNavItems(role)
  return (
    <nav aria-label="Dealer portal" className={cn('grid gap-1', className)}>
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`))
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-surface-muted hover:text-foreground',
              active && 'bg-secondary text-secondary-foreground hover:bg-secondary',
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
