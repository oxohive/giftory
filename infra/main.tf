terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
    vercel = {
      source  = "vercel/vercel"
      version = "~> 2.0"
    }
  }

  # Uncomment to use S3 remote state (recommended once team grows):
  # backend "s3" {
  #   bucket  = "giftory-tfstate"
  #   key     = "dev/terraform.tfstate"
  #   region  = "ap-south-1"
  #   encrypt = true
  # }
}

provider "aws" {
  region  = var.region
  profile = var.aws_profile
}

provider "vercel" {
  api_token = var.vercel_api_token
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name

  common_tags = {
    Project     = var.app_name
    Environment = var.environment
    ManagedBy   = "opentofu"
  }
}
