<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# FocusMCP Core — Roadmap

See [VISION.md](../VISION.md) for the project vision and design principles.

> This repo contains the **runtime library** (Registry + EventBus + Router + SDK + Validator + Marketplace resolver).
> The CLI lives in [`focus-mcp/cli`](https://github.com/focus-mcp/cli).
> Official bricks are in [`focus-mcp/marketplace`](https://github.com/focus-mcp/marketplace).

## Phase 0 — Foundations (complete — v1.0.0)

- [x] PRD finalised
- [x] Monorepo setup + professional tooling (TS strict, Biome, Vitest, husky, GitHub Actions CI)
- [x] Core TS interfaces (Brick, Manifest, Tool, EventBus, Registry, Router)
- [x] `InProcessEventBus` (TDD, coverage ≥ 95%)
- [x] `InMemoryRegistry` (TDD, coverage 100%)
- [x] `McpRouter` (TDD, coverage 100%)
- [x] Manifest parser (`parseManifest`) — strict kebab-case + semver validation
- [x] SDK `defineBrick` helper (`@focus-mcp/sdk`)
- [x] Validator test runner (`@focus-mcp/validator`)
- [x] Bootstrap helper (`createFocusMcp`)
- [x] Browser-compatible observability (logger, tracing — no Pino, no `node:async_hooks`)
- [x] Marketplace resolver (catalog fetcher + installer)
- [x] Published to npmjs.org: `@focus-mcp/core`, `@focus-mcp/sdk`, `@focus-mcp/validator` @ v1.0.0
- [x] CI: `stable-publish.yml` (main → `@latest`), `dev-publish.yml` (develop → `@dev`)

## Phase 1 — CLI and ergonomics (in progress)

- [x] `@focus-mcp/cli` — `focus add`, `focus remove`, `focus list`, `focus search`, `focus catalog`
- [ ] `focus start/stop/status/logs` commands
- [ ] Config files: `.centerrc`, `center.json`, `center.lock`
- [ ] Dynamic brick loading at runtime (hot-reload)
- [ ] MCP spec conformance suite vs [`Everything`](https://github.com/modelcontextprotocol/servers/tree/main/src/everything) reference server

## Phase 2 — Core maturity

- [ ] EventBus rate limiting + circuit breaker (full guard suite)
- [ ] Inter-brick permissions (manifest `dependencies` whitelist enforced)
- [ ] Metrics aggregated per brick + OpenTelemetry traces export
- [ ] Optional authentication for server mode
- [ ] Third-party catalog sources (URL, GitHub org, local)
- [ ] Auto-update for bricks and catalogs

## Phase 3 — Ecosystem

- [ ] Hook-based routing adapters (Claude Code, Cursor, Codex…)
- [ ] Full brick author documentation
- [ ] Desktop app Phase 2 (`focus-mcp/client` Tauri — currently archived)
