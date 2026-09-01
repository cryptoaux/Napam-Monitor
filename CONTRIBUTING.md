# Contributing to NAPAMS Monitor

First off, thank you for considering contributing to NAPAMS Monitor! 🎉

We welcome all types of contributions, including bug reports, feature suggestions, documentation improvements, and code changes.

## Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the contact address listed there.

## How Can I Contribute?

### Reporting Bugs or Requesting Features

- **Check existing issues** first to avoid duplicates.
- Use **clear, descriptive titles**.
- For bugs, include:
  - Steps to reproduce
  - Expected vs. actual behavior
  - Relevant log output or error messages
  - Your environment (Node version, OS)
- For features, explain the **use case** and how it benefits the monitoring workflow.

### Submitting Code Changes (Pull Requests)

1. **Fork the repository** and create your branch from `main`.
2. **Install dependencies** with `npm ci` (ensures exact versions from the lockfile).
3. **Make your changes** – keep them focused and well-documented.
4. **Add or update tests** if your change affects parsing, status logic, or core monitoring behavior.
5. **Run validation locally** (see "Development Setup" below).
6. **Commit with a clear message** (e.g., `fix: correct status parsing for pending applications`).
7. **Push and open a Pull Request** against the `main` branch.

> **Important**: Please **do not** include real NAPAMS credentials, tokens, or any secrets in your commits, even in test files. The repository uses mocked tests for CI, so you do not need to use real credentials to validate changes.

---

## Development Setup

### Prerequisites

- **Node.js 22** (matching the CI and scheduled workflow environment)
- **npm** (comes with Node)

### Installation

```bash
npm ci
```

Environment Variables for Local Testing

Copy the example environment file:

```bash
cp .env.example .env
```

The tests are fully mocked and do not require real credentials. However, if you want to run the live monitor locally, fill in real TIN/password values in .env (but never commit this file – it’s already in .gitignore).

Running the Full Test Suite

```bash
npm test
```

This runs the coverage-gated Node test runner. All tests must pass before a PR can be merged.

Linting and Formatting

We use ESLint and Prettier to keep code consistent.

```bash
# Check for linting errors
npm run lint

# Check formatting
npm run format:check

# Automatically fix formatting issues (if you have Prettier installed globally, or use npx)
npx prettier --write .
```

Syntax Validation

```bash
node --check monitor.js
```

The CI workflow will run all of the above checks automatically. Your PR must pass them to be reviewed.

---

Project Structure Overview

To help you navigate the code:

· monitor.js – Main monitoring logic, HTTP session handling, and status collection.
· companies.json – Company configuration (TIN/password secret names referenced via process.env).
· public/ – Static dashboard (index.html) and output data (data.json).
· test/ – Node built-in test files (monitor.test.js, logger.test.js, etc.) for parsing and status logic.
· .github/workflows/ – CI and scheduled monitoring GitHub Actions.
· package.json – Scripts and dependencies.

---

Testing Guidelines

Since your changes might affect the monitoring flow:

· Add tests for any new parsing or status-checking logic.
· Ensure existing tests still pass (we aim for high coverage).
· Run the integration tests (test/integration.test.js) to verify end-to-end behavior (offline/mocked).

---

Security

We take security seriously. If you discover a vulnerability, do not open a public issue. Instead, refer to our Security Policy for reporting instructions.

---

Questions?

If you're unsure about anything, feel free to open a Discussion or ask in the PR comments. We're happy to help!

Thank you again for contributing to NAPAMS Monitor. 🙌

```

---
```
