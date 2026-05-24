---
---

Cross-cutting CI: fix `stable-publish` and `dev-publish` workflows to use Trusted Publishers OIDC correctly. Node 22 ships with npm 10.x, but OIDC token exchange requires npm 11+, so we explicitly install `npm@^11`. The static `NODE_AUTH_TOKEN` env var was also blocking OIDC (npm tries it first and only falls back on specific failures) — removed in favor of `NPM_CONFIG_PROVENANCE=true`. Same fix as `@focus-mcp/marketplace` and `@focus-mcp/cli`. No runtime change, no npm package bump.
