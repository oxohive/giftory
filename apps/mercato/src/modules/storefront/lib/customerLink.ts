import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { isUniqueViolation } from '@open-mercato/shared/lib/crud/errors'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { CustomerEntity } from '@open-mercato/core/modules/customers/data/entities'
import { CustomerUser } from '@open-mercato/core/modules/customer_accounts/data/entities'
import { StorefrontCustomerLink } from '../data/entities'
import { emitStorefrontEvent } from '../events'
import type { StorefrontScope } from './scope'
import { executeCommand, systemCommandContext } from './system'

const logger = createLogger('storefront').child({ component: 'customer-link' })

/**
 * G8: every customer account (and every guest order) is attached to a CRM
 * person in the `customers` module.
 *
 * - The person is found by e-mail, else created through `customers.people.create`.
 * - The account → person link is stored in `storefront_customer_links`. The
 *   native `customer_accounts:auto-link-crm-reverse` subscriber reacts to the
 *   `customers.person.created` event and also sets `CustomerUser.personEntityId`;
 *   this module never writes customer_accounts tables itself.
 * - `CustomerUser.customerEntityId` is the *company* link in Open Mercato and is
 *   deliberately left alone (B2C shoppers have no company).
 *
 * Person lookup by e-mail mirrors the native auto-link: CRM e-mails are
 * encrypted at rest without a lookup hash, so up to `PERSON_SCAN_LIMIT`
 * people are decrypted and compared.
 */
const PERSON_SCAN_LIMIT = 500

export type PersonSeed = { email: string; displayName?: string | null; phone?: string | null }

function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase()
  return trimmed ? trimmed : null
}

/** `+91XXXXXXXXXX` for Indian mobiles; anything else is dropped (CRM validates phones). */
export function normalizeIndianPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/[\s-]/g, '')
  const match = /^(?:\+91)?([6-9]\d{9})$/.exec(digits)
  return match ? `+91${match[1]}` : null
}

export function splitDisplayName(displayName: string | null | undefined, email: string): { firstName: string; lastName: string; displayName: string } {
  const cleaned = (displayName ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const fallback = email.split('@')[0]?.slice(0, 120) || 'Customer'
  const name = cleaned || fallback
  const parts = name.split(' ')
  const firstName = (parts[0] ?? fallback).slice(0, 120)
  const lastName = (parts.slice(1).join(' ') || '-').slice(0, 120)
  return { firstName, lastName, displayName: name }
}

async function personExists(em: EntityManager, scope: StorefrontScope, personId: string): Promise<boolean> {
  const person = await findOneWithDecryption(
    em,
    CustomerEntity,
    { id: personId, tenantId: scope.tenantId, organizationId: scope.organizationId, kind: 'person', deletedAt: null } as FilterQuery<CustomerEntity>,
    undefined,
    scope,
  )
  return Boolean(person)
}

export async function findPersonByEmail(em: EntityManager, scope: StorefrontScope, email: string): Promise<string | null> {
  const needle = normalizeEmail(email)
  if (!needle) return null
  const people = await findWithDecryption(
    em,
    CustomerEntity,
    { tenantId: scope.tenantId, organizationId: scope.organizationId, kind: 'person', deletedAt: null } as FilterQuery<CustomerEntity>,
    { limit: PERSON_SCAN_LIMIT, orderBy: { createdAt: 'asc' } } as never,
    scope,
  )
  const match = people.find((person) => normalizeEmail(person.primaryEmail) === needle)
  return match ? String(match.id) : null
}

async function createPerson(container: AppContainer, scope: StorefrontScope, seed: PersonSeed): Promise<string> {
  const email = normalizeEmail(seed.email)!
  const names = splitDisplayName(seed.displayName, email)
  const phone = normalizeIndianPhone(seed.phone)
  const result = await executeCommand<Record<string, unknown>, { entityId: string }>(
    container,
    'customers.people.create',
    {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      displayName: names.displayName,
      firstName: names.firstName,
      lastName: names.lastName,
      primaryEmail: email,
      ...(phone ? { primaryPhone: phone } : {}),
      source: 'storefront',
    },
    systemCommandContext(container, scope),
  )
  return String(result.entityId)
}

/** Find the CRM person for an e-mail, creating one when none exists. */
export async function findOrCreatePerson(container: AppContainer, scope: StorefrontScope, seed: PersonSeed): Promise<string | null> {
  const email = normalizeEmail(seed.email)
  if (!email) return null
  const em = (container.resolve('em') as EntityManager).fork()
  const existing = await findPersonByEmail(em, scope, email)
  if (existing) return existing
  return createPerson(container, scope, { ...seed, email })
}

async function readLink(em: EntityManager, scope: StorefrontScope, customerUserId: string) {
  return em.findOne(StorefrontCustomerLink, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    customerUserId,
  } as FilterQuery<StorefrontCustomerLink>)
}

