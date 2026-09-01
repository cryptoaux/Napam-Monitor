# Contributing to NAPAMS Monitor

Thanks for contributing to the project. This repository is intentionally structured to keep the offline validation path separate from the live monitoring workflow, so contributors can validate code without touching production credentials or live NAPAMS traffic.

## Local setup

### Prerequisites

- Node.js 22
- npm
- Docker and Docker Compose v2 for the container-based validation path

### Install dependencies

```bash
npm ci
```

### Local environment files

Use a local untracked `.env` file only if you are intentionally running the live monitor. Do not commit it. The repository already ignores `.env` and `.env.*` files while allowing `.env.example` to remain tracked.

## Required validation before a pull request

Run the following before opening or updating a PR:

```bash
npm test
npm run lint
npm run format:check
npm run check:syntax
npm audit --audit-level=high
git diff --check
```

For a full repo-level validation sequence, use:

```bash
npm ci
npm test -- --test-reporter=spec
npm run lint
npm run format:check
npm run check:syntax
npm audit --audit-level=high
git diff --check
```

## Docker validation

For the reproducible offline validation environment:

```bash
docker compose build
docker compose run --rm app
```

This path remains mocked and offline; it does not use live NAPAMS credentials or production traffic.

## Development guidance

Keep changes focused. In this project, the main validation path is the mocked/offline test suite, and the live monitoring workflow is intentionally separate.

Contributors should not:

- commit real NAPAMS passwords, TIN values, API keys, tokens, cookies, or session information
- run the live monitor while developing tests unless they have explicitly configured a safe local environment
- modify the dashboard UI or live monitoring behavior without a clear requirement

## Project structure

- `monitor.js` — main runtime entrypoint
- `src/` — split modules for login, status checks, parsers, errors, schema validation, and output formatting
- `test/` — mocked validation suite
- `.github/workflows/ci.yml` — offline CI validation
- `.github/workflows/monitor.yml` — live production monitoring workflow
- `public/` — generated website data and static files

## Commit discipline

Keep each commit focused and reviewable.

A good commit message is short and descriptive, for example:

```bash
git commit -m "fix: normalize application stage parsing"
```

Do not add empty commits or broaden the scope of a change beyond the issue being fixed.

## Security expectations

- Do not commit real credentials
- Do not paste tokens or cookies into test fixtures or documentation
- Do not add live NAPAMS requests to CI or general validation steps
- Treat the offline suite as the repository's default validation path

## Pull requests

Before requesting review, confirm that:

- tests pass
- lint passes
- formatting passes
- syntax checks pass
- audit passes
- the working tree is clean aside from the intended patch
- no secrets or live-site requests were introduced

If you are unsure whether a change touches the production monitor, prefer a narrow, documented change that leaves the live workflow untouched.
