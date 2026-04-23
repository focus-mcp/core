<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# Vision — @focus-mcp/core

## The problem

MCP clients load all tools at startup. An agent asked "fix this bug" shouldn't need the schemas of 100 tools in context. Every unused tool is wasted tokens, wasted attention, wasted reasoning.

## What we're building

`@focus-mcp/core` is the runtime that makes **composable, on-demand MCP** possible.

Three primitives:

- **Registry** — tracks which bricks are available, their state, and their dependencies
- **EventBus** — routes tool calls between bricks with central guards (rate limiting, permissions, tracing)
- **Router** — translates MCP protocol to brick calls

A brick is an atomic module that declares a manifest, exposes tools, and speaks to the bus. The core doesn't know or care what bricks do — it just orchestrates them.

## Why a library, not a framework

Hosts (CLI, desktop app, IDE plugin, browser) have different runtime constraints. Core is **browser-compatible**, zero dependencies beyond OpenTelemetry, and doesn't own the transport layer. Each host wires its own.

## Design principles

1. **Composition over configuration** — bricks are loaded, not configured
2. **Atomicity** — one brick, one domain
3. **Discoverability** — bricks declare their shape; the catalog doesn't hard-code anything
4. **Observability by default** — every tool call is traced, logged, and auditable
5. **Security at the bus** — guards live centrally, not scattered across bricks

## Non-goals

- We don't replace the MCP spec — we implement it
- We don't build AI agents — we focus their existing ones
- We don't own distribution — bricks are npm packages
