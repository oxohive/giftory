locals {
  vercel_team = var.vercel_team_id != "" ? var.vercel_team_id : null
}

resource "vercel_project_environment_variable" "api_base_url" {
  project_id = var.vercel_project_id
  team_id    = local.vercel_team
  key        = "NEXT_PUBLIC_API_BASE_URL"
  value      = "http://${aws_lb.main.dns_name}"
  target = ["production", "preview", "development"]
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
  value      = "https://giftory-storefront.vercel.app"
  target     = ["production", "preview", "development"]
}

resource "vercel_project_environment_variable" "mercato_internal_url" {
  project_id = var.vercel_project_id
  team_id    = local.vercel_team
  key        = "MERCATO_INTERNAL_API_BASE_URL"
  value      = "http://${aws_lb.main.dns_name}"
  target     = ["production", "preview", "development"]
}
