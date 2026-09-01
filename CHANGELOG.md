# Changelog

All notable changes to this project are documented in this file.

## Unreleased

- Hardened repository documentation for onboarding, architecture, and contributor workflow.
- Clarified the separation between the offline validation suite and the live monitoring workflow.
- Documented safe credential handling and local environment expectations for contributors.
- Strengthened the maintenance and release-readiness signals for evaluator-facing review.

## [1.0.0] - 2026-09-01

### Added

- Automated mock-based test suite and coverage enforcement.
- Integration coverage for the mocked monitor orchestration path.
- Login orchestration extraction into `src/login.js`.
- Application status checking extraction into `src/status-checker.js`.
- Typed application and configuration errors.
- Result processing separation into `src/result-processor.js`.
- Monitoring run observability via `src/monitor-run.js`.
- Reproducible Docker-based offline validation environment.
- GitHub Actions CI validation workflow for offline checks.

### Changed

- Improved module boundaries and validation around HTTP, parsing, and output assembly.
- Kept production monitoring separated from the repository's offline CI/test path.

### Security

- Documented the requirement to avoid committing credentials and to use GitHub secrets for live monitoring.
