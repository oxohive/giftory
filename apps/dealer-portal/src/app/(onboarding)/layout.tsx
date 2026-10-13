import { Package } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Shell for the onboarding/KYC screens (registration, application status, document upload,
 * resubmission) — a wider centered card than the `(auth)` group's shell (these screens hold a
 * multi-field form and a document list, not a one-field login), written fresh rather than
 * importing `(auth)/layout.tsx` (outside this task's owned paths — a route group's `layout.tsx`
 * is also a reserved Next.js file, not an ordinary component meant to be imported from another
 * route tree). Visually consistent with `(auth)`'s shell on purpose (same brand mark/background),
 * no PortalShell/PortalNav — these pages exist for a caller who has not reached (or no longer
 * has) full portal access.
 */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-surface-muted px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-center gap-2 font-semibold text-foreground">
          <Package className="size-5 text-primary" aria-hidden="true" />
          Partner Studio
        </div>
        <main className="rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-8">{children}</main>
      </div>
    </div>
  )
}
