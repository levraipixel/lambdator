terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  # Partial S3 backend configuration.
  # Pass the remaining config at init time via -backend-config flags (see README / CI workflow).
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region
}
