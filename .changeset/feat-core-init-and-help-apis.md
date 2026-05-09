---
"@focus-mcp/core": minor
---

feat(core): add init and help APIs for self-bootstrap

- `init/detectStack(files)` : detects project stack (TS/JS/Python/Go/Rust/monorepo/generic) + frameworks via injected ProjectFiles interface
- `init/recommendBricks(stack)` : returns recommended bricks for a given stack
- `init/initProject(files)` : convenience function combining the two
- `help/getHelpIndex()` : returns concepts index + AGENT_GUIDE / README URLs
- `help/getConcept(key)` : returns a specific concept

Used by cli@>=2.4.0 to expose `focus_init` and `focus_help` MCP tools.

Browser-compatible: no node:* imports, IO interface injected.
