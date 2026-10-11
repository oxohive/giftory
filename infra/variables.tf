variable "region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "aws_profile" {
  description = "AWS CLI profile to use"
  type        = string
  default     = "admin-sso"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}

variable "app_name" {
  description = "Application name (used as prefix for all resources)"
  type        = string
  default     = "giftory"
}

variable "mercato_image_tag" {
  description = "Docker image tag to deploy (updated by CodeBuild)"
  type        = string
  default     = "latest"
}

variable "idle_timeout_minutes" {
  description = "Minutes of zero traffic before scaling ECS to zero"
  type        = number
  default     = 30
}

# Secrets — set in terraform.tfvars (gitignored)
variable "database_url" {
  description = "Supabase DATABASE_URL connection string"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT signing secret"
  type        = string
  sensitive   = true
}

variable "auth_secret" {
  description = "Auth session secret"
  type        = string
  sensitive   = true
}

variable "tenant_encryption_key" {
  description = "Tenant data encryption fallback key"
  type        = string
  sensitive   = true
}

variable "razorpay_key_id" {
  description = "Razorpay key ID (rzp_test_... or rzp_live_...)"
  type        = string
  sensitive   = true
}

variable "razorpay_key_secret" {
  description = "Razorpay key secret"
  type        = string
  sensitive   = true
}

variable "razorpay_webhook_secret" {
  description = "Razorpay webhook validation secret"
  type        = string
  sensitive   = true
}

variable "github_pat" {
  description = "GitHub Personal Access Token for CodeBuild webhook (needs repo + admin:repo_hook scopes)"
  type        = string
  sensitive   = true
}

variable "vercel_api_token" {
  description = "Vercel API token (Account Settings → Tokens)"
  type        = string
  sensitive   = true
}

variable "vercel_project_id" {
  description = "Vercel project ID for the storefront (Project Settings → General)"
  type        = string
}

variable "vercel_team_id" {
  description = "Vercel team ID (leave empty for personal account)"
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Root domain managed in Porkbun (e.g. oxohive.com)"
  type        = string
  default     = "oxohive.com"
}

variable "subdomain" {
  description = "Storefront subdomain served by Vercel (e.g. giftory.dev)"
  type        = string
  default     = "giftory.dev"
}

variable "api_subdomain" {
  description = "Backend API subdomain served by ALB (e.g. api.giftory.dev)"
  type        = string
  default     = "api.giftory.dev"
}

variable "porkbun_api_key" {
  description = "Porkbun API key (Account → API Access)"
  type        = string
  sensitive   = true
}

variable "porkbun_secret_key" {
  description = "Porkbun secret API key"
  type        = string
  sensitive   = true
}
