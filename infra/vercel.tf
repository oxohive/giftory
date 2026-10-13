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
