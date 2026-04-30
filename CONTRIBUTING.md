<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# Contributing to FocusMCP core

Thank you for your interest in FocusMCP. This document explains how to contribute.

## AI-assisted contributions

FocusMCP was largely built with Claude Code. We encourage and welcome AI-assisted PRs.

**You don't need to hide it.** If Claude wrote the code, just say so in the PR description
(`Generated with Claude Code`, `Co-authored by GPT-4`, whatever's accurate). Bonus points
for including the prompt or the key instructions you used.

**What we care about, regardless of who wrote it:**

- Tests pass
- Types are strict (no `any`, no `@ts-ignore` without a comment)
- Lint is green (`pnpm lint`)
- Coverage >= 80% (100% on critical modules)
- Commit messages follow Conventional Commits
- PR has a clear description — "what, why, how to verify"
- You understand the diff and can discuss design during review

**What gets you rejected:**

- Obviously untested AI slop (generated code that doesn't run)
- PRs with no description, just "here's some code"
- Hidden AI use that makes review confusing

We don't care if you used AI, we care if the PR is good.

## Code of Conduct

All contributors are expected to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Architecture — the golden rule

`@focus-mcp/core` is the brains. The CLI and other hosts are thin wrappers.

> **Rule: any non-trivial logic belongs in core, never in the CLI or other consumers.**

The three pillars of core:

- **Registry** — brick lifecycle state machine (`registered → started → running → stopped`)
- **EventBus** — routes tool calls between bricks, applies rate limiting, permission checks, tracing
- **Router** — translates MCP protocol (JSON-RPC) to internal bus events and back

Additional packages in this monorepo:

- `packages/sdk` — `defineBrick()` helper for brick authors (browser-compatible)
- `packages/validator` — conformance test runner for bricks

The core is designed to be **browser-compatible**. Do not add Node.js-only imports to `packages/core` or `packages/sdk`. Node-specific adapters live in the CLI.

The **update-checker** pattern (`packages/core/src/update-checker/`) is the reference for background tasks that must not block the main event loop.

## Git workflow

```
main       ← stable releases only (never commit directly)
develop    ← integration branch (persistent, never force-delete)
feat/*     ← feature branches, branch FROM develop
fix/*      ← bug fix branches, branch FROM develop
docs/*     ← documentation branches
```

1. **Fork** the repo and branch from `develop` (`git checkout -b feat/my-feature origin/develop`).
2. **Code with TDD**: write tests BEFORE the code (Red → Green → Refactor).
3. **Open a PR targeting `develop`**. `main` is release-only.
4. **Auto-merge** is enabled: once CI passes and at least one review is approved, the PR merges automatically.
5. **Never force-push** to `develop` or `main`.

> PRs must target `develop`, not `main`. The `develop` branch is permanent — never force-delete it.

## Commit conventions

Enforced by commitlint (`config/commitlint.config.js`):

| Rule | Value |
|------|-------|
| Types allowed | `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, `release` |
| Header max length | 100 characters |
| Body max line length | disabled |
| Footer max line length | disabled |
| Subject case | lowercase (not UPPER, not PascalCase, not Start Case) |

Scope is the package or subsystem: `feat(registry): ...`, `fix(event-bus): ...`, `docs(sdk): ...`.

## Quality gates

Before opening a PR:

```bash
pnpm lint
pnpm typecheck
pnpm test              # coverage >= 80% global, >= 95% on EventBus/Registry
pnpm build
pnpm reuse             # REUSE compliance (SPDX headers)
```

Never use `--no-verify` to bypass these checks — CI enforces them regardless.

## Standards

- **TypeScript strict** (configured in `config/tsconfig.base.json`)
- **TDD strict** — coverage thresholds enforced in CI
- **Conventional Commits**: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `build`, `ci`, `style`, `revert`
- **SPDX headers** in every source file — `SPDX-FileCopyrightText` + `SPDX-License-Identifier` set to `MIT`
- **REUSE compliance** verified in CI
- **No `console.log`**: use the logger from `@focus-mcp/core`
- **No `any`**: TypeScript strict + Biome `noExplicitAny`
- **`node:` import protocol**: always prefix Node built-ins with `node:`
- **Browser-compatible core**: no Node.js-only APIs in `packages/core` or `packages/sdk`

## npm scope

All packages are published under the `@focus-mcp` scope (with hyphen):

- `@focus-mcp/core`
- `@focus-mcp/sdk`
- `@focus-mcp/validator`

Never write `@focusmcp` (without hyphen) in new code, docs, or commit messages.

## Common pitfalls

- **Browser-compat breakage** — importing `node:fs`, `node:path`, or any Node built-in in `packages/core` or `packages/sdk` breaks browser consumers. Use dependency injection or move the logic to the CLI.
- **EventBus/Registry coverage drop** — these modules have a >= 95% coverage threshold. Touching them without full tests will fail CI.
- **`develop` ↔ `main` divergence** — if CI reports that `develop` is behind `main`, wait for the maintainer to run the back-merge workflow. Do not manually merge `main` into your branch.
- **update-checker side effects** — background checks must be non-blocking and must not throw unhandled rejections. Mirror the existing update-checker pattern.
- **ADR missing** — significant architectural decisions (new pillar, protocol change, new cross-cutting concern) require a new ADR in `docs/adr/`.

## Developing a brick

See [packages/sdk/README.md](./packages/sdk/README.md) for the brick authoring guide.

Bricks developed in this repo are primitives and infrastructure. Domain-specific bricks belong in the [marketplace](https://github.com/focus-mcp/marketplace).

## Architecture Decision Records (ADR)

Any significant architectural decision must be documented in [`docs/adr/`](./docs/adr/).
Format: [MADR](https://adr.github.io/madr/).

## Reporting a bug / proposing a feature

Open an issue using the appropriate template: [bug](https://github.com/focus-mcp/core/issues/new?template=bug.yml) or [feature](https://github.com/focus-mcp/core/issues/new?template=feature.yml).

## Security

Vulnerabilities must be reported **privately** — see [SECURITY.md](./SECURITY.md).

## Release process

See [docs/RELEASE.md](./docs/RELEASE.md) for the full release guide (for maintainers).

The core must be released **before** the CLI when both are updated together. The marketplace may depend on `@focus-mcp/sdk` — always release core first.
