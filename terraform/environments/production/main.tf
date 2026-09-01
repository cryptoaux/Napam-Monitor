module "monitor" {
  source = "../../modules/monitor"

  project_name       = var.project_name
  environment        = var.environment
  aws_region         = var.aws_region
  vpc_cidr           = var.vpc_cidr
  container_image    = var.container_image
  desired_count      = var.desired_count
  log_retention_days = var.log_retention_days
  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
