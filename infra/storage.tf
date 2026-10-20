# ─── KYC document storage (S3) ─────────────────────────────────────────────
#
# apps/mercato had zero durable file storage before this: uploaded KYC
# documents were written to the ECS Fargate task's local disk, which is wiped
# on every scale-to-zero cycle (30 min idle) or redeploy. This bucket replaces
# that with real, persistent, encrypted storage.
#
# Auth mode: the installed @open-mercato/storage-s3 package's env-var
# bootstrap (`yarn mercato storage_s3 configure-from-env`) only supports
# explicit access-key credentials, not the AWS SDK's "ambient" / IAM-task-role
# mode (confirmed by reading its source — lib/preset.ts hard-codes
# `authMode: 'access_keys'` and throws if accessKeyId/secretAccessKey are
# missing). So this uses a dedicated, narrowly-scoped IAM user instead of
# widening the ECS task role — the user can only touch this one bucket.

locals {
  storage_bucket_name = "${var.app_name}-${var.environment}-kyc-documents"
}

resource "aws_s3_bucket" "kyc_documents" {
  bucket = local.storage_bucket_name
  tags   = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "kyc_documents" {
  bucket = aws_s3_bucket.kyc_documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "kyc_documents" {
  bucket = aws_s3_bucket.kyc_documents.id
  versioning_configuration {
    status = "Enabled"
  }
}

# SSE-KMS (not the default SSE-S3) so access to these PII-bearing documents
# leaves an auditable trail in CloudTrail via key-usage events, not just S3
# access logs. The AWS-managed `aws/s3` key keeps this free of a dedicated
# KMS key's management overhead at this scale — swap for a customer-managed
# key if stricter key rotation/access control is ever required.
resource "aws_s3_bucket_server_side_encryption_configuration" "kyc_documents" {
  bucket = aws_s3_bucket.kyc_documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# Backstop retention: India-specific research found GST records must be kept
# 6 years (CGST Act §36) and KYC/identity records 5 years after the
# relationship ends (RBI/PMLA) — 7 years covers the longer of the two with
# margin. This is a blunt, bucket-wide rule: the app doesn't tag objects by
# application outcome (approved/rejected) today, so it can't auto-expire a
# rejected dealer's documents sooner. Smarter retention needs app-level
# cleanup logic later, not just this rule.
resource "aws_s3_bucket_lifecycle_configuration" "kyc_documents" {
  bucket = aws_s3_bucket.kyc_documents.id

  rule {
    id     = "retention-backstop"
    status = "Enabled"

    filter {}

    expiration {
      days = 2555 # 7 years
    }

    noncurrent_version_expiration {
      noncurrent_days = 2555
    }
  }
}

resource "aws_s3_bucket_policy" "kyc_documents" {
  bucket = aws_s3_bucket.kyc_documents.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.kyc_documents.arn,
          "${aws_s3_bucket.kyc_documents.arn}/*",
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      },
      # No "deny PutObject without an explicit x-amz-server-side-encryption
      # header" statement here (deliberately): the installed
      # @open-mercato/storage-s3 driver never sets that header — it relies
      # entirely on the bucket's own default encryption below, which already
      # guarantees every object is encrypted with aws:kms at rest regardless
      # of what the client requests. A statement requiring the header would
      # just reject every real upload from this driver (confirmed live).
    ]
  })
}

# ─── Scoped IAM user for the app's S3 integration ──────────────────────────

resource "aws_iam_user" "storage_s3" {
  name = "${var.app_name}-${var.environment}-storage-s3"
  tags = local.common_tags
}

resource "aws_iam_user_policy" "storage_s3" {
  name = "bucket-access"
  user = aws_iam_user.storage_s3.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ObjectAccess"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket",
        ]
        Resource = [
          aws_s3_bucket.kyc_documents.arn,
          "${aws_s3_bucket.kyc_documents.arn}/*",
        ]
      },
      {
        Sid      = "KmsForS3"
        Effect   = "Allow"
        Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
        Resource = "*"
        Condition = {
          StringEquals = { "kms:ViaService" = "s3.${var.region}.amazonaws.com" }
        }
      },
    ]
  })
}

resource "aws_iam_access_key" "storage_s3" {
  user = aws_iam_user.storage_s3.name
}

# ─── SSM parameters (fed into the ECS task as secrets, same pattern as the
# existing DB/Razorpay secrets in ssm.tf) ────────────────────────────────────

resource "aws_ssm_parameter" "storage_s3_access_key_id" {
  name  = "${local.ssm_prefix}/STORAGE_S3_ACCESS_KEY_ID"
  type  = "SecureString"
  value = aws_iam_access_key.storage_s3.id
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "storage_s3_secret_access_key" {
  name  = "${local.ssm_prefix}/STORAGE_S3_SECRET_ACCESS_KEY"
  type  = "SecureString"
  value = aws_iam_access_key.storage_s3.secret
  tags  = local.common_tags
}
