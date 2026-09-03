variable "project_name" {
  description = "Project name applied to the deployed environment."
  type        = string
  default     = "napams-monitor"
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  default     = "production"
}

variable "aws_region" {
  description = "AWS region used for deployment."
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "CIDR block reserved for the monitor platform VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "container_image" {
  description = "Container image to deploy for the monitor runtime."
  type        = string
  default     = "example-registry/napams-monitor:latest"
}

variable "desired_count" {
  description = "Desired number of Fargate tasks."
  type        = number
  default     = 1
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 365
}
