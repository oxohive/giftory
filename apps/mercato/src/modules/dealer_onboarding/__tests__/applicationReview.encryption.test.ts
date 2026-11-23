import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals'
import { randomBytes, randomUUID } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { registerEntityIds } from '@open-mercato/shared/lib/encryption/entityIds'
import { TenantDataEncryptionService } from '@open-mercato/shared/lib/encryption/tenantDataEncryptionService'
import type { KmsService, TenantDek } from '@open-mercato/shared/lib/encryption/kms'
import { DealerKycDocument, DealerProfile } from '../data/entities'
import { DEALER_PROFILE_ENTITY_ID } from '../lib/constants'
import { findApplicationForReview } from '../lib/applicationReview'
import defaultEncryptionMaps from '../encryption'

/**
 * Known gap 5 — "admin application detail passes the dealer profile id as the
 * encryption-key scope when decrypting gstin/pan".
 *
 * These tests drive the REAL Open Mercato encryption service
 * (`TenantDataEncryptionService` + the decrypt path used by
 * `findOneWithDecryption`) with only the storage edges faked: an in-memory KMS
 * and a fake SQL connection that answers `encryption_maps` lookups. A value is
 * encrypted exactly the way the ORM subscriber does it on WRITE (with the
 * dealer row's own tenant + organization), then read back through the admin
 * detail helper.
 */

const ROOT_ORG = 'eeeeeeee-0000-4000-a000-000000000001'

type MapRow = { tenantId: string | null; organizationId: string | null }

function makeKms(): KmsService {
  const deks = new Map<string, TenantDek>()
  const issue = async (tenantId: string): Promise<TenantDek> => {
    const existing = deks.get(tenantId)
    if (existing) return existing
    const dek = { tenantId, key: randomBytes(32).toString('base64'), fetchedAt: Date.now() }
    deks.set(tenantId, dek)
    return dek
  }
  return { isHealthy: () => true, getTenantDek: issue, createTenantDek: issue }
}

/** Fake EntityManager: answers the encryption-map SQL plus the two ORM reads the helper makes. */
function makeEm(opts: { mapRows: MapRow[]; profile: DealerProfile | null; documents?: DealerKycDocument[] }) {
  const mapLookups: unknown[][] = []
  const em = {
    getConnection: () => ({
      execute: async (sql: string, params: unknown[] = []) => {
        if (!/from encryption_maps/i.test(sql)) return []
        mapLookups.push(params)
        const [entityId, tenantId, organizationId] = params as [string, string | null, string | null]
        const hit = opts.mapRows.find(
          (row) =>
            entityId === DEALER_PROFILE_ENTITY_ID &&
            row.tenantId === (tenantId ?? null) &&
            row.organizationId === (organizationId ?? null),
        )
        return hit ? [{ entity_id: entityId, fields_json: [{ field: 'gstin' }, { field: 'pan' }] }] : []
      },
    }),
    getMetadata: () => ({ find: () => undefined, get: () => undefined }),
    findOne: jest.fn(async (entity: unknown, where: Record<string, unknown>, _options?: unknown) => {
      if (entity !== DealerProfile) throw new Error('findOne called with an unexpected entity class')
      const p = opts.profile
      if (!p) return null
      if (where.id !== p.id || where.tenantId !== p.tenantId || where.deletedAt !== null) return null
      return p
    }),
    find: jest.fn(async (entity: unknown, where: Record<string, unknown>) => {
      if (entity !== DealerKycDocument) throw new Error('find called with an unexpected entity class')
      return (opts.documents ?? []).filter(
        (d) => d.dealerProfileId === where.dealerProfileId && d.tenantId === where.tenantId && !d.deletedAt,
      )
    }),
  }
  return { em, mapLookups }
}

const DEALER_PROFILE_META = {
  className: 'DealerProfile',
  name: 'DealerProfile',
  tableName: 'dealer_profiles',
  collection: 'dealer_profiles',
  properties: {
    id: { name: 'id', type: 'uuid' },
    gstin: { name: 'gstin', type: 'text' },
    pan: { name: 'pan', type: 'text' },
  },
}

