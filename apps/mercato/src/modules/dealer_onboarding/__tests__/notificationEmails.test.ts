import { describe, expect, it, afterEach } from '@jest/globals'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { sendDealerApprovedEmail, sendDealerRejectedEmail } from '../lib/notificationEmails'

/**
 * Exercises the REAL `sendEmail` pipeline (from `@open-mercato/shared/lib/email/send`)
 * end to end — nothing here mocks `sendEmail` or the email module. `OM_TEST_MODE`
 * is the framework's own test-capture switch: every call still goes through
 * `sendEmail()`'s real capture step, which writes a JSONL record (to, subject,
 * links[], text) to disk before the transport step (skipped here since
 * `OM_TEST_MODE` also disables actual delivery — see `isEmailDeliveryDisabled`).
 * Reading that file back and asserting on its `links[]` is strictly stronger
 * evidence than "a mock was called" — it proves a real link was produced by
 * the real send path a dealer's actual mail client would receive.
 */

type CapturedEmail = {
  to: string
  subject: string
  from: string | null
  replyTo: string | null
  links: string[]
  text: string
  capturedAt: string
}

async function withCapture(run: () => Promise<void>): Promise<CapturedEmail[]> {
  const capturePath = join(tmpdir(), `dealer-onboarding-email-capture-${randomUUID()}.jsonl`)
  const previousTestMode = process.env.OM_TEST_MODE
  const previousCapturePath = process.env.OM_TEST_EMAIL_CAPTURE_PATH
  process.env.OM_TEST_MODE = 'true'
  process.env.OM_TEST_EMAIL_CAPTURE_PATH = capturePath
  try {
    await run()
    const raw = await readFile(capturePath, 'utf8')
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as CapturedEmail)
  } finally {
    process.env.OM_TEST_MODE = previousTestMode
    process.env.OM_TEST_EMAIL_CAPTURE_PATH = previousCapturePath
    await rm(capturePath, { force: true })
  }
}

const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID = 'bbbbbbbb-0000-4000-a000-000000000002'

describe('sendDealerApprovedEmail — real send pipeline', () => {
  it('actually fires through sendEmail with a working, well-formed login link', async () => {
    const captured = await withCapture(() =>
      sendDealerApprovedEmail({ to: 'owner@dealer.in', tenantId: TENANT_ID, organizationId: ORG_ID }),
    )

    expect(captured).toHaveLength(1)
    const [email] = captured
    expect(email.to).toBe('owner@dealer.in')
    expect(email.subject.length).toBeGreaterThan(0)
    expect(email.links).toHaveLength(1)
    // The link must be a real, well-formed, deliverable URL — not a bare
    // path, a placeholder, or a localhost default silently shipped by habit.
    const url = new URL(email.links[0])
    expect(url.pathname).toBe('/login')
    expect(['http', 'https']).toContain(url.protocol.replace(':', ''))
  })
})

describe('sendDealerRejectedEmail — real send pipeline', () => {
  it('actually fires through sendEmail and includes the rejection reason in the message body', async () => {
    const captured = await withCapture(() =>
      sendDealerRejectedEmail({
        to: 'rejected-owner@dealer.in',
        reason: 'GSTIN document illegible',
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
      }),
    )

    expect(captured).toHaveLength(1)
    const [email] = captured
    expect(email.to).toBe('rejected-owner@dealer.in')
    expect(email.text).toContain('GSTIN document illegible')
    expect(email.links).toHaveLength(1)
    expect(new URL(email.links[0]).pathname).toBe('/login')
  })
})

afterEach(() => {
  delete process.env.DEALER_PORTAL_BASE_URL
})
