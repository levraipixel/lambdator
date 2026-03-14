variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "eu-west-3"
}

variable "discord_public_key" {
  description = "Discord application public key used to verify incoming interaction payloads"
  type        = string
  sensitive   = true
}

variable "helloasso_client_id" {
  description = "HelloAsso OAuth2 client ID"
  type        = string
  sensitive   = true
}

variable "helloasso_client_secret" {
  description = "HelloAsso OAuth2 client secret"
  type        = string
  sensitive   = true
}

variable "helloasso_organization_slug" {
  description = "HelloAsso organization slug"
  type        = string
}

variable "project_name" {
  description = "Name prefix applied to all created resources"
  type        = string
  default     = "lambdator"
}
