output "cluster_name" {
  description = "Name of the ECS cluster created for the monitor deployment."
  value       = aws_ecs_cluster.monitor.name
}

output "service_name" {
  description = "Name of the ECS service created for the monitor deployment."
  value       = aws_ecs_service.monitor.name
}

output "log_group_name" {
  description = "CloudWatch log group name used by the deployed application."
  value       = aws_cloudwatch_log_group.monitor.name
}
