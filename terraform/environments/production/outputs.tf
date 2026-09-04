output "cluster_name" {
  description = "ECS cluster name."
  value       = module.ecs.cluster_name
}

output "service_name" {
  description = "ECS service name."
  value       = module.ecs.service_name
}

output "vpc_id" {
  description = "VPC ID created for the monitor deployment."
  value       = module.networking.vpc_id
}

output "log_group_name" {
  description = "CloudWatch log group used by the monitor."
  value       = module.ecs.log_group_name
}
