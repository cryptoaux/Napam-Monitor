# NAPAMS Monitor

## What this project does

This repository contains a Node.js monitor for the NAPAMS registration portal. It reads configured company credentials, signs in to the NAPAMS site, loads submitted applications, checks application status endpoints, and saves summarized status data to `public/data.json` for the dashboard in `public/index.html`.

The project is focused on the monitoring workflow and status collection logic in `monitor.js`.

## Project purpose

The purpose of this repository is to automate repeated status checks for NAPAMS applications across a set of configured companies and write the resulting data to the local website output.

## Repository structure

- `monitor.js` — main monitoring logic and HTTP/session handling
- `companies.json` — company configuration, including the environment variable names used for TIN and password lookups
- `.env.example` — placeholder environment variable examples for local setup
- `.gitignore` — ignores local environment files
- `public/` — generated website data and static dashboard files
- `test/monitor.test.js` — Node built-in tests for parsing and status logic
- `.github/workflows/monitor.yml` — scheduled NAPAMS monitoring workflow
- `.github/workflows/ci.yml` — CI workflow for tests, linting, formatting, and syntax validation
- `package.json` — project scripts and dependencies

## Prerequisites

- Node.js 22 (this is the version currently used by the repository workflows)
- npm
- Access to the NAPAMS site with valid credentials for the configured companies

## Installation

Install dependencies with the project lockfile:

```bash
npm ci
```

## Configuration

The monitor uses environment variables whose names are defined in `companies.json`. Each company entry contains:

- `tinSecret`
- `passwordSecret`

Those values are read through `process.env[...]` in `monitor.js`.

The repository includes `.env.example`, which is a safe placeholder file for local configuration. It is not a real credential file. Copy it to a local `.env` if you want to use environment variables in a local shell process, but keep the real values out of source control.

The actual environment variable names currently used by the project are:

```env
COMPANY_1_TIN=your-company-1-tin
COMPANY_1_PASSWORD=your-company-1-password
COMPANY_2_TIN=your-company-2-tin
COMPANY_2_PASSWORD=your-company-2-password
COMPANY_3_TIN=your-company-3-tin
COMPANY_3_PASSWORD=your-company-3-password
COMPANY_4_TIN=your-company-4-tin
COMPANY_4_PASSWORD=your-company-4-password
COMPANY_5_TIN=your-company-5-tin
COMPANY_5_PASSWORD=your-company-5-password
COMPANY_6_TIN=your-company-6-tin
COMPANY_6_PASSWORD=your-company-6-password
COMPANY_7_TIN=your-company-7-tin
COMPANY_7_PASSWORD=your-company-7-password
COMPANY_8_TIN=your-company-8-tin
COMPANY_8_PASSWORD=your-company-8-password
COMPANY_9_TIN=your-company-9-tin
COMPANY_9_PASSWORD=your-company-9-password
COMPANY_10_TIN=your-company-10-tin
COMPANY_10_PASSWORD=your-company-10-password
COMPANY_11_TIN=your-company-11-tin
COMPANY_11_PASSWORD=your-company-11-password
COMPANY_12_TIN=your-company-12-tin
COMPANY_12_PASSWORD=your-company-12-password
COMPANY_13_TIN=your-company-13-tin
COMPANY_13_PASSWORD=your-company-13-password
COMPANY_14_TIN=your-company-14-tin
COMPANY_14_PASSWORD=your-company-14-password
COMPANY_15_TIN=your-company-15-tin
COMPANY_15_PASSWORD=your-company-15-password
COMPANY_16_TIN=your-company-16-tin
COMPANY_16_PASSWORD=your-company-16-password
COMPANY_17_TIN=your-company-17-tin
COMPANY_17_PASSWORD=your-company-17-password
COMPANY_18_TIN=your-company-18-tin
COMPANY_18_PASSWORD=your-company-18-password
COMPANY_19_TIN=your-company-19-tin
COMPANY_19_PASSWORD=your-company-19-password
COMPANY_20_TIN=your-company-20-tin
COMPANY_20_PASSWORD=your-company-20-password
COMPANY_21_TIN=your-company-21-tin
COMPANY_21_PASSWORD=your-company-21-password
COMPANY_22_TIN=your-company-22-tin
COMPANY_22_PASSWORD=your-company-22-password
COMPANY_23_TIN=your-company-23-tin
COMPANY_23_PASSWORD=your-company-23-password
COMPANY_24_TIN=your-company-24-tin
COMPANY_24_PASSWORD=your-company-24-password
```

This matches the 24 configured company records in `companies.json`.

## How to run the monitor locally

Set the required environment variables for the companies you want to monitor, then run:

```bash
npm run monitor
```

This executes `node monitor.js` as defined in `package.json`.

## How to run the automated tests

The repository includes a real automated test suite in the `test/` directory. The tests are stored as conventional Node test files such as `test/monitor.test.js`, `test/logger.test.js`, `test/schemas.test.js`, and `test/integration.test.js`.

```bash
npm test
```

This executes the coverage-gated Node test runner against the files in `test/*.test.js`.

For a direct, no-coverage run of the same suite:

```bash
npm run test:unit
```

## How to run ESLint checks

```bash
npm run lint
```

This runs `eslint .`.

## How to run Prettier format checking

```bash
npm run format:check
```

This runs `prettier --check .`.

## How to run the Node syntax check

```bash
node --check monitor.js
```

## GitHub Actions CI behavior

The repository has a separate CI workflow in `.github/workflows/ci.yml`.

It runs on:

- push to `main`
- pull request targeting `main`

It uses:

- Node.js 22
- `actions/checkout@v4`
- `actions/setup-node@v4`
- `npm ci`
- `npm test`
- `npm run lint`
- `npm run format:check`
- `node --check monitor.js`

This workflow is intended to validate the project code and quality checks in CI.

## Scheduled monitoring workflow

The scheduled workflow is in `.github/workflows/monitor.yml`.

It is a separate workflow from CI and is configured to run manually via `workflow_dispatch` and on a cron schedule (`*/15 * * * *`). It installs dependencies, installs Playwright Chromium, runs a connectivity check against the NAPAMS login page, then executes `npm run monitor` with repo secrets mapped to the company environment variables:

- `COMPANY_1_TIN` / `COMPANY_1_PASSWORD`
- `COMPANY_2_TIN` / `COMPANY_2_PASSWORD`
- ...
- `COMPANY_24_TIN` / `COMPANY_24_PASSWORD`

This workflow is for live monitoring and updating public application data, not for the lint/test CI job.

## Security guidance

Important:

- Never commit real NAPAMS credentials, passwords, tokens, cookies, or other secrets.
- Use GitHub repository secrets for automated deployment/workflows.
- Keep local `.env` values out of source control.
- `.env.example` is intentionally a safe placeholder file containing example values only.
- The repository `.gitignore` excludes `.env` and `.env.*` files while allowing `.env.example` to remain tracked.

## Notes

This documentation reflects the actual current project structure and scripts as defined in the repository. It intentionally avoids describing features or workflows that are not present in the current codebase.
