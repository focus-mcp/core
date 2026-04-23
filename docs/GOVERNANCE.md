<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# FocusMCP Governance

## Status

Project at v1.0.0 (stable). Governance is intentionally lightweight and will evolve as the community grows.

## Roles

### Maintainers

- Approve pull requests
- Decide on ADRs (Architecture Decision Records)
- Manage releases
- Define the roadmap

### Contributors

Anyone submitting a PR that meets the standards described in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Decisions

- **Small decisions** (bugfix, refactor): 1 maintainer approval, merge
- **Architectural decisions**: ADR required in `docs/adr/`, public discussion, 2 approvals
- **Breaking changes**: ADR + major semver bump + detailed changelog + migration guide

## Official marketplace

Official bricks (`focus-*`) are hosted in a separate repo ([`focus-mcp/marketplace`](https://github.com/focus-mcp/marketplace)). They follow the same standards as the core and must pass `@focus-mcp/validator`.

The official marketplace **rejects catch-all bricks** (atomicity principle — see [VISION.md](../VISION.md)).

## Communication

- **Technical discussions**: PRs + GitHub Issues
- **Announcements**: CHANGELOG.md + semantic version tags

## Evolution

This document will evolve as the project grows (from a single maintainer to a team, technical committee, etc.).
