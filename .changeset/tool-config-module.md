---
'@focus-mcp/core': minor
---

Add `tool-config` module for pure, browser-compatible tool visibility management.

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
