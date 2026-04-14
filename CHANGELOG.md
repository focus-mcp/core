<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# Changelog

Tous les changements notables sont documentés ici.
Format : [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning : [SemVer 2.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Setup initial du monorepo : pnpm workspaces, TypeScript strict, Biome
- Tooling de test : Vitest + coverage v8 + fast-check + Stryker + Playwright
- Git hooks : husky + commitlint + lint-staged + gitleaks
- Tooling qualité : knip, size-limit, jscpd, license-checker
- Release : Changesets + npm provenance
- CI/CD GitLab complète : lint → typecheck → test → quality → security → sbom → build → release
- Observabilité : pino (logs avec redaction) + OpenTelemetry (tracing)
- Documentation : README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, GOVERNANCE, ROADMAP, ADR
