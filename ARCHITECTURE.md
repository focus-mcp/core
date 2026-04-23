<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# Architecture — @focus-mcp/core

## Overview

`@focus-mcp/core` is the runtime library behind FocusMCP. It provides the building blocks that
hosts (CLI, desktop app, IDE plugin) use to orchestrate MCP bricks.

```
┌──────────────────────────────────────────────────────┐
│ Host (@focus-mcp/cli, custom server, ...)            │
│  └─ imports @focus-mcp/core                          │
│       ├─ Registry       — brick lifecycle & state    │
│       ├─ EventBus       — tool routing & guards      │
│       ├─ Router         — MCP ↔ bus translation      │
│       ├─ Loader         — dynamic brick loading      │
│       └─ Marketplace    — catalog fetch & resolve    │
└──────────────────────────────────────────────────────┘
```

## Package layout

- `packages/core` — the 3 pillars + loader + marketplace modules + observability
- `packages/sdk` — `defineBrick()` helper for brick authors
- `packages/validator` — conformance test runner for bricks

## Core pillars

### Registry (`packages/core/src/registry/`)

In-memory state machine tracking each brick's lifecycle: `registered → started → running → stopped`.
Exposes `registerBrick()`, `startBrick()`, `stopBrick()`, `getBrick()`, `listBricks()`.

### EventBus (`packages/core/src/event-bus/`)

Routes tool calls and events between bricks. **Central guards**:
- Rate limiting (per-brick, per-tool)
- Permission checks (dependency-based)
- Tracing (OpenTelemetry compatible)
- Error isolation

All bricks talk through the bus — no direct imports between bricks.

### Router (`packages/core/src/router/`)

Translates between the MCP protocol (JSON-RPC tools/list, tools/call) and internal bus events.
Hosts attach their transport (stdio, HTTP) and the router handles the rest.

## Supporting modules

### Loader (`packages/core/src/loader/`)
Dynamically imports brick packages, validates their manifests, and registers them.

### Marketplace (`packages/core/src/marketplace/`)
- `catalog-fetcher` — HTTP fetch of remote `catalog.json`
- `catalog-store` — local persistence of enabled catalogs
- `resolver` — parses catalog, finds bricks by name, semver matching
- `installer` — npm install/uninstall orchestration (for hosts that need it)

### Observability (`packages/core/src/observability/`)
Logger and tracing primitives. Browser-compatible (no `async_hooks`).

## Design principles

1. **Browser-compatible** — no Node-only modules in the hot path (no `async_hooks`, no Pino)
2. **Zero-dep** — only `@opentelemetry/api` as a runtime dependency
3. **Pure core, I/O at the edges** — marketplace modules accept IO adapters; hosts inject them
4. **TypeScript strict** — no `any`, all types exhaustive
5. **TDD** — 100% line coverage on `event-bus`, `registry`; 80% global minimum

## Testing

Vitest unit tests + property-based tests (`fast-check`) on critical invariants.
