<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# AGENTS.md

> This file is the **single source of truth for AI agent behavior** on this project.
> It follows the [agents.md](https://agents.md) standard and is read by Claude Code,
> Cursor, Aider, GitHub Copilot, and any other AI coding tool.
>
> Humans, this file is for you too — it documents our conventions and expectations.

## Project

**FocusMCP** — atomic MCP brick orchestrator. Site: https://focusmcp.dev.
Read [VISION.md](./VISION.md) for the full vision, architecture (3 pillars: Registry + EventBus + Router), and design principles.

This repo (`focus-mcp/core`) hosts the **`@focus-mcp/core` library** (Registry + EventBus + Router + SDK + Validator + marketplace resolver), imported by `@focus-mcp/cli`.

## Ecosystem

| Repo | Status | Role |
|---|---|---|
| `focus-mcp/core` (here) | active | TS monorepo lib — 3 pillars + SDK/Validator/Marketplace resolver |
| `focus-mcp/cli` | active | `@focus-mcp/cli` — stdio MCP via `@modelcontextprotocol/sdk`, primary entry point, published on npmjs.org |
| `focus-mcp/marketplace` | active | Official catalog + `bricks/*` + `modules/*`. `catalog.json` served via raw GitHub. |
| `focus-mcp/client` | **archived** | Former Tauri desktop app. Frozen in Phase 2 after CLI-first pivot (2026-04-16). |

## Architecture (post CLI-first pivot, 2026-04-16)

```
AI agent (Claude Code, Cursor, Codex, Gemini…)
       │ stdio (JSON-RPC MCP)
       ▼
@focus-mcp/cli (Node, npm)
  ├─ @modelcontextprotocol/sdk StdioServerTransport
  ├─ import { createFocusMcp } from '@focus-mcp/core'  ← THIS REPO
  └─ (opt-in P1) lateral HTTP admin API
```

The core is imported by the CLI, not the other way around. **Browser-compatible**: no `node:async_hooks`, no Pino — custom logger/tracer primitives only.

The cli-manager (dashboard) does NOT depend on core — it consumes the CLI's HTTP admin API.

## Stack

- **Node.js ≥ 22** (LTS), **pnpm ≥ 10**, **TypeScript 5.7+** strict
- **ESM only** (`"type": "module"`, no CJS)
- **pnpm workspaces** monorepo: `packages/{core,sdk,validator,cli}` (this repo = `core`)
- Companion repos: `focus-mcp/cli` (primary CLI), `focus-mcp/marketplace` (bricks)
- Tests: **Vitest** (unit), **fast-check** (property-based), **Stryker** (mutation), **Playwright** (E2E)
- Lint/format: **Biome 2.x** (not ESLint + Prettier)
- Logger: browser-compatible custom logger (not Pino — incompatible with WebView)
- Tracing: browser-compatible custom tracer (not `node:async_hooks`)

## File layout

All tool configs live in **`config/`** (biome, vitest, playwright, stryker, knip, jscpd, commitlint, lint-staged, gitleaks, tsconfig.base). Root-level files follow strict conventions only (README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG, AGENTS, PRD, package.json, pnpm-workspace.yaml, tsconfig.json, dotfiles).

Long-form docs in **`docs/`** (ROADMAP, GOVERNANCE, ADRs).

```
packages/
  core/      ← Registry, EventBus (guards), Router, manifest parser, observability, marketplace resolver
  sdk/       ← defineBrick helper
  validator/ ← test runner conformance for bricks
  cli/       ← DEPRECATED STUB — real CLI lives in focus-mcp/cli. Remove on next cleanup.
```

## Non-negotiable rules

1. **TDD strict** — write the test BEFORE the code (Red → Green → Refactor)
   - Coverage: ≥ 80% global, ≥ 95% on `event-bus/**` and `registry/**` (critical modules)
2. **No `any`**, no `console.log` (use the browser-compatible logger from `@focus-mcp/core/observability/logger`)
3. **SPDX header** in every source file: `SPDX-FileCopyrightText: 2026 FocusMCP contributors` + `SPDX-License-Identifier: MIT`
4. **Imports**: use `node:` protocol (`import { readFile } from 'node:fs/promises'`)
5. **Commits**: [Conventional Commits](https://www.conventionalcommits.org/) — allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
6. **Brick atomicity**: 1 brick = 1 domain. No catch-all bricks. Convention: `focus-<domain>` or `focus-<parent>-<subdomain>`
7. **No unrequested features** — respect scope strictly
8. **npm scope is `@focus-mcp`** (with hyphen). Never write `@focusmcp` (no hyphen).
9. **Public-facing content in English** — scope: `.github/` (workflows, PR/issue templates, renovate), PR/issue titles + bodies + comments, commit messages, marketplace `mcp-brick.json` descriptions, `bricks/<name>/README.md`, contributor-facing docs (README, AGENTS, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT).

## GitHub Rulesets

Every active repo in the FocusMCP org has two rulesets — do not modify without discussion:

- **`main protection`** — targets `refs/heads/main` ONLY: `required_status_checks`, `pull_request`, `code_scanning` (CodeQL), `code_quality`, `required_linear_history`, `deletion`, `non_fast_forward`. **No `required_signatures`** (AI-assisted commits are not signed).
- **`develop protection`** — targets `refs/heads/develop` ONLY: `deletion`, `non_fast_forward`, `required_linear_history`, `pull_request` (no `code_quality` — this check is not available on non-default branches).
- **Known pitfall**: NEVER include `develop` in the targets of "main protection".

## Commands

```bash
pnpm install              # install (frozen lockfile in CI)
pnpm test                 # run tests
pnpm test:watch           # watch mode
pnpm test:coverage        # with coverage + thresholds
pnpm typecheck            # tsc --noEmit on all packages
pnpm lint                 # Biome check
pnpm lint:fix             # Biome auto-fix
pnpm build                # build all packages
pnpm knip                 # dead code detection
pnpm size                 # bundle size budget
```

## Expected structure for a module in `packages/core`

```
packages/core/src/
  event-bus/
    event-bus.ts          # implementation
    event-bus.test.ts     # Vitest tests (TDD)
    event-bus.spec.ts     # property-based with fast-check
    types.ts              # public types
    index.ts              # public exports
```

## Workflow for adding a feature

1. **Read** [VISION.md](./VISION.md) to understand context
2. **Create an ADR** in `docs/adr/` if it involves an architectural decision
3. **Write specs** (tests) — Red
4. **Implement** the minimum — Green
5. **Refactor**
6. **Coverage**: `pnpm test:coverage` must pass without warnings
7. **Lint + typecheck**: `pnpm lint && pnpm typecheck`
8. **Commit** using Conventional Commits
9. **PR** towards `develop` (never directly to `main`)

## Release process

- **Stable** (`@latest`): push to `main` → `stable-publish.yml` publishes all non-private packages to **npmjs.org**
- **Dev** (`@dev`): push to `develop` → `dev-publish.yml` publishes a versioned dev snapshot to **npmjs.org**
- No Changesets release workflow — publishing is handled directly by the CI workflows above
- Published packages: `@focus-mcp/core`, `@focus-mcp/sdk`, `@focus-mcp/validator` (all at v1.0.0+)

## Catalog

The official brick catalog is served via raw GitHub:

```
https://raw.githubusercontent.com/focus-mcp/marketplace/main/publish/catalog.json
```

## Security

- **No secrets** in code (gitleaks blocks in pre-commit and CI)
- **No `eval`** and no dynamic code construction — use static imports only
- No direct OS filesystem/network access from bricks — goes through injected providers
- OS sandbox is inherited from the parent process. `isolated-vm` available in Phase 2 if needed.

## Git-flow

- **origin**: `git@github.com:focus-mcp/core.git` (GitHub, primary CI via GitHub Actions)
- `develop` is **permanent** — never delete it. **Never `--delete-branch` on a develop→main PR.**
- Feature branches (`feat/*`, `fix/*`, `docs/*`) are ephemeral and auto-deleted after merge.
- All PRs target `develop` (never directly to `main`).

## Priority reading

1. [VISION.md](./VISION.md) — full vision and design principles
2. [CONTRIBUTING.md](./CONTRIBUTING.md) — contribution workflow
3. [docs/adr/](./docs/adr/) — architectural decisions
4. [docs/ROADMAP.md](./docs/ROADMAP.md) — phases and priorities
