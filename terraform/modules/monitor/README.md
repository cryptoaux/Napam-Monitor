# Monitor module

This module provisions the managed container runtime used by the NAPAMS Monitor application in a cloud environment.

## Included resources

- VPC
- public subnets
- internet gateway
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
