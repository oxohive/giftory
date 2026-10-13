import { describe, expect, it, jest } from '@jest/globals'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID = 'bbbbbbbb-0000-4000-a000-000000000002'
const DEALER_PROFILE_ID = 'cccccccc-0000-4000-a000-000000000003'
const ASSIGNMENT_ID = 'dddddddd-0000-4000-a000-000000000004'
const CONTACT_EMAIL = 'dealer-owner@dealer.in'

const findOneMock = jest.fn()
jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: async () => ({
    resolve: (id: string) => {
      if (id === 'em') return { findOne: findOneMock }
      throw new Error(`Unknown service: ${id}`)
    },
  }),
}))

jest.mock('@/modules/dealer_onboarding/data/entities', () => ({
  DealerProfile: class MockDealerProfile {},
}))

import onDealerOrderAssigned from '../subscribers/notify-dealer-on-assignment'

type CapturedEmail = { to: string; subject: string; links: string[]; text: string }

async function withCapture(run: () => Promise<void>): Promise<CapturedEmail[]> {
  const capturePath = join(tmpdir(), `dealer-orders-email-capture-${randomUUID()}.jsonl`)
  const previousTestMode = process.env.OM_TEST_MODE
  const previousCapturePath = process.env.OM_TEST_EMAIL_CAPTURE_PATH
  process.env.OM_TEST_MODE = 'true'
  process.env.OM_TEST_EMAIL_CAPTURE_PATH = capturePath
  try {
    await run()
    const raw = await readFile(capturePath, 'utf8').catch(() => '')
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

const payload = {
  id: ASSIGNMENT_ID,
  orderId: 'order-1',
  dealerProfileId: DEALER_PROFILE_ID,
  tenantId: TENANT_ID,
  organizationId: ORG_ID,
  requiredBy: '2026-02-01',
  assignedBy: 'admin-1',
}

describe('notify-dealer-on-assignment — end-to-end order notification integration', () => {
  it('resolves the dealer\'s real contact email and sends through the real email pipeline, linking to the ASSIGNMENT id', async () => {
    findOneMock.mockResolvedValueOnce({ id: DEALER_PROFILE_ID, tenantId: TENANT_ID, contactEmail: CONTACT_EMAIL, deletedAt: null })

    const captured = await withCapture(() => onDealerOrderAssigned(payload, { resolve: () => undefined as never }))

    expect(captured).toHaveLength(1)
    const [email] = captured
    expect(email.to).toBe(CONTACT_EMAIL)
    expect(email.links).toHaveLength(1)
    const url = new URL(email.links[0])
    // Links to the assignment id, never the sales order id — see the
    // assignment-ID-vs-order-ID contract in commands/assignments.ts.
    expect(url.pathname).toBe(`/orders/${ASSIGNMENT_ID}`)
    expect(url.pathname).not.toContain(payload.orderId)
    expect(email.text).toContain('2026-02-01')
  })

  it('skips sending (and never throws) when the dealer profile no longer exists', async () => {
    findOneMock.mockResolvedValueOnce(null)
    const captured = await withCapture(() => onDealerOrderAssigned(payload, { resolve: () => undefined as never }))
    expect(captured).toHaveLength(0)
  })
})
