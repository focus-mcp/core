<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# Release guide — @focus-mcp/core

This document is for **maintainers** only. External contributors do not need to follow this process.

## Overview

Two publish workflows exist:

| Workflow | Trigger | npm tag |
|----------|---------|---------|
| `dev-publish.yml` | push to `develop` | `dev` |
| `stable-publish.yml` | push to `main` | `latest` |

This monorepo publishes three packages:

| Package | Description |
|---------|-------------|
| `@focus-mcp/core` | Registry, EventBus, Router, Loader, Marketplace modules |
| `@focus-mcp/sdk` | `defineBrick()` helper for brick authors |
| `@focus-mcp/validator` | Conformance test runner |

There is no Changesets "Version Packages" PR. Version bumps are made directly in each `package.json` on `develop` before merging to `main`.

## Release order in the ecosystem

Core is the foundation. Always release in this order:

1. **core** (this repo) — `@focus-mcp/core`, `@focus-mcp/sdk`, `@focus-mcp/validator`
2. **cli** (`focus-mcp/cli`) — depends on `@focus-mcp/core`
3. **marketplace** (`focus-mcp/marketplace`) — may depend on `@focus-mcp/sdk`

Never release cli or marketplace before the core packages they depend on are published on npm.

## Pre-conditions

Before cutting a stable release:

- `develop` and `main` are aligned (no divergence — run `/sync-status` to check).
- All open PRs blocking the milestone are merged to `develop`.
- CI is green on `develop` (lint, typecheck, tests, build, REUSE, gitleaks).
- All three `package.json` files under `packages/` have been bumped to the target version.
- No open PRs that would introduce breaking changes to `@focus-mcp/sdk` (brick authors depend on it).

## Using the `/release` skill

```
/release core <bump>
```

Where `<bump>` is `patch`, `minor`, or `major`. The skill:

1. Verifies pre-conditions.
2. Bumps the versions in all three `packages/*/package.json`.
3. Commits `chore: release vX.Y.Z`.
4. Opens a sync PR (`develop` → `main`).
5. CI on `main` runs `stable-publish.yml` → publishes all three packages to npm with the `latest` tag.
6. The back-merge workflow re-syncs `main` → `develop`.

## Manual fallback

If the `/release` skill is unavailable or fails:

```bash
# 1. Ensure you are on develop and up to date
git checkout develop
git fetch origin && git rebase origin/develop

# 2. Bump versions in all packages (edit package.json files manually)
#    packages/core/package.json
#    packages/sdk/package.json
#    packages/validator/package.json

# 3. Verify build
pnpm build

# 4. Commit
git add packages/core/package.json packages/sdk/package.json packages/validator/package.json
git commit -m "chore: release vX.Y.Z"

# 5. Push develop — triggers dev-publish.yml (npm tag: dev)
git push origin develop

# 6. Open a PR: develop → main
gh pr create --title "chore: release vX.Y.Z" --base main --head develop \
  --body "Stable release — merge to trigger stable-publish.yml"

# 7. Once merged, stable-publish.yml publishes to npm (tag: latest)
```

## Recovery back-merge

If the back-merge workflow fails after a release (i.e. `main` is ahead of `develop`):

```bash
/back-merge core
```

Or manually:

```bash
git checkout -b chore/back-merge-main-$(date +%Y%m%d)
git fetch origin
git merge origin/main --no-ff -m "chore: back-merge main → develop"
git push origin HEAD
gh pr create --title "chore: back-merge main → develop" --base develop --head HEAD \
  --body "Recovery back-merge after release."
```

## Verification post-release

After the stable workflow completes:

```bash
# Check the published versions
npm view @focus-mcp/core version
npm view @focus-mcp/sdk version
npm view @focus-mcp/validator version

# Check dist-tags
npm view @focus-mcp/core dist-tags

# Verify git tag
git fetch --tags origin
git tag --sort=-version:refname | head -5

# Check GitHub Release was created
gh release list --repo focus-mcp/core --limit 5
```

## npm OIDC Trusted Publishing

No `NPM_TOKEN` secret is used. Publishing relies on npm OIDC Trusted Publishing (configured since July 2025). The workflows require `id-token: write` permission and a registered Trusted Publisher on npmjs.com for each of the three packages.

See [RELEASE_OIDC_SETUP.md](../RELEASE_OIDC_SETUP.md) at the root of the `focusmcp` workspace for setup instructions if you need to configure a new package or re-configure an existing one.
