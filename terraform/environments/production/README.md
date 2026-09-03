# Production Terraform Environment

This directory is the production Terraform environment root. It calls the reusable monitor module from `../../modules/monitor`.

## Module Inputs

The production root passes these inputs to the monitor module:

- `project_name`
- `environment`
- `aws_region`
- `vpc_cidr`
- `container_image`
- `desired_count`
- `log_retention_days`
- `tags`

The default values are declared in `variables.tf`. The module creates the VPC, public networking, ECS cluster and service, task definition, IAM execution role and policy, and CloudWatch log group described by those inputs.

## Outputs

The environment exposes:

- `cluster_name`
- `service_name`
- `vpc_id`
- `log_group_name`

## Backend

The environment uses an encrypted S3 backend with the state key `napams-monitor/production/terraform.tfstate` and `encrypt = true`. The S3 bucket and backend region are supplied externally during initialization; they are not defined in this repository.

## CI Validation

CI currently runs these Terraform checks:

```text
terraform fmt -check -recursive terraform
terraform -chdir=terraform/environments/production init -backend=false
terraform -chdir=terraform/environments/production validate
```

CI also scans the Terraform directory with the `aquasecurity/tfsec-action@v1.0.0` action and fails for findings at or above HIGH severity.

CI does not run `terraform plan` or `terraform apply`. A real Terraform plan requires AWS credentials and access to the configured backend. Terraform is currently an infrastructure scaffold and is not applied or deployed by this repository.
