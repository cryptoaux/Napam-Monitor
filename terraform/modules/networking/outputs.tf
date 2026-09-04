output "vpc_id" {
  description = "ID of the monitor VPC."
  value       = aws_vpc.monitor.id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets for ECS tasks."
  value       = aws_subnet.monitor[*].id
}

output "default_security_group_id" {
  description = "ID of the restricted VPC default security group."
  value       = aws_default_security_group.monitor.id
}