function makeProfile(tenantId: string, organizationId: string, values: { gstin: string | null; pan: string | null }) {
  const profile = {
    id: randomUUID(),
    organizationId,
    tenantId,
    businessName: 'Dealer',
    contactEmail: 'dealer@test.in',
    phone: '+91 99999 00000',
    businessType: 'pvt_ltd',
    city: 'Mumbai',
    state: 'MH',
    pincode: '400001',
    kycStatus: 'under_review',
    deletedAt: null,
    ...values,
  } as DealerProfile
  // What MikroORM attaches to a managed entity; the decrypt path reads it to resolve the entity id.
  Object.defineProperty(profile, '__meta', { value: DEALER_PROFILE_META, enumerable: false })
  return profile
}

const GSTIN = '27AAPFU0939F1ZV'
const PAN = 'AAPFU0939F'

let previousEncryptionFlag: string | undefined

beforeAll(() => {
  previousEncryptionFlag = process.env.TENANT_DATA_ENCRYPTION
  process.env.TENANT_DATA_ENCRYPTION = 'yes'
  // Same shape the generator writes to .mercato/generated/entities.ids.generated.ts.
  registerEntityIds({
    dealer_onboarding: {
      dealer_profile: 'dealer_onboarding:dealer_profile',
      dealer_kyc_document: 'dealer_onboarding:dealer_kyc_document',
    },
  })
})

afterAll(() => {
  if (previousEncryptionFlag === undefined) delete process.env.TENANT_DATA_ENCRYPTION
  else process.env.TENANT_DATA_ENCRYPTION = previousEncryptionFlag
})

/** Encrypt like the ORM subscriber's beforeCreate: scope = the row's OWN tenant + organization. */
async function encryptLikeWritePath(service: TenantDataEncryptionService, profile: DealerProfile) {
  const encrypted = await service.encryptEntityPayload(
    DEALER_PROFILE_ENTITY_ID,
    { gstin: profile.gstin, pan: profile.pan },
    profile.tenantId,
    profile.organizationId,
  )
  profile.gstin = encrypted.gstin as string
  profile.pan = encrypted.pan as string
}

describe('encryption map declaration', () => {
  it('declares GSTIN/PAN under the entity id the generator registers for DealerProfile (singular)', () => {
    expect(DEALER_PROFILE_ENTITY_ID).toBe('dealer_onboarding:dealer_profile')
    expect(defaultEncryptionMaps).toEqual([
      { entityId: DEALER_PROFILE_ENTITY_ID, fields: [{ field: 'gstin' }, { field: 'pan' }] },
    ])
  })

  const generatedIds = join(__dirname, '..', '..', '..', '..', '.mercato', 'generated', 'entities.ids.generated.ts')
  const runIfGenerated = existsSync(generatedIds) ? it : it.skip
  runIfGenerated('matches the id in the generated entity-id registry (run `yarn generate` first)', () => {
    const source = readFileSync(generatedIds, 'utf8')
    expect(source).toContain(`"dealer_profile": "${DEALER_PROFILE_ENTITY_ID}"`)
  })
})

