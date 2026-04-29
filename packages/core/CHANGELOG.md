<!--

## 1.5.0
### Minor Changes

- 392a1f0: feat(core): expose keywords and recommendedFor in bricks search

  Extend CatalogBrick, BrickManifest and parseBrick to support two new
  optional fields: keywords (free-form tags) and recommendedFor
  (stack/framework hints). searchBricks now matches on both fields in
  addition to name, description and tags.

## 1.4.0
### Minor Changes

- d447e61: feat(core): add update-checker module for cli + bricks update detection

## 1.3.1
### Patch Changes

- cdf988f: chore(ci): auto-tag and create GitHub Release on stable publish
- 343e448: fix(ci): use calculated version for dev snapshots (no more 0.0.0-dev-X tags)

## 1.3.0
### Minor Changes

- 076251d: Add `tool-config` module for pure, browser-compatible tool visibility management.

  Exports:
  - `parseToolConfig(raw)` — parse `~/.focus/config.json` tools section
  - `matchesToolPattern(toolName, pattern)` — glob pattern matching (trailing `*`)
  - `isToolHidden(toolName, config, alwaysVisible?)` — check hidden list with `focus_tools` immunity
  - `shouldAlwaysLoad(toolName, config, serverDefaults?)` — check user-pin + server defaults
  - `hideTool(pattern, io)` — add to hidden list
  - `showTool(pattern, io)` — remove from hidden list
  - `pinTool(pattern, io)` — add to alwaysLoad list
  - `unpinTool(pattern, io)` — remove from alwaysLoad list
  - `listToolsConfig(io)` — format hidden + alwaysLoad lists
  - `clearToolsConfig(io)` — reset both lists

  The module is IO-injected (`ToolConfigIO`) and has no filesystem dependencies — the CLI supplies a Node.js adapter.

## 1.2.0
### Minor Changes

- dac4507: Add `planUpgrade` and `executeUpgrade` orchestration to marketplace.

  Moves upgrade logic from CLI into core so that any consumer (CLI, MCP server, future client) can call `executeUpgrade` directly without going through the CLI command layer.

  Exports: `planUpgrade`, `executeUpgrade`, `PlanUpgradeInput`, `ExecuteUpgradeInput`, `UpgradeIO`, `UpgradeItem`, `UpgradeResult`.
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# @focus-mcp/core

## 1.1.0

### Minor Changes

- Ship PR #38 `removeSource --force` option + PR #34 CI workflow fix. No API breakage.
- 29d5edd: fix(catalog-store): allow removing the default catalog source with `force` option

  `removeSource` now accepts an optional third argument `{ force: true }` which
  bypasses the default-source protection. Without `force`, the existing
  "Cannot remove the default catalog source" error is preserved.
