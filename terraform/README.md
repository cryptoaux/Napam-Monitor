# NAPAMS Monitor Terraform

## Overview

The `terraform/` directory contains the checked-in Terraform configuration for the monitor's AWS runtime footprint. It is separate from the Node.js monitoring code and does not load or manage NAPAMS application credentials.

## Directory Structure

```text
terraform/
├── versions.tf
├── environments/
│   └── production/
│       ├── main.tf
│       ├── backend.tf
│       ├── outputs.tf
│       ├── variables.tf
│       └── versions.tf
└── modules/
	└── monitor/
		├── main.tf
		├── outputs.tf
		├── README.md
		└── variables.tf
```

`terraform/` contains shared Terraform version and provider requirements. `terraform/environments/production/` is the environment root used for validation and composes the reusable module. `terraform/modules/` contains reusable infrastructure components; it currently contains the `monitor` module only.

## Production Environment

The production root in `environments/production/` passes environment values to `modules/monitor` and exposes the module's cluster, service, VPC, and log group names. The module currently models an AWS VPC with two public subnets, an internet gateway and route table, an ECS Fargate cluster and service, an ECS task definition, an IAM execution role and policy, and a CloudWatch log group. No application load balancer is defined.

The production directory is the Terraform working directory used by CI. It has its own `versions.tf` so that its requirements are available when Terraform is run with `-chdir=terraform/environments/production`.

## Modules

`modules/monitor/` is a genuine reusable module for the monitor runtime. Its inputs cover naming, region, network CIDR, container sizing and image, desired task count, log retention, and resource tags. Its outputs expose identifiers useful to downstream automation. The current configuration is already split into an environment root and a reusable module, so no additional artificial module was added.

## Providers

The environment requires Terraform `>= 1.6.0` and the `hashicorp/aws` provider constrained to `~> 5.70`. Provider installation is performed by `terraform init`; no provider lockfile is maintained as part of this stage.

## Variables and Variable Sources

Environment defaults and input declarations are in `environments/production/variables.tf`. The production root passes those values to the module, whose declarations are in `modules/monitor/variables.tf`. Terraform values may be supplied using normal Terraform mechanisms such as `-var`, `-var-file`, `TF_VAR_*`, or environment-specific automation. No variable file containing production values is committed.

The Terraform variables are infrastructure settings and are separate from the Node.js monitor's company configuration. Production credentials and secrets must come from external secret or configuration mechanisms, such as protected CI/environment variables or a secret manager, and must never be committed to this repository.

## Backend Setup

The production root configures an S3 backend in `environments/production/backend.tf`. The state key is `napams-monitor/production/terraform.tfstate` and `encrypt = true` enables server-side encryption for state objects. The backend intentionally leaves the bucket and region to initialization-time configuration so no account-specific infrastructure name is committed.

The backend bucket must be created and secured through a separately managed AWS process. That process should enable versioning, restrict access to the Terraform automation role, and apply the organization's required KMS and retention controls. This repository does not create the bucket or configure a remote backend resource.

For local use, supply the backend settings through an untracked backend configuration file or command-line arguments:

```bash
terraform -chdir=terraform/environments/production init \
	-backend-config="bucket=$TF_STATE_BUCKET" \
	-backend-config="region=$TF_STATE_REGION"
```

Do not put backend credentials in the repository or in `terraform.tfvars`. The AWS SDK credential chain, protected environment configuration, or an external secret manager must provide authentication.

CI requires the protected `TF_STATE_BUCKET`, `TF_STATE_REGION`, and `TF_STATE_ROLE_ARN` values. `TF_STATE_ROLE_ARN` is assumed through GitHub's OIDC provider; no long-lived AWS access key is configured in the workflow.

## State Management

CI selects a run-specific workspace named `ci-${GITHUB_RUN_ID}` after initializing the S3 backend. This keeps validation state isolated between runs. The repository does not create the backend bucket or manage its lifecycle.

## CI Validation

`.github/workflows/ci.yml` sets up Terraform 1.6.6 and runs the following checks against the production root:

```bash
terraform fmt -check -recursive terraform
terraform -chdir=terraform/environments/production init -reconfigure \
	-backend-config="bucket=$TF_STATE_BUCKET" \
	-backend-config="region=$TF_STATE_REGION"
terraform -chdir=terraform/environments/production validate
```

On pushes to `main`, CI obtains AWS credentials through GitHub OIDC and the protected `TF_STATE_ROLE_ARN`, `TF_STATE_BUCKET`, and `TF_STATE_REGION` secrets. It selects a run-specific `ci-${GITHUB_RUN_ID}` workspace. Pull requests use `-backend=false` because deployment credentials are not made available to untrusted pull-request code. CI also scans the Terraform directory with the existing `tfsec` action. The workflow is validation-only; it does not run `terraform plan` or `terraform apply`.

## Local Validation

From the repository root, with Terraform installed:

```bash
terraform fmt -check -recursive terraform
terraform -chdir=terraform/environments/production init \
	-backend-config="bucket=$TF_STATE_BUCKET" \
	-backend-config="region=$TF_STATE_REGION"
terraform -chdir=terraform/environments/production validate
```

These commands do not deploy infrastructure. Provider and backend access may require network access during `init`; validation itself does not create AWS resources. Use `-backend=false` for offline validation when remote backend access is intentionally unavailable.

## Security Notes

- Never commit AWS credentials, account IDs, tokens, passwords, cookies, or other secrets.
- Keep production values in protected external configuration or secret-management systems.
- Review Terraform state and plan output for sensitive values before sharing them.
- Do not run `terraform apply` from this repository without an intentional, separately reviewed deployment process.
- The Terraform layer is independent of `COMPANIES_CREDENTIALS_JSON`; this stage does not change that handling.