async function saveLink(em: EntityManager, scope: StorefrontScope, customerUserId: string, personEntityId: string): Promise<string> {
  const existing = await readLink(em, scope, customerUserId)
  if (existing) {
    if (existing.personEntityId !== personEntityId) {
      existing.personEntityId = personEntityId
      await em.flush()
    }
    return existing.personEntityId
  }
  try {
    em.create(StorefrontCustomerLink, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      customerUserId,
      personEntityId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await em.flush()
    return personEntityId
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    // A concurrent request linked the account first; its person wins.
    em.clear()
    const winner = await readLink(em, scope, customerUserId)
    return winner?.personEntityId ?? personEntityId
  }
}

/**
 * Person id already linked to a customer account, without creating anything:
 * the storefront link first, then the native `CustomerUser.personEntityId`.
 */
export async function readLinkedPersonId(em: EntityManager, scope: StorefrontScope, customerUserId: string): Promise<string | null> {
  const link = await readLink(em, scope, customerUserId)
  if (link) return link.personEntityId
  const user = await findOneWithDecryption(
    em,
    CustomerUser,
    { id: customerUserId, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null } as FilterQuery<CustomerUser>,
    undefined,
    scope,
  )
  return user?.personEntityId ? String(user.personEntityId) : null
}

/**
 * Ensure a customer account is linked to a CRM person (find or create) and
 * return the person id. Idempotent; safe to call from subscribers and from
 * order placement.
 */
export async function ensureCustomerPerson(
  container: AppContainer,
  scope: StorefrontScope,
  account: { customerUserId: string; email?: string | null; displayName?: string | null; phone?: string | null },
): Promise<string | null> {
  const em = (container.resolve('em') as EntityManager).fork()
  const link = await readLink(em, scope, account.customerUserId)
  if (link && (await personExists(em, scope, link.personEntityId))) return link.personEntityId

  const user = await findOneWithDecryption(
    em,
    CustomerUser,
    { id: account.customerUserId, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null } as FilterQuery<CustomerUser>,
    undefined,
    scope,
  )
  if (!user) return null

  let personId: string | null = null
  if (user.personEntityId && (await personExists(em, scope, String(user.personEntityId)))) {
    personId = String(user.personEntityId)
  }
  const email = normalizeEmail(user.email ?? account.email)
  if (!personId && email) {
    personId = await findPersonByEmail(em, scope, email)
    if (!personId) {
      personId = await createPerson(container, scope, {
        email,
        displayName: user.displayName ?? account.displayName ?? null,
        phone: account.phone ?? null,
      })
    }
  }
  if (!personId) return null
  const linked = await saveLink(em, scope, account.customerUserId, personId)
  if (!link) {
    await emitStorefrontEvent('storefront.customer.linked', {
      customerUserId: account.customerUserId,
      personEntityId: linked,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    }).catch((err: unknown) => logger.warn('Failed to emit storefront.customer.linked', { err }))
  }
  return linked
}
