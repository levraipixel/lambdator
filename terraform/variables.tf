variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "discord_public_key" {
  description = "Discord application public key used to verify incoming interaction payloads"
  type        = string
  sensitive   = true
}

variable "project_name" {
  description = "Name prefix applied to all created resources"
  type        = string
  default     = "lambdator"
}
