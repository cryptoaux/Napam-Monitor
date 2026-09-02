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

## State Management

No backend is configured in the checked-in Terraform configuration. Terraform state is therefore local by default when Terraform is run locally. CI uses `terraform init -backend=false` and does not create or access a remote state backend. Remote backend and state-management changes are outside this stage.

## CI Validation

`.github/workflows/ci.yml` sets up Terraform 1.6.6 and runs the following checks against the production root:

```bash
terraform fmt -check -recursive terraform
terraform -chdir=terraform/environments/production init -backend=false
terraform -chdir=terraform/environments/production validate
```

CI also scans the Terraform directory with the existing `tfsec` action. The workflow is validation-only; it does not run `terraform plan` or `terraform apply`.

## Local Validation

From the repository root, with Terraform installed:

```bash
terraform fmt -check -recursive terraform
terraform -chdir=terraform/environments/production init -backend=false
terraform -chdir=terraform/environments/production validate
```

These commands do not deploy infrastructure. Provider installation may require network access during `init`; validation itself does not require AWS credentials for this configuration.

## Security Notes

- Never commit AWS credentials, account IDs, tokens, passwords, cookies, or other secrets.
- Keep production values in protected external configuration or secret-management systems.
- Review Terraform state and plan output for sensitive values before sharing them.
- Do not run `terraform apply` from this repository without an intentional, separately reviewed deployment process.
- The Terraform layer is independent of `COMPANIES_CREDENTIALS_JSON`; this stage does not change that handling.
