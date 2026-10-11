locals {
  ssm_prefix = "/${var.app_name}/${var.environment}"
}

resource "aws_ssm_parameter" "database_url" {
  name  = "${local.ssm_prefix}/DATABASE_URL"
  type  = "SecureString"
  value = var.database_url
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "${local.ssm_prefix}/JWT_SECRET"
  type  = "SecureString"
  value = var.jwt_secret
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "auth_secret" {
  name  = "${local.ssm_prefix}/AUTH_SECRET"
  type  = "SecureString"
  value = var.auth_secret
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "tenant_encryption_key" {
  name  = "${local.ssm_prefix}/TENANT_DATA_ENCRYPTION_FALLBACK_KEY"
  type  = "SecureString"
  value = var.tenant_encryption_key
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "razorpay_key_id" {
  name  = "${local.ssm_prefix}/RAZORPAY_KEY_ID"
  type  = "SecureString"
  value = var.razorpay_key_id
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "razorpay_key_secret" {
  name  = "${local.ssm_prefix}/RAZORPAY_KEY_SECRET"
  type  = "SecureString"
  value = var.razorpay_key_secret
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "razorpay_webhook_secret" {
  name  = "${local.ssm_prefix}/RAZORPAY_WEBHOOK_SECRET"
  type  = "SecureString"
  value = var.razorpay_webhook_secret
  tags  = local.common_tags
}
