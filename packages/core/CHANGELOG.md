# @focus-mcp/core

## 1.1.0

### Minor Changes

- Ship PR #38 `removeSource --force` option + PR #34 CI workflow fix. No API breakage.
- 29d5edd: fix(catalog-store): allow removing the default catalog source with `force` option

  `removeSource` now accepts an optional third argument `{ force: true }` which
  bypasses the default-source protection. Without `force`, the existing
  "Cannot remove the default catalog source" error is preserved.
