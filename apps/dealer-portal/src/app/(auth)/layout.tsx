import { Package } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Shared shell for every unauthenticated/transitional auth-state page (login, forgot-password,
 * password-setup, pending-KYC holding, access-denied, forbidden) — a centered card, no
 * PortalShell/PortalNav (those are for the approved-dealer portal only). Each page supplies its
 * own navigation affordances (sign-in link, sign-out, "back to dashboard") since the right one
 * varies by state — a single footer link here would be wrong for at least one of them.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-surface-muted px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 font-semibold text-foreground">
          <Package className="size-5 text-primary" aria-hidden="true" />
          Partner Studio
        </div>
        <main className="rounded-lg border border-border bg-surface p-6 shadow-sm">{children}</main>
      </div>
    </div>
  )
}
