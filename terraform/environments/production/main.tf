module "networking" {
  source = "../../modules/networking"

  project_name       = var.project_name
  environment        = var.environment
  aws_region         = var.aws_region
  vpc_cidr           = var.vpc_cidr
  log_retention_days = var.log_retention_days
  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

module "ecs" {
  source = "../../modules/ecs"

  project_name       = var.project_name
  environment        = var.environment
  aws_region         = var.aws_region
  subnet_ids         = module.networking.private_subnet_ids
  security_group_ids = [module.networking.default_security_group_id]
  container_image    = var.container_image
  desired_count      = var.desired_count
  log_retention_days = var.log_retention_days
  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
