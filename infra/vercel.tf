locals {
  vercel_team  = var.vercel_team_id != "" ? var.vercel_team_id : null
  api_base_url = "https://${var.api_subdomain}.${var.domain_name}"
  site_url     = "https://${var.subdomain}.${var.domain_name}"
}

# ─── Custom domain ────────────────────────────────────────────────────────────

resource "vercel_project_domain" "storefront" {
  project_id = var.vercel_project_id
  team_id    = local.vercel_team
  domain     = "${var.subdomain}.${var.domain_name}"
}

# ─── Environment variables ────────────────────────────────────────────────────

resource "vercel_project_environment_variable" "api_base_url" {
  project_id = var.vercel_project_id
  team_id    = local.vercel_team
  key        = "NEXT_PUBLIC_API_BASE_URL"
  value      = local.api_base_url
  target     = ["production", "preview", "development"]
}

resource "vercel_project_environment_variable" "razorpay_key_id" {
  project_id = var.vercel_project_id
  team_id    = local.vercel_team
  key        = "NEXT_PUBLIC_RAZORPAY_KEY_ID"
  value      = var.razorpay_key_id
  target     = ["production", "preview", "development"]
}

resource "vercel_project_environment_variable" "site_url" {
  project_id = var.vercel_project_id
  team_id    = local.vercel_team
  key        = "NEXT_PUBLIC_SITE_URL"
  value      = local.site_url
  target     = ["production", "preview", "development"]
}

resource "vercel_project_environment_variable" "mercato_internal_url" {
  project_id = var.vercel_project_id
  team_id    = local.vercel_team
  key        = "MERCATO_INTERNAL_API_BASE_URL"
  value      = local.api_base_url
  target     = ["production", "preview", "development"]
}

# ─── Dealer portal (apps/dealer-portal) ───────────────────────────────────────
#
# Unlike the storefront project above (created manually, then imported into
# Terraform by its existing project ID), this project does not exist yet —
# `vercel_project` here creates it from scratch, linked to this repo with its
# root directory set to apps/dealer-portal, mirroring how storefront is
# connected via Vercel's own GitHub integration.
#
# NOT YET APPLIED: this was authored without a Vercel token scoped to create
# projects, and without `tofu`/`terraform` available to run `validate`/`plan`
# locally — review the vercel_project resource schema against the installed
# `vercel/vercel` provider version before applying for the first time.

resource "vercel_project" "dealer_portal" {
  name            = var.dealer_portal_project_name
  team_id         = local.vercel_team
  framework       = "nextjs"
  root_directory  = "apps/dealer-portal"
  build_command   = "npm run build"
  install_command = "npm install"

  git_repository = {
    type = "github"
    repo = var.github_repository
  }
}

resource "vercel_project_domain" "dealer_portal" {
  project_id = vercel_project.dealer_portal.id
  team_id    = local.vercel_team
  domain     = "${var.dealer_subdomain}.${var.domain_name}"
}

resource "vercel_project_environment_variable" "dealer_portal_api_base_url" {
  project_id = vercel_project.dealer_portal.id
  team_id    = local.vercel_team
  # Server-only (no NEXT_PUBLIC_ prefix) — read only by the BFF proxy
  # (apps/dealer-portal/src/app/api/om/[...path]/route.ts), never sent to the browser.
  key    = "OM_API_BASE_URL"
  value  = local.api_base_url
  target = ["production", "preview", "development"]
}
