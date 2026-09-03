# Monitor module

This module provisions the managed container runtime used by the NAPAMS Monitor application in a cloud environment.

## Included resources

- VPC
- private ECS subnets
- public NAT gateway subnets
- internet gateway
- VPC flow logs
- encrypted CloudWatch log groups
- ECS cluster
- ECS task definition
- ECS service
- IAM execution role
- CloudWatch log group

## Example

```hcl
module "monitor" {
  source = "./modules/monitor"

  project_name    = "napams-monitor"
  environment     = "production"
  aws_region      = "us-east-1"
  container_image = "example-registry/napams-monitor:latest"
}
```

The ECS tasks run without public IP addresses in private subnets. A NAT gateway
provides outbound access for image pulls and other task dependencies. CloudWatch
logs use a customer-managed KMS key and retain data for at least 365 days.
