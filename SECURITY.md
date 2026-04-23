<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.x (latest) | Yes |
| 0.x | No |

## Reporting a vulnerability

**Do not open a public issue** for a security vulnerability.

Send a private report via:

- **[GitHub Security Advisories](https://github.com/focus-mcp/core/security/advisories/new)** (recommended)
- or by email: security@focusmcp.dev

Please include:

- Description of the problem
- Steps to reproduce
- Estimated impact
- Suggested mitigation (if any)

## Response commitment

We commit to:

- **Acknowledging** your report within 72 hours
- **Evaluating and prioritising** the vulnerability within 7 days
- **Coordinating** responsible disclosure
- **Crediting** the reporter (unless they prefer to remain anonymous)

## Scope

FocusMCP security layers are described in the [VISION.md](./VISION.md):

1. **EventBus** — logical guards (timeout, rate limit, inter-brick permissions)
2. **Injected providers** — sandboxed filesystem/network access via the host runtime
3. **Human supervision** — UI oversight

Vulnerabilities affecting any of these layers are treated as high priority.

## Security practices

- Secret scanning (gitleaks) in pre-commit hook + CI
- Dependency scanning (Renovate + `pnpm audit`)
- SAST (CodeQL) in CI
- License compliance (GPL/AGPL blocked to preserve MIT)
- SBOM (CycloneDX) on every release
- npm provenance + Sigstore for releases
