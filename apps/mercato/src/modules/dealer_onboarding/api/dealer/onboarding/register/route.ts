import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { dealerHandler, readJsonBody, parseOrThrow } from '../../../../lib/http'
import { dealerRegisterSchema } from '../../../../data/validators'
import { DEALER_REGISTER_COMMAND } from '../../../../lib/constants'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { dealerTag, registerRequestSchema, registerResponseSchema, commonDealerErrors } from '../../../openapi'

const registerWithOrgSchema = dealerRegisterSchema.extend({
  organizationId: z.string().uuid(),
})

export const metadata = {
  POST: {
    requireAuth: false,
    rateLimit: {
      points: 5,
      duration: 60 * 60,
      blockDuration: 60 * 60,
      keyPrefix: 'dealer-register',
    },
  },
}

export const POST = dealerHandler('dealer.register', async ({ req, container, translate }) => {
  const body = await readJsonBody(req)
  const parsed = parseOrThrow(registerWithOrgSchema, body, translate)

  // Resolve the platform tenant from the supplied marketplace organization ID.
  const em = container.resolve<EntityManager>('em')
  const { Organization } = await import('@open-mercato/core/modules/directory/data/entities')
  const org = await em.findOne(Organization, { id: parsed.organizationId, deletedAt: null }, { populate: ['tenant'] as never[] })
  if (!org) {
    return NextResponse.json(
      { error: translate('dealer_onboarding.errors.orgNotFound', 'Marketplace organization not found'), code: 'org_not_found' },
      { status: 404 },
    )
  }
  const tenantId =
    typeof org.tenant === 'string' ? org.tenant : (org.tenant as { id?: string } | null)?.id ?? null
  if (!tenantId) {
    return NextResponse.json(
      { error: translate('dealer_onboarding.errors.orgNotFound', 'Marketplace organization not found'), code: 'org_not_found' },
      { status: 404 },
    )
  }

  const commandBus = container.resolve<CommandBus>('commandBus')
  const ctx: CommandRuntimeContext = {
    container,
    auth: { tenantId, isSuperAdmin: true, orgId: parsed.organizationId, sub: 'system' } as CommandRuntimeContext['auth'],
    organizationScope: null,
    selectedOrganizationId: parsed.organizationId,
    organizationIds: [parsed.organizationId],
    systemActor: true,
  }

  const { result } = await commandBus.execute(DEALER_REGISTER_COMMAND, {
    input: {
      businessName: parsed.businessName,
      contactEmail: parsed.contactEmail,
      phone: parsed.phone,
      gstin: parsed.gstin,
      pan: parsed.pan,
      businessType: parsed.businessType,
      city: parsed.city,
      state: parsed.state,
      pincode: parsed.pincode,
      tenantId,
    },
    ctx,
  })
  const { profile } = result as { profile: { id: string } }

  return NextResponse.json(
    { id: profile.id, message: translate('dealer_onboarding.register.success', 'Registration submitted. Please check your email to verify your account.') },
    { status: 201 },
  )
})

export const openApi: OpenApiRouteDoc = {
  tag: dealerTag,
  summary: 'Submit dealer registration',
  methods: {
    POST: {
      summary: 'Register as a dealer',
      description:
        'Creates a pending dealer organization and sends a verification email. Unauthenticated. Pass the marketplace `organizationId` to identify the platform tenant.',
      tags: [dealerTag],
      body: registerRequestSchema,
      responses: [{ status: 201, description: 'Registration accepted', schema: registerResponseSchema }],
      errors: commonDealerErrors(),
    },
  },
}
