output "cluster_name" {
  description = "ECS cluster name."
  value       = module.monitor.cluster_name
}

output "service_name" {
  description = "ECS service name."
  value       = module.monitor.service_name
}

output "vpc_id" {
  description = "VPC ID created for the monitor deployment."
  value       = module.monitor.vpc_id
}

output "log_group_name" {
  description = "CloudWatch log group used by the monitor."
  value       = module.monitor.log_group_name
}
