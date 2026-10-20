import { Migration } from '@mikro-orm/migrations'

export class Migration20261020123600_payouts extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "dealer_ledger_entries" ALTER COLUMN "created_by" DROP NOT NULL;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "dealer_ledger_entries" ALTER COLUMN "created_by" SET NOT NULL;
    `)
  }
}
