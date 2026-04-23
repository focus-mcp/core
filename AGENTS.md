<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# AGENTS.md

> Instructions pour les agents AI travaillant sur ce dépôt (Claude Code, Cursor, Codex, Copilot, Gemini CLI, Aider, etc.).
> Format inspiré de la convention émergente [agents.md](https://agentsmd.net/).

## Projet

**FocusMCP** — orchestrateur de briques MCP atomiques. Site : https://focusmcp.dev.
Lire [PRD.md](./PRD.md) pour la vision complète, l'architecture (3 piliers : Registry + EventBus + Router), et les décisions prises.

## Stack

- **Node.js ≥ 22** (LTS), **pnpm ≥ 10**, **TypeScript 5.7+** strict
- **ESM only** (`"type": "module"`, pas de CJS)
- Monorepo **pnpm workspaces** : `packages/{core,sdk,cli}` (ce repo = `core`)
- Repos compagnons : `focus-mcp/client` (Tauri), `focus-mcp/marketplace` (briques)
- Tests : **Vitest** (unit), **fast-check** (property-based), **Stryker** (mutation), **Playwright** (E2E)
- Lint/format : **Biome 2.x** (pas ESLint+Prettier)
- Logs : **pino** (`@focus-mcp/core/observability/logger`)
- Tracing : **OpenTelemetry**

## Organisation des fichiers

Toutes les configs outils sont regroupées dans **`config/`** (biome, vitest, playwright, stryker, knip, jscpd, commitlint, lint-staged, gitleaks, tsconfig.base). À la racine on garde uniquement les conventions strictes (README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG, AGENTS, PRD, package.json, pnpm-workspace.yaml, tsconfig.json, .gitlab-ci.yml, dotfiles standards).

Docs longue forme dans **`docs/`** (ROADMAP, GOVERNANCE, ADRs).

## Règles non-négociables

1. **TDD strict** — écrire le test AVANT le code (Red → Green → Refactor)
   - Coverage : ≥ 80% global, ≥ 95% sur `event-bus/**` et `registry/**`
2. **Pas de `any`**, pas de `console.log` (utiliser le logger pino)
3. **SPDX header** dans tous les fichiers source : `SPDX-FileCopyrightText: 2026 FocusMCP contributors` + `SPDX-License-Identifier: MIT`
4. **Imports** : `node:` protocol (`import { readFile } from 'node:fs/promises'`)
5. **Commits** : [Conventional Commits](https://www.conventionalcommits.org/) — types autorisés : `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
6. **Atomicité des briques** : 1 brique = 1 domaine. Pas de brique fourre-tout. Convention `focus-<domaine>` ou `focus-<parent>-<sous-domaine>`
7. **Pas de feature non demandée** — respecter strictement le périmètre

## Commandes

```bash
pnpm install              # install (frozen lockfile en CI)
pnpm test                 # tests
pnpm test:watch           # watch mode
pnpm test:coverage        # avec coverage + thresholds
pnpm typecheck            # tsc --noEmit sur tous les packages
pnpm lint                 # Biome check
pnpm lint:fix             # Biome auto-fix
pnpm build                # build des packages
pnpm knip                 # détection de dead code
pnpm size                 # bundle size budget
pnpm changeset            # créer un changeset (avant de merger)
```

## Structure attendue d'un module dans `packages/core`

```
packages/core/src/
  event-bus/
    event-bus.ts          # implémentation
    event-bus.test.ts     # tests Vitest (TDD)
    event-bus.spec.ts     # property-based avec fast-check
    types.ts              # types publics
    index.ts              # exports publics
```

## Workflow type pour ajouter une feature

1. **Lire** le PRD pour comprendre le contexte
2. **Créer un ADR** dans `docs/adr/` si décision architecturale
3. **Écrire les specs** (tests) — Red
4. **Implémenter** le minimum — Green
5. **Refactor**
6. **Coverage** : `pnpm test:coverage` doit passer sans warning
7. **Lint + typecheck** : `pnpm lint && pnpm typecheck`
8. **Changeset** : `pnpm changeset`
9. **Commit** Conventional Commits
10. **MR** vers `main`

## Sécurité

- **Aucun secret** dans le code (gitleaks bloque en pre-commit)
- **Pas de `eval`**, pas de `new Function()`
- Toute exécution de code arbitraire passe par la brique `focus-sandbox` (V8 isolé)
- Tout accès filesystem/réseau côté brique passe par Tauri (rust)

## Remote Git

- **origin** : `git@github.com:focus-mcp/core.git` (GitHub, CI principale via GitHub Actions)

## Inspirations / sources

Voir la section "Inspirations" dans [PRD.md](./PRD.md). Notamment : Context Mode (sandbox + memory), Claude Octopus (worktrees + reactor), modelcontextprotocol/servers (concept Sequential Thinking).

## Documentation à consulter en priorité

1. [PRD.md](./PRD.md) — vision et architecture complète
2. [CONTRIBUTING.md](./CONTRIBUTING.md) — workflow contribution
3. [docs/adr/](./docs/adr/) — décisions architecturales
4. [ROADMAP.md](./ROADMAP.md) — phases et priorités
