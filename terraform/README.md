# NAPAMS Monitor Terraform

This Terraform configuration models the operational deployment footprint that supports the repository's scheduled monitoring workload in GitHub Actions.

The repository is a Node.js application that runs on a schedule and writes dashboard data to `public/data.json`. This Terraform setup represents the supporting infrastructure needed to host and run a resilient deployment pipeline for that workload, while keeping the application configuration separate from the codebase.

## Scope

This project intentionally models a reusable infrastructure module for a small scheduled monitor deployment, not the live NAPAMS application itself.

It provides:

- a reusable Terraform module for the runtime environment
- an example production environment in `environments/production`
- environment-level variables for project naming, region, tags, and application settings
- safe output values for downstream automation

## Real infrastructure represented

The module provisions an AWS ECS Fargate service pair with an application load balancer and a CloudWatch log group. This is a legitimate deployment pattern for a small scheduled or continuously running application that should be run in a managed container environment and monitored centrally.

## Files

- `modules/monitor` — reusable infrastructure module
- `environments/production` — example root configuration
- `versions.tf` — Terraform and provider requirements

## Usage

```bash
cd terraform/environments/production
terraform init -backend=false
terraform validate
```

## Inputs

See the variables in `terraform/environments/production/variables.tf` and the module variables in `terraform/modules/monitor/variables.tf`.

## Notes

- Secrets are intentionally represented as variables, not committed values.
- This repository does not require cloud access for local validation.
- The Terraform configuration is designed to be valid offline without connecting to AWS.
