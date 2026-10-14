import { Migration } from '@mikro-orm/migrations';

export class Migration20261013232854_dealer_onboarding extends Migration {

  override name = 'Migration20261013232854';

  override up(): void | Promise<void> {
    this.addSql(`create table "dealer_kyc_documents" ("id" uuid not null default gen_random_uuid(), "dealer_profile_id" uuid not null, "tenant_id" uuid not null, "document_type" text not null, "storage_key" text not null, "file_name" text not null, "file_size_bytes" int not null, "mime_type" text not null, "uploaded_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dealer_kyc_docs_profile_idx" on "dealer_kyc_documents" ("dealer_profile_id", "document_type", "deleted_at");`);

    this.addSql(`create table "dealer_profiles" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "business_name" text not null, "contact_email" text not null, "phone" text not null, "gstin" text null, "pan" text null, "business_type" text not null, "city" text not null, "state" text not null, "pincode" text not null, "kyc_status" text not null default 'pending_verification', "rejection_reason" text null, "reviewed_by" uuid null, "reviewed_at" timestamptz null, "approved_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dealer_profiles_status_idx" on "dealer_profiles" ("tenant_id", "kyc_status");`);
    this.addSql(`create index "dealer_profiles_scope_idx" on "dealer_profiles" ("tenant_id", "organization_id", "deleted_at");`);
  }

}
