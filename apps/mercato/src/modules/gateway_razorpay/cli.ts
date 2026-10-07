import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import type { CredentialsService } from '@open-mercato/core/modules/integrations/lib/credentials-service'
import type { IntegrationLogService } from '@open-mercato/core/modules/integrations/lib/log-service'
import type { IntegrationStateService } from '@open-mercato/core/modules/integrations/lib/state-service'
import { applyRazorpayEnvPreset, readRazorpayEnvPreset } from './lib/preset'

function parseArgs(args: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    if (key.includes('=')) {
      const [name, value] = key.split('=')
      result[name] = value
      continue
    }
    const next = args[i + 1]
    if (next && !next.startsWith('--')) {
      result[key] = next
      i += 1
      continue
    }
    result[key] = true
  }
  return result
}

function printHelp(): void {
  console.log('Usage: yarn mercato gateway_razorpay configure-from-env --tenant <tenantId> --org <organizationId> [--force]')
  console.log('')
  console.log('Required env vars (OM_INTEGRATION_RAZORPAY_* aliases also accepted):')
  console.log('  RAZORPAY_KEY_ID')
  console.log('  RAZORPAY_KEY_SECRET')
  console.log('  RAZORPAY_WEBHOOK_SECRET')
  console.log('')
  console.log('Optional env vars:')
  console.log('  RAZORPAY_MODE (test|live, inferred from the key id prefix when omitted)')
  console.log('  RAZORPAY_ENABLED')
  console.log('  RAZORPAY_FORCE_PRECONFIGURE')
}

const configureFromEnvCommand: ModuleCli = {
  command: 'configure-from-env',
  async run(rest) {
    const args = parseArgs(rest)
    const tenantId = String(args.tenantId ?? args.tenant ?? '')
    const organizationId = String(args.organizationId ?? args.orgId ?? args.org ?? '')
    const force = args.force === true

    if (!tenantId || !organizationId) {
      printHelp()
      return
    }

    let preset: ReturnType<typeof readRazorpayEnvPreset>
    try {
      preset = readRazorpayEnvPreset()
    } catch (error) {
      console.error(error instanceof Error ? error.message : '[gateway_razorpay] Invalid Razorpay env preset')
      process.exitCode = 1
      return
    }
    if (!preset) {
      console.error('[gateway_razorpay] No Razorpay env preset was found.')
      printHelp()
      process.exitCode = 1
      return
    }

    const container = await createRequestContainer()
    try {
      const result = await applyRazorpayEnvPreset({
        credentialsService: container.resolve('integrationCredentialsService') as CredentialsService,
        integrationStateService: container.resolve('integrationStateService') as IntegrationStateService,
        integrationLogService: container.resolve('integrationLogService') as IntegrationLogService,
        scope: { tenantId, organizationId },
        force,
      })
      if (result.status === 'skipped') {
        console.log(`[gateway_razorpay] Skipped: ${result.reason}`)
        return
      }
      console.log(`[gateway_razorpay] Razorpay credentials were configured from env. enabled=${String(result.enabled)} mode=${result.mode}`)
    } catch (error) {
      console.error(`[gateway_razorpay] ${error instanceof Error ? error.message : 'Unknown Razorpay preset error'}`)
      process.exitCode = 1
    } finally {
      const disposable = container as unknown as { dispose?: () => Promise<void> }
      if (typeof disposable.dispose === 'function') {
        await disposable.dispose()
      }
    }
  },
}

const helpCommand: ModuleCli = {
  command: 'help',
  async run() {
    printHelp()
  },
}

const cliCommands: ModuleCli[] = [configureFromEnvCommand, helpCommand]

export default cliCommands
