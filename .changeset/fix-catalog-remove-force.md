---
'@focus-mcp/core': patch
---

fix(catalog-store): allow removing the default catalog source with `force` option

`removeSource` now accepts an optional third argument `{ force: true }` which
bypasses the default-source protection. Without `force`, the existing
"Cannot remove the default catalog source" error is preserved.
