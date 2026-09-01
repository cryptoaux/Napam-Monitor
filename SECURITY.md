# Security Policy

## Supported Versions

This repository is a small, focused monitoring tool for offline validation and a separate live monitoring workflow. Security updates are applied to the current main branch and to the latest released state tracked in the repository history.

| Version                    | Status           |
| -------------------------- | ---------------- |
| main / current branch      | Supported        |
| older repository snapshots | Best effort only |

## Reporting a Vulnerability

Please report security issues privately and responsibly.

- Open a private security report through GitHub Security Advisories for this repository if available.
- If the repository does not yet support a private advisory workflow, contact the maintainer directly through the repository owner and include a clear description of the issue, reproduction steps, affected files, and any suggested remediation.
- Do not disclose credential leaks, live-site access details, or production secrets in public issues or pull requests.

## Security Expectations

This project intentionally keeps the real NAPAMS monitoring workflow separate from the offline code-validation path. Contributors should avoid introducing:

- production credentials, tokens, cookies, or session values into the repository
- live NAPAMS requests into CI or default developer validation steps
- secrets in logs, fixtures, README examples, or generated output

## Response Expectations

Reports are reviewed on a best-effort basis. The maintainers aim to acknowledge valid reports promptly and provide a remediation plan or mitigation guidance as appropriate.
