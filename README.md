<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# @focus-mcp/core

> Runtime library for FocusMCP — the MCP orchestrator that reduces AI context from 200k to ~2k tokens.

[![npm version](https://img.shields.io/npm/v/@focus-mcp/core.svg)](https://www.npmjs.com/package/@focus-mcp/core)
[![license](https://img.shields.io/npm/l/@focus-mcp/core.svg)](./LICENSE)
[![CI](https://github.com/focus-mcp/core/actions/workflows/ci.yml/badge.svg)](https://github.com/focus-mcp/core/actions/workflows/ci.yml)
![Built with Claude Code](https://img.shields.io/badge/built_with-Claude_Code-8A2BE2)

## What is this?

`@focus-mcp/core` is the library that powers [`@focus-mcp/cli`](https://github.com/focus-mcp/cli).

It provides the **Registry**, **EventBus**, **Router**, **SDK**, **Validator**, and **marketplace resolver** — the three pillars that let atomic MCP bricks communicate, compose, and serve AI agents with minimal context overhead.

> **Without FocusMCP**: the AI reads 50 raw files → 200k tokens consumed
> **With FocusMCP**: bricks index, analyse, filter → the AI receives ~2k tokens of relevant output

**End users should install [`@focus-mcp/cli`](https://github.com/focus-mcp/cli)**, not this package directly.
This package is for building custom FocusMCP hosts — servers, IDE integrations, or alternative transports.

## Install

```bash
npm install @focus-mcp/core
```

## Quick start

```typescript
import { createFocusMcp } from '@focus-mcp/core';
import { defineBrick } from '@focus-mcp/sdk';

// Define a brick
const myBrick = defineBrick({
  manifest: {
    name: 'my-brick',
    version: '1.0.0',
    description: 'Example brick',
    tools: [{ name: 'my_tool', description: 'Does something useful' }],
  },
  setup({ eventBus }) {
    return {
      'my_tool': async ({ input }) => ({ result: `Processed: ${input}` }),
    };
  },
});

// Bootstrap the runtime
const focus = await createFocusMcp();
await focus.registry.register(myBrick);

// Handle MCP tool calls
const result = await focus.router.handle('my_tool', { input: 'hello' });
```

## Architecture

`@focus-mcp/core` is built on three pillars:

### 1. McpRegistry — The directory

Knows every brick, its manifest, its dependencies, and its runtime state. Resolves the full dependency graph (topological order, cycle detection) before startup.

```typescript
registry.register(brick)          // register a brick + its manifest
registry.resolve('my-brick')      // resolve full dependency tree
registry.getStatus('my-brick')    // running | stopped | error | starting
registry.getTools()               // all tools exposed by all active bricks
```

### 2. EventBus — The nervous system

Bricks never call each other directly. All inter-brick communication goes through the EventBus, with built-in guards:

| Guard | Protection |
|---|---|
| Max call depth | Prevents infinite loops (A → B → A…) |
| Timeout | Cuts unresponsive calls after N seconds |
| Rate limit | Throttles noisy bricks |
| Permissions | Whitelist via `dependencies` in the manifest |
| Payload size | Rejects oversized payloads |
| Circuit breaker | Temporarily disables unstable bricks |

```typescript
eventBus.emit('files:indexed', { path: 'src/', files: [...] })
const result = await eventBus.request('indexer:search', { pattern: '*.ts' })
```

### 3. McpRouter — The gateway

Receives MCP calls (`tools/list`, `tools/call`) from the transport layer and dispatches them to the right brick via the EventBus.

```typescript
router.handle('my_tool', { input: 'hello' })
// → Registry: "who handles this tool?" → brick "my-brick"
// → EventBus: request("my-brick:my_tool", ...)
// → returns result
```

## Companion packages

| Package | Role |
|---|---|
| [`@focus-mcp/core`](https://www.npmjs.com/package/@focus-mcp/core) | This package — Registry, EventBus, Router, observability |
| [`@focus-mcp/sdk`](https://www.npmjs.com/package/@focus-mcp/sdk) | `defineBrick` helper for brick authors |
| [`@focus-mcp/validator`](https://www.npmjs.com/package/@focus-mcp/validator) | Conformance test runner for third-party bricks |
| [`@focus-mcp/cli`](https://github.com/focus-mcp/cli) | Primary end-user entry point — `focus add`, `focus list`, … |

## Companion repositories

- [`focus-mcp/cli`](https://github.com/focus-mcp/cli) — CLI MCP server (primary distribution)
- [`focus-mcp/marketplace`](https://github.com/focus-mcp/marketplace) — Official brick catalog

## Development

```bash
nvm use                  # Node 22+
pnpm install
pnpm test                # Vitest
pnpm test:coverage       # with coverage thresholds
pnpm typecheck
pnpm lint
pnpm build
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## AI-assisted development

FocusMCP was built with heavy Claude Code assistance — its architecture, implementation,
docs, and tests have all been co-authored with AI. We embrace this openly because:

1. **Transparency matters** — we'd rather disclose it than pretend otherwise
2. **AI tooling is the context** — we're building tools for AI agents, it makes sense to use them
3. **Quality over origin** — what matters is that the code is tested, reviewed, and working

**Your AI-assisted contributions are welcome.** We don't require you to hide the fact that
Claude, Copilot, Cursor, or any other tool helped you. What we do expect:

- Tests pass, code is typed, lint is green
- You've read the diff and understand what the PR does
- Conventional Commits, clear PR description
- You can explain your design choices during review

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guidelines.

## License

[MIT](./LICENSE)
