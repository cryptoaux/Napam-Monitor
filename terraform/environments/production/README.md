# Production Terraform Environment

This directory is the production Terraform environment root. It composes the reusable networking and ECS modules from `../../modules/networking` and `../../modules/ecs`.

## Module Inputs

The production root passes network inputs to the networking module and runtime inputs to the ECS module:

- `project_name`
- `environment`
- `aws_region`
- `vpc_cidr`
- `container_image`
- `desired_count`
- `log_retention_days`
- `tags`

The default values are declared in `variables.tf`. The networking module creates private ECS networking with NAT gateway egress, VPC flow logs, and a restricted default security group. The ECS module creates the cluster, service, task definition, least-privilege IAM roles and policies, and KMS-encrypted CloudWatch log groups described by those inputs.

## Outputs

The environment exposes:

- `cluster_name`
- `service_name`
- `vpc_id`
- `log_group_name`

## Backend

The environment uses an encrypted S3 backend with the state key `napams-monitor/production/terraform.tfstate` and `encrypt = true`. The S3 bucket and backend region are supplied externally during initialization; they are not defined in this repository.

The backend bucket, AWS account, access policy, and any KMS or retention controls are external bootstrap prerequisites. This repository does not create the bucket or manage its lifecycle. Initialize a real backend only with approved, authenticated AWS access and untracked values such as `-backend-config="bucket=$TF_STATE_BUCKET" -backend-config="region=$TF_STATE_REGION"`.

## CI Validation

CI currently runs these Terraform checks:

```text
terraform fmt -check -recursive terraform
terraform -chdir=terraform/environments/production init -backend=false
terraform -chdir=terraform/environments/production validate
```

CI scans the Terraform directory with the `aquasecurity/tfsec-action@v1.0.0` action and the Checkov Terraform framework. Both scanners fail CI on findings.

CI does not run `terraform plan` or `terraform apply`. A real Terraform plan requires an approved AWS sandbox or development account, access to the configured backend, and a configured authentication path such as GitHub Actions OIDC to an approved IAM role. No such AWS/OIDC environment is configured in this repository, so the credential-free validation path remains intentional. Terraform is currently an infrastructure scaffold and is not applied or deployed by this repository.