describe('findApplicationForReview — GSTIN/PAN decryption scope (known gap 5)', () => {
  it('decrypts values written under a map scoped to the dealer organization', async () => {
    const tenantId = randomUUID()
    const dealerOrg = randomUUID()
    const profile = makeProfile(tenantId, dealerOrg, { gstin: GSTIN, pan: PAN })
    const { em, mapLookups } = makeEm({ mapRows: [{ tenantId, organizationId: dealerOrg }], profile })
    const service = new TenantDataEncryptionService(em as never, { kms: makeKms() })

    await encryptLikeWritePath(service, profile)
    expect(profile.gstin).not.toBe(GSTIN)
    expect(String(profile.gstin).endsWith(':v1')).toBe(true)

    const result = await findApplicationForReview(em as never, tenantId, profile.id, { encryptionService: service })

    expect(result?.profile.gstin).toBe(GSTIN)
    expect(result?.profile.pan).toBe(PAN)
    // Every map lookup used the dealer's own organization, never the profile id.
    for (const params of mapLookups) {
      expect(params[2]).not.toBe(profile.id)
    }
    expect(mapLookups.some((params) => params[1] === tenantId && params[2] === dealerOrg)).toBe(true)
  })

  it('decrypts values written under a tenant-wide map (organization_id NULL)', async () => {
    const tenantId = randomUUID()
    const dealerOrg = randomUUID()
    const profile = makeProfile(tenantId, dealerOrg, { gstin: GSTIN, pan: PAN })
    const { em } = makeEm({ mapRows: [{ tenantId, organizationId: null }], profile })
    const service = new TenantDataEncryptionService(em as never, { kms: makeKms() })

    await encryptLikeWritePath(service, profile)
    const result = await findApplicationForReview(em as never, tenantId, profile.id, { encryptionService: service })

    expect(result?.profile.gstin).toBe(GSTIN)
    expect(result?.profile.pan).toBe(PAN)
  })

  it('illustrates the bug class: a profile-id "organization" scope misses the dealer-org map and leaves ciphertext', async () => {
    const tenantId = randomUUID()
    const dealerOrg = randomUUID()
    const profile = makeProfile(tenantId, dealerOrg, { gstin: GSTIN, pan: PAN })
    const { em } = makeEm({ mapRows: [{ tenantId, organizationId: dealerOrg }], profile })
    const service = new TenantDataEncryptionService(em as never, { kms: makeKms() })
    await encryptLikeWritePath(service, profile)

    const wrongScope = await service.decryptEntityPayload(
      DEALER_PROFILE_ENTITY_ID,
      { gstin: profile.gstin, pan: profile.pan },
      tenantId,
      profile.id,
    )
    expect(wrongScope.gstin).toBe(profile.gstin)
    expect(wrongScope.gstin).not.toBe(GSTIN)
  })

  it('still returns legacy PLAINTEXT rows unchanged once a map is active (no data becomes unreadable)', async () => {
    const tenantId = randomUUID()
    const dealerOrg = randomUUID()
    // Written while the map could not match (wrong entity id) => stored as plaintext.
    const profile = makeProfile(tenantId, dealerOrg, { gstin: GSTIN, pan: PAN })
    const { em } = makeEm({ mapRows: [{ tenantId, organizationId: null }], profile })
    const service = new TenantDataEncryptionService(em as never, { kms: makeKms() })

    const result = await findApplicationForReview(em as never, tenantId, profile.id, { encryptionService: service })

    expect(result?.profile.gstin).toBe(GSTIN)
    expect(result?.profile.pan).toBe(PAN)
  })

  it('queries the profile tenant-scoped with the DealerProfile entity class and tenant-scopes the documents', async () => {
    const tenantId = randomUUID()
    const dealerOrg = randomUUID()
    const profile = makeProfile(tenantId, dealerOrg, { gstin: null, pan: null })
    const documents = [
      { id: randomUUID(), dealerProfileId: profile.id, tenantId, deletedAt: null },
      { id: randomUUID(), dealerProfileId: profile.id, tenantId: randomUUID(), deletedAt: null },
      { id: randomUUID(), dealerProfileId: profile.id, tenantId, deletedAt: new Date() },
    ] as DealerKycDocument[]
    const { em } = makeEm({ mapRows: [], profile, documents })
    const service = new TenantDataEncryptionService(em as never, { kms: makeKms() })

    const result = await findApplicationForReview(em as never, tenantId, profile.id, { encryptionService: service })

    expect(em.findOne).toHaveBeenCalledWith(DealerProfile, { id: profile.id, tenantId, deletedAt: null }, undefined)
    expect(em.find).toHaveBeenCalledWith(DealerKycDocument, { dealerProfileId: profile.id, tenantId, deletedAt: null })
    expect(result?.documents.map((d) => d.id)).toEqual([documents[0].id])
  })

  it('returns null for an application in another tenant', async () => {
    const tenantId = randomUUID()
    const profile = makeProfile(tenantId, randomUUID(), { gstin: GSTIN, pan: PAN })
    const { em } = makeEm({ mapRows: [], profile })
    const service = new TenantDataEncryptionService(em as never, { kms: makeKms() })

    const result = await findApplicationForReview(em as never, randomUUID(), profile.id, { encryptionService: service })

    expect(result).toBeNull()
    expect(em.find).not.toHaveBeenCalled()
  })
})

describe('why activation needs a tenant-wide map', () => {
  it('a map seeded only for the root (marketplace) organization does NOT cover dealer rows', async () => {
    // Tenant setup seeds module maps for (tenant, root org). Every dealer has its own
    // organization, so the write path finds no map for (tenant, dealer org) and stores plaintext.
    const tenantId = randomUUID()
    const dealerOrg = randomUUID()
    const profile = makeProfile(tenantId, dealerOrg, { gstin: GSTIN, pan: PAN })
    const { em } = makeEm({ mapRows: [{ tenantId, organizationId: ROOT_ORG }], profile })
    const service = new TenantDataEncryptionService(em as never, { kms: makeKms() })

    await encryptLikeWritePath(service, profile)

    expect(profile.gstin).toBe(GSTIN)
    expect(profile.pan).toBe(PAN)
  })
})
