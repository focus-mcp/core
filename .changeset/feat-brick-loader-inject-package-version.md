---
"@focus-mcp/core": minor
---

feat(loader): inject package.json version into manifest when missing

Adds an optional `BrickSource.readPackageVersion(name)` hook on the `BrickSource` interface. When a source implements it, `loadBricks()` calls it for each brick and injects the returned value into the raw `mcp-brick.json` (disk) and the module-exported manifest before they reach `parseManifest()`.

This fixes the long-standing `INVALID_VERSION` error every brick triggered when loaded via the CLI: published `@focus-mcp/brick-*` packages don't carry a `version` field inside `mcp-brick.json` — the version lives in their `package.json`. Without this hook, the manifest validator legitimately rejected them.

The hook is optional. Sources that don't implement it (or return `undefined`) keep the existing INVALID_VERSION behaviour. Existing manifests with an explicit `version` are not overwritten — the package.json fallback only fills in missing values.

Pair with `@focus-mcp/cli@2.4.1` (or later), which now implements `readPackageVersion()` on `FilesystemBrickSource` by resolving `@focus-mcp/brick-<name>/package.json`.
