---
'@focus-mcp/core': minor
---

Add `planUpgrade` and `executeUpgrade` orchestration to marketplace.

Moves upgrade logic from CLI into core so that any consumer (CLI, MCP server, future client) can call `executeUpgrade` directly without going through the CLI command layer.

Exports: `planUpgrade`, `executeUpgrade`, `PlanUpgradeInput`, `ExecuteUpgradeInput`, `UpgradeIO`, `UpgradeItem`, `UpgradeResult`.
