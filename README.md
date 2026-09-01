# NAPAMS Monitor

NAPAMS Monitor is a Node.js automation project for checking application status data from the NAFDAC NAPAMS portal using a configured set of company credentials. The repository keeps the live monitoring workflow separate from the offline validation suite so contributors can run tests, linting, and syntax checks without contacting the production site.

## What the project does

The repository loads company configuration from `companies.json`, authenticates through the NAPAMS login flow, inspects submitted application IDs, checks application status endpoints, and builds a structured JSON payload for the static dashboard in `public/`.

The runtime flow is intentionally split into small modules so the login flow, HTTP transport, parsing logic, output assembly, and observability are easier to validate independently.

## High-level architecture

The actual runtime flow is:

1. `monitor.js` loads and validates company configuration.
2. `src/login.js` opens the login page, resolves the anti-forgery token, and establishes the authenticated session.
3. `src/status-checker.js` calls the application-status endpoint for each discovered application ID.
4. `src/parsers.js` extracts cookies, tokens, status rows, stage metadata, and normalized stage names.
5. `src/result-processor.js` formats successful results into the final output structure.
6. `src/monitor-run.js` records summary metrics and execution outcomes.
7. `public/data.json` is generated for the static dashboard and website output.

This structure matches the current code imports and module boundaries in the repository.

## Repository structure

- `monitor.js` — orchestration entry for loading companies, running login/status checks, and writing output
- `src/` — core monitoring logic split into focused modules
  - `src/login.js` — login flow and session establishment
  - `src/status-checker.js` — application status HTTP calls
  - `src/http-client.js` — HTTPS request wrapper with retry/error handling
  - `src/parsers.js` — cookie, form, and status parsing helpers
  - `src/result-processor.js` — output formatting and grouping
  - `src/monitor-run.js` — summary metrics and run tracking
  - `src/errors.js` — typed application errors
  - `src/schemas.js` — Zod validation for company config and application payloads
  - `src/logger.js` — structured JSON logging
- `test/` — mocked/offline test suite for the repository behavior
- `companies.json` — configured company records and the environment-variable names used for live monitoring
- `public/` — generated dashboard data and static web assets
- `.github/workflows/ci.yml` — CI validation workflow for offline checks
- `.github/workflows/monitor.yml` — separate live NAPAMS monitoring workflow
- `Dockerfile` and `docker-compose.yml` — reproducible offline validation container
- `package.json` — scripts and dependency definitions
- `.env.example` — safe placeholder configuration for local usage

## Requirements

- Node.js 22
- npm
- Docker and Docker Compose v2 for the reproducible offline container workflow

## Installation

Install dependencies with the lockfile:

```bash
npm ci
```

## Configuration and credentials

The monitor supports two safe credential-loading patterns:

1. The legacy per-company environment variable pattern declared in `companies.json`.
2. A single structured secret, `COMPANIES_CREDENTIALS_JSON`, which should contain a JSON array of objects with `id`, `tin`, and `password` fields.

Each company entry includes:

- `tinSecret`
- `passwordSecret`

Those values are used by `monitor.js` through `process.env[...]` lookups unless a matching entry is supplied via `COMPANIES_CREDENTIALS_JSON`.

The repository includes a safe stub file at `.env.example`. It contains placeholder values only and is intended for local shell setup. Do not commit real credentials.

Example:

```env
LOG_LEVEL=info
MONITOR_COMPANIES_FILE=companies.json
MONITOR_OUTPUT_PATH=public/data.json
COMPANIES_CREDENTIALS_JSON='[{"id":"company_01","tin":"example-company-tin","password":"example-company-password"}]'
```

The live monitoring workflow in `.github/workflows/monitor.yml` uses a single structured GitHub secret and keeps those values out of the repository. The CI workflow does not require production credentials.

## Running the project locally

For the live monitoring path, set the required company environment variables and run:

```bash
npm run monitor
```

This executes the actual runtime entrypoint in `monitor.js`.

## Running the offline test suite

The repository uses a mocked/offline Node test suite under `test/`.

```bash
npm test
```

This runs the coverage-gated suite and enforces the configured thresholds.

A direct, no-coverage run is also available:

```bash
npm run test:unit
```

## Linting and formatting

```bash
npm run lint
npm run format:check
```

The project enforces ESLint and Prettier in CI and for local validation.

## Security and syntax checks

```bash
npm audit --audit-level=high
npm run check:syntax
```

`check:syntax` validates the main runtime file and all modules in `src/*.js` using Node's parser without making live requests.

## Docker validation

The repository contains a reproducible offline validation container:

```bash
docker compose build
docker compose run --rm app
```

This runs the repository's real mocked test suite in a containerized environment. It does not contact the production NAPAMS site and does not require production credentials.

## CI behavior

The CI workflow in `.github/workflows/ci.yml` runs on pushes to `main` and pull requests targeting `main`.

It validates the repo with:

- `npm ci`
- `npm test`
- `npm run lint`
- `npm run format:check`
- `npm run check:syntax`
- `npm audit --audit-level=high`

This path is intentionally separate from the live monitor workflow and never depends on a production NAPAMS session.

## Live monitoring workflow

The live monitoring workflow is in `.github/workflows/monitor.yml` and is separate from CI.

It is intended to:

- install the runtime dependencies
- install Playwright Chromium
- reach the live NAPAMS login page
- execute the monitor with secret-backed environment variables
- write the generated results to `public/data.json`

This workflow is not used for the offline CI validation path and should not be treated as a general test environment.

## Output generation

The live monitor writes the final application data to `public/data.json`. The static website in `public/` reads that structure to render the dashboard.

The actual result assembly happens through the modules under `src/` and is finalized in `src/result-processor.js`.

## Troubleshooting

Common local issues:

- `npm ci` fails because the lockfile and package manifest are out of sync
- Coverage or tests fail because a mocked HTML or status case changed
- Lint fails because a file is not formatted or contains an error
- Syntax checks fail because a JavaScript file has a parse error
- The live workflow is not relevant for local development unless production credentials and the live site are intentionally being used

If a credential is required for a local live run, keep it in a local untracked `.env` file and never commit it.

## Development workflow for contributors

1. Clone the repository.
2. Run `npm ci`.
3. Run `npm test`.
4. Run `npm run lint`.
5. Run `npm run format:check`.
6. Run `npm run check:syntax`.
7. Run `npm audit --audit-level=high`.
8. Use `git diff --check` before committing.

Keep changes focused and avoid touching the live monitoring workflow or dashboard UI unless the change is directly required by the docs or maintenance work.

## Security guidance

- Never commit real NAPAMS credentials, passwords, tokens, cookies, or session data.
- Keep local `.env` files untracked and outside version control.
- Use GitHub repository secrets for any live production automation.
- Treat the offline test suite as the default validation path for repository changes.

## Release and maintenance notes

This repository does not claim a public release history beyond the existing git tags and repository state. Future releases should remain consistent with actual shipped code and existing versioning practices.

## Notes

The project documentation reflects the actual current codebase and deliberately avoids describing features or workflows that are not present in the repository.
