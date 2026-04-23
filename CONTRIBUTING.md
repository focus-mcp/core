<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# Contributing to FocusMCP

Thank you for your interest in FocusMCP. This document explains how to contribute.

## AI-assisted contributions

FocusMCP was largely built with Claude Code. We encourage and welcome AI-assisted PRs.

**You don't need to hide it.** If Claude wrote the code, just say so in the PR description
(`Generated with Claude Code`, `Co-authored by GPT-4`, whatever's accurate). Bonus points
for including the prompt or the key instructions you used.

**What we care about, regardless of who wrote it:**

- ✅ Tests pass
- ✅ Types are strict (no `any`, no `@ts-ignore` without a comment)
- ✅ Lint is green (`pnpm lint`)
- ✅ Coverage ≥ 80% (100% on critical modules)
- ✅ Commit messages follow Conventional Commits
- ✅ PR has a clear description — "what, why, how to verify"
- ✅ You understand the diff and can discuss design during review

**What gets you rejected:**

- ❌ Obviously untested AI slop (generated code that doesn't run)
- ❌ PRs with no description, just "here's some code"
- ❌ Hidden AI use that makes review confusing

We don't care if you used AI, we care if the PR is good.

## Code of Conduct

All contributors are expected to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Workflow

1. **Fork** the repo and create a branch: `git checkout -b feat/my-feature`
2. **Code with TDD**: write tests BEFORE the code (Red → Green → Refactor)
3. **Lint + format**: `pnpm lint:fix`
4. **Typecheck**: `pnpm typecheck`
5. **Test**: `pnpm test` (coverage ≥ 80% global, ≥ 95% on EventBus/Registry)
6. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/) — enforced by commitlint
7. **Push** and open a Pull Request on [GitHub](https://github.com/focus-mcp/core/pulls) targeting `develop`

> PRs must target `develop`, not `main`. The `develop` branch is permanent — never force-delete it.

## Standards

- **TypeScript strict** (configured in `config/tsconfig.base.json`)
- **TDD strict** — coverage thresholds are enforced in CI
- **Conventional Commits**: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `build`, `ci`, `style`, `revert`
- **SPDX headers** in every source file (`SPDX-License-Identifier: MIT`)
- **REUSE compliance** verified in CI
- **No `console.log`**: use the logger from `@focus-mcp/core`
- **No `any`**: TypeScript strict + Biome `noExplicitAny`
- **`node:` import protocol**: always prefix Node built-ins with `node:`

## Release process

Releases are triggered automatically by CI:

- **`@dev` tag** — push to `develop` runs `dev-publish.yml`, which publishes a timestamped snapshot to npmjs.org
- **`@latest` tag** — push to `main` runs `stable-publish.yml`, which publishes the stable release to npmjs.org

There is no manual Changesets release step. Version bumps are managed directly in the package manifests before merging to `main`.

## npm scope

All packages are published under the `@focus-mcp` scope (with hyphen):

- `@focus-mcp/core`
- `@focus-mcp/sdk`
- `@focus-mcp/validator`

## Developing a brick

See [packages/sdk/README.md](./packages/sdk/README.md) for the brick authoring guide.

## Architecture Decision Records (ADR)

Any significant architectural decision must be documented in [`docs/adr/`](./docs/adr/).
Format: [MADR](https://adr.github.io/madr/).

## Reporting a bug / proposing a feature

Open an issue using the appropriate template: [bug](https://github.com/focus-mcp/core/issues/new?template=bug.yml) or [feature](https://github.com/focus-mcp/core/issues/new?template=feature.yml).

## Security

Vulnerabilities must be reported **privately** — see [SECURITY.md](./SECURITY.md).
