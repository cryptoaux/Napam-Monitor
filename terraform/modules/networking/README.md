# Networking module

This reusable module provisions the private network used by the NAPAMS Monitor
ECS workload.

## Responsibilities

- VPC with DNS support and hostnames enabled
- Two private ECS subnets
- Two NAT subnets, an internet gateway, NAT gateway, EIP, and routes
- Restricted VPC default security group with no ingress or egress rules
- VPC Flow Logs sent to a KMS-encrypted CloudWatch log group
- Dedicated least-privilege flow-log IAM role and policy

## Inputs

- `project_name`, `environment`: resource naming inputs
- `aws_region`: region used for availability zones and log encryption
- `vpc_cidr`: VPC address space
- `log_retention_days`: flow-log retention, at least 365 days
- `tags`: common resource tags

## Outputs

- `vpc_id`: VPC identifier
- `private_subnet_ids`: ECS private subnet identifiers
- `default_security_group_id`: restricted default security group identifier
