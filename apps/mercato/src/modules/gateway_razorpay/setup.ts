import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { createCredentialsService } from '@open-mercato/core/modules/integrations/lib/credentials-service'
import { createIntegrationLogService } from '@open-mercato/core/modules/integrations/lib/log-service'
import { createIntegrationStateService } from '@open-mercato/core/modules/integrations/lib/state-service'
import { applyRazorpayEnvPreset } from './lib/preset'

const logger = createLogger('gateway_razorpay')

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['gateway_razorpay.view', 'gateway_razorpay.configure'],
    admin: ['gateway_razorpay.view', 'gateway_razorpay.configure'],
  },

  async onTenantCreated({ em, organizationId, tenantId }) {
    try {
      await applyRazorpayEnvPreset({
        credentialsService: createCredentialsService(em),
        integrationStateService: createIntegrationStateService(em),
        integrationLogService: createIntegrationLogService(em),
        scope: { tenantId, organizationId },
      })
    } catch (error) {
      logger.warn('Failed to apply Razorpay env preset during tenant setup', {
        error: error instanceof Error ? error.message : 'unknown',
      })
    }
  },
}

export default setup
