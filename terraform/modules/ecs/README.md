# ECS module

This reusable module provisions the NAPAMS Monitor ECS/Fargate application
runtime and consumes private subnet and security-group IDs from the networking
module.

## Responsibilities

- ECS cluster with Container Insights enabled
- Fargate task definition and service
- ECS task execution role with scoped CloudWatch Logs permissions
- Customer-managed rotating KMS key for the application log group
- KMS-encrypted CloudWatch log group with at least 365 days retention

## Inputs

- `project_name`, `environment`: resource naming inputs
- `aws_region`: region for ECS and CloudWatch resources
- `subnet_ids`: private subnet IDs supplied by the networking module
- `security_group_ids`: security group IDs supplied by the networking module
- `container_image`, `container_cpu`, `container_memory`: container configuration
- `desired_count`: desired Fargate task count
- `log_retention_days`: application log retention, at least 365 days
- `tags`: common resource tags

## Outputs

- `cluster_name`: ECS cluster name
- `service_name`: ECS service name
- `log_group_name`: application CloudWatch log group name
