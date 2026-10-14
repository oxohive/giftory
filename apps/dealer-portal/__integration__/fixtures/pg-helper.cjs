'use strict'

/**
 * Tiny CommonJS SQL helper for the dealer-marketplace-journey integration spec.
 *
 * Why this exists: the spec file lives under apps/dealer-portal, which has no `pg`
 * dependency of its own (it is a thin BFF frontend — no direct DB access in production).
 * `pg` IS a real dependency of apps/mercato. Rather than add a new dependency to this
 * app just for tests, this script is invoked as a separate `node` child process with
 * `NODE_PATH` pointed at apps/mercato's `node_modules` (NODE_PATH is a CommonJS-only
 * resolution fallback, which is why this file is `.cjs`, not `.mjs`/TS) and
 * `DATABASE_URL` pointed at the ephemeral test harness's own Postgres instance
 * (`process.env.DATABASE_URL`, set by `@open-mercato/cli`'s ephemeral runner for every
 * discovered integration spec — see `startEphemeralEnvironment` in
 * `node_modules/@open-mercato/cli/dist/lib/testing/integration.js`).
 *
 * Only used for the two things no real HTTP API can do in this sandbox:
 *   - creating a real "paid" sales_orders row (no live Stripe/Razorpay gateway available)
 *   - reading back DB state that has no dedicated read API (commission snapshot / ledger
 *     rows, to prove the full event-driven chain actually landed real rows in Postgres,
 *     not just that the HTTP call returned 2xx)
 *
 * Usage: node pg-helper.cjs <command> <jsonArgs>
 * Prints one line of JSON to stdout: { ok: true, result } or { ok: false, error }.
 */

const { Client } = require('pg')

async function main() {
  const [, , command, rawArgs] = process.argv
  const args = rawArgs ? JSON.parse(rawArgs) : {}
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    let result
    switch (command) {
      case 'resolve-tenant-org': {
        const tenantRow = await client.query('SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1')
        const tenantId = tenantRow.rows[0].id
        const orgRow = await client.query(
          'SELECT id FROM organizations WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1',
          [tenantId],
        )
        result = { tenantId, organizationId: orgRow.rows[0].id }
        break
      }
      case 'create-paid-order': {
        const { organizationId, tenantId, orderNumber, subtotalPaise } = args
        const idRow = await client.query('SELECT gen_random_uuid() AS id')
        const orderId = idRow.rows[0].id
        await client.query(
          `INSERT INTO sales_orders (id, organization_id, tenant_id, order_number, currency_code,
             payment_status, status, subtotal_net_amount, subtotal_gross_amount,
             grand_total_net_amount, grand_total_gross_amount, created_at, updated_at)
           VALUES ($1,$2,$3,$4,'INR','paid','confirmed',$5,$5,$5,$5, now(), now())`,
          [orderId, organizationId, tenantId, orderNumber, subtotalPaise],
        )
        result = { orderId }
        break
      }
      case 'delete-order': {
        await client.query('DELETE FROM sales_orders WHERE id = $1', [args.orderId])
        result = { deleted: true }
        break
      }
      case 'get-commission-snapshot': {
        const row = await client.query('SELECT * FROM order_commission_snapshots WHERE assignment_id = $1', [
          args.assignmentId,
        ])
        result = { rows: row.rows }
        break
      }
      case 'get-latest-ledger-entry': {
        const row = await client.query(
          `SELECT * FROM dealer_ledger_entries WHERE dealer_profile_id = $1 AND entry_type = $2
           ORDER BY created_at DESC LIMIT 1`,
          [args.dealerProfileId, args.entryType],
        )
        result = { rows: row.rows }
        break
      }
      default:
        throw new Error(`Unknown command: ${command}`)
    }
    process.stdout.write(JSON.stringify({ ok: true, result }))
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ ok: false, error: String(err && err.message || err) }))
  process.exitCode = 1
})
