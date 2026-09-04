variable "project_name" {
  description = "Name prefix for the networking resources."
  type        = string
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "aws_region" {
  description = "AWS region for networking resources."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch flow-log retention period in days."
  type        = number

  validation {
    condition     = var.log_retention_days >= 365 && contains([365, 400, 545, 731, 1827, 3653], var.log_retention_days)
    error_message = "log_retention_days must be a valid retention value of at least 365 days."
  }
}

variable "tags" {
  description = "Map of resource tags applied to networking resources."
  type        = map(string)
  default     = {}
}
