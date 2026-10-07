import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { ensureDefaultGiftOccasions } from './lib/seeds'
import { seedGiftDemoCatalog } from './lib/demoSeed'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseArgs(rest: string[]): Record<string, string> {
  const args: Record<string, string> = {}
  for (let i = 0; i < rest.length; i += 1) {
    const part = rest[i]
    if (!part || !part.startsWith('--')) continue
    const [rawKey, rawValue] = part.slice(2).split('=')
    if (rawValue !== undefined) {
      args[rawKey] = rawValue
    } else if (rest[i + 1] && !rest[i + 1]!.startsWith('--')) {
      args[rawKey] = rest[i + 1]!
      i += 1
    }
  }
  return args
}

function readScope(rest: string[], usage: string): { tenantId: string; organizationId: string } | null {
  const args = parseArgs(rest)
  const tenantId = String(args.tenantId ?? args.tenant ?? '')
  const organizationId = String(args.organizationId ?? args.org ?? args.orgId ?? '')
  if (!UUID_PATTERN.test(tenantId) || !UUID_PATTERN.test(organizationId)) {
    console.error(usage)
    return null
  }
  return { tenantId, organizationId }
}

async function withContainer<T>(run: (container: Awaited<ReturnType<typeof createRequestContainer>>) => Promise<T>): Promise<T> {
  const container = await createRequestContainer()
  try {
    return await run(container)
  } finally {
    const disposable = container as unknown as { dispose?: () => Promise<void> }
    if (typeof disposable.dispose === 'function') await disposable.dispose()
  }
}

const seedOccasionsCommand: ModuleCli = {
  command: 'seed-occasions',
  async run(rest) {
    const scope = readScope(rest, 'Usage: mercato gift_catalog seed-occasions --tenant <tenantId> --org <organizationId>')
    if (!scope) return
    const inserted = await withContainer(async (container) => {
      const em = (container.resolve('em') as EntityManager).fork()
      return ensureDefaultGiftOccasions(em, scope)
    })
    console.log(`Gift occasions seeded for organization ${scope.organizationId} (${inserted} inserted)`)
  },
}

const seedDemoCommand: ModuleCli = {
  command: 'seed-demo',
  async run(rest) {
    const scope = readScope(rest, 'Usage: mercato gift_catalog seed-demo --tenant <tenantId> --org <organizationId>')
    if (!scope) return
    console.log(`Seeding demo gift catalog for organization ${scope.organizationId}…`)
    const report = await withContainer((container) =>
      seedGiftDemoCatalog(container, scope, (message) => console.log(message)),
    )
    console.log(
      [
        'Demo gift catalog ready:',
        `  occasions inserted: ${report.occasionsInserted}`,
        `  categories created: ${report.categoriesCreated}`,
        `  products created: ${report.productsCreated} (already present: ${report.productsExisting})`,
        `  variants created: ${report.variantsCreated}`,
        `  prices created: ${report.pricesCreated}`,
        `  gift profiles created: ${report.profilesCreated}`,
      ].join('\n'),
    )
  },
}

const commands: ModuleCli[] = [seedOccasionsCommand, seedDemoCommand]

export default commands
