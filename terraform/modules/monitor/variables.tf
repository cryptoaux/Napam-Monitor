variable "project_name" {
  description = "Name prefix for the monitoring deployment resources."
  type        = string

  validation {
    condition     = length(trimspace(var.project_name)) > 0
    error_message = "project_name must not be empty."
  }
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "production"
}

variable "aws_region" {
  description = "AWS region for the monitor deployment."
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC used by the platform."
  type        = string
  default     = "10.10.0.0/16"
}

variable "container_image" {
  description = "Container image reference for the application runtime."
  type        = string
}

variable "container_cpu" {
  description = "CPU units allocated to the application container."
  type        = number
  default     = 256
}

variable "container_memory" {
  description = "Memory allocated to the application container in MiB."
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Desired number of tasks for the service."
  type        = number
  default     = 1

  validation {
    condition     = var.desired_count >= 1
    error_message = "desired_count must be at least 1."
  }
}

variable "log_retention_days" {
  description = "CloudWatch log retention period in days."
  type        = number
  default     = 365

  validation {
    condition     = var.log_retention_days >= 365 && contains([365, 400, 545, 731, 1827, 3653], var.log_retention_days)
    error_message = "log_retention_days must be a valid CloudWatch retention value."
  }
}

variable "tags" {
  description = "Map of resource tags applied to created resources."
  type        = map(string)
  default     = {}
}
