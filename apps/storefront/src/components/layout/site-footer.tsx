import { Gift, ShieldCheck, Sparkles, Truck } from 'lucide-react'
import Link from 'next/link'
import { siteConfig } from '@/lib/site'

const PROMISES = [
  { icon: Truck, title: 'Pan-India delivery', text: 'Gift-wrapped and tracked to the door' },
  { icon: Sparkles, title: 'Made personal', text: 'Messages, engraving and custom designs' },
  { icon: ShieldCheck, title: 'Secure payments', text: 'UPI, cards and net banking' },
]

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-surface-muted">
      <div className="container-page grid gap-8 py-10 sm:grid-cols-3">
        {PROMISES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex gap-3">
            <Icon className="mt-0.5 size-5 text-primary" aria-hidden="true" />
            <div>
              <p className="font-medium">{title}</p>
              <p className="text-sm text-muted-foreground">{text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="container-page flex flex-col gap-3 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <Gift className="size-4" aria-hidden="true" />© {new Date().getFullYear()} {siteConfig.name}. {siteConfig.tagline}.
          </p>
          <nav aria-label="Footer" className="flex gap-4">
            <Link href="/products" className="hover:text-foreground">
              Shop
            </Link>
            <Link href="/account/orders" className="hover:text-foreground">
              Orders
            </Link>
            <Link href="/account" className="hover:text-foreground">
              Account
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
