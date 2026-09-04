variable "project_name" {
  description = "Name prefix for the ECS resources."
  type        = string
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "aws_region" {
  description = "AWS region for ECS and CloudWatch resources."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs where ECS tasks run."
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security group IDs attached to the ECS service network interface."
  type        = list(string)
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
    error_message = "log_retention_days must be a valid retention value of at least 365 days."
  }
}

variable "tags" {
  description = "Map of resource tags applied to ECS resources."
  type        = map(string)
  default     = {}
}
