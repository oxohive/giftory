import type { Metadata } from 'next'
import Link from 'next/link'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'
import { validateResetToken } from '@/lib/auth/backend'

export const metadata: Metadata = { title: 'Set your password' }

/**
 * Destination for the installed password-setup/reset token flow (@open-mercato/core's `auth`
 * module `PasswordReset` mechanism — shared verbatim between a brand-new dealer's invite email
 * and an existing dealer's forgot-password email).
 *
 * Known gap, not fixable from this app's owned paths: the core auth module's generic
 * `auth.users.create`/invite-email path (used by dealer registration and by
 * `dealer_org_rbac`'s staff invite) always builds its link from the backend's own `APP_URL`
 * (`getSecurityEmailBaseUrl()`, apps/mercato's own base URL — verified by reading
 * @open-mercato/core/src/modules/auth/commands/users.ts's `sendInviteToUser` and
 * @open-mercato/shared/src/lib/url.ts's `getSecurityEmailBaseUrl`, which reads only
 * `process.env.APP_URL`, never the request), so a real dealer invite/first-password email always
 * links to apps/mercato's own `/reset/[token]` page today, not this one. Only the forgot-password
 * flow started FROM this app (`ForgotPasswordForm` posting through this app's own proxy) is
 * guaranteed to land a dealer back here, since `toSecurityEmailUrl` only validates the request's
 * origin, it never derives the link target from it either. This page exists so the flow is
 * complete and correct for that path, and ready to go if a follow-up backend task threads a
 * portal-aware base URL (`DEALER_PORTAL_BASE_URL`, already used correctly by the KYC
 * approval/rejection notification emails — see dealer_onboarding/lib/notificationEmails.ts)
 * through user-creation/invite too. Flagged in this task's handoff, not fixed here — that file
 * lives in the published @open-mercato/core package, outside every path this task owns.
 */
export default async function ResetTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const valid = await validateResetToken(token)

  if (!valid) {
    return (
      <div className="grid gap-4 text-center">
        <h1 className="text-lg font-semibold text-foreground">Link expired</h1>
        <p className="text-sm text-muted-foreground">This link is no longer valid. Request a new one below.</p>
        <Link href="/forgot-password" className="text-sm text-primary underline-offset-4 hover:underline">
          Request a new link
        </Link>
      </div>
    )
  }

  return <ResetPasswordForm token={token} />
}
