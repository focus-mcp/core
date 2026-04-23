<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# CLAUDE.md — @focus-mcp/core

> Auto-chargé par Claude Code (et tout outil compatible agents.md) lors du travail sur ce repo.
> Ce fichier est la **source de vérité pour le comportement des agents AI** sur ce projet. Il remplace
> l'ancien système `~/.claude/projects/**/memory/` — ne pas recréer ce dossier.

## Projet

**FocusMCP** — orchestrateur MCP. Réduit le contexte des agents AI de 200k à ~2k tokens en composant
des **briques** (modules MCP atomiques) qui communiquent via un EventBus avec des garde-fous centraux.
Site : [focusmcp.dev](https://focusmcp.dev). Vision complète : [VISION.md](./VISION.md).

Ce repo héberge la **bibliothèque `@focus-mcp/core`** (Registry + EventBus + Router + SDK +
Validator + marketplace resolver) importée par le CLI.

## Écosystème (3 repos actifs + 1 archivé)

| Repo | Statut | Rôle |
|---|---|---|
| `focus-mcp/core` (ici) | actif | Monorepo lib TS — 3 piliers + SDK/Validator/Marketplace resolver |
| `focus-mcp/cli` | actif | `@focus-mcp/cli` — stdio MCP via `@modelcontextprotocol/sdk`, entrée primaire, publié npmjs.org |
| `focus-mcp/marketplace` | actif | Catalogue officiel + `bricks/*` + `modules/*`. `catalog.json` servi via raw GitHub. |
| `focus-mcp/client` | **archivé** | Ex desktop Tauri. Pivot CLI-first (2026-04-16) a gelé ce repo en Phase 2. |

## Architecture (post-pivot CLI-first, 2026-04-16)

```
Agent AI (Claude Code, Cursor, Codex, Gemini…)
       │ stdio (JSON-RPC MCP)
       ▼
@focus-mcp/cli (Node, npm)
  ├─ @modelcontextprotocol/sdk StdioServerTransport
  ├─ import { createFocusMcp } from '@focus-mcp/core'  ← CE REPO
  └─ (opt-in P1) admin API HTTP côté latéral
```

**Le core** est importé par la CLI (pas l'inverse). **Browser-compatible** : pas de
`node:async_hooks`, pas de Pino, primitives custom côté logger/tracing.

**Le cli-manager (dashboard)** ne dépend PAS du core — il consomme l'admin API HTTP de la CLI.

## Distribution (v1.0.0)

- `@focus-mcp/core`, `@focus-mcp/sdk`, `@focus-mcp/validator` publiés sur **npmjs.org** à v1.0.0
- Scope canonique : **`@focus-mcp/*`** (avec tiret)
- `stable-publish.yml` : push sur `main` → publication `@latest` sur npmjs.org
- `dev-publish.yml` : push sur `develop` → publication `@dev` (snapshot versionné) sur npmjs.org
- Pas de workflow Changesets — les versions sont gérées directement dans les manifestes avant merge sur `main`
- Catalog : `https://raw.githubusercontent.com/focus-mcp/marketplace/main/publish/catalog.json`

## Règles non-négociables (applicables à TOUS les repos FocusMCP)

1. **TDD strict** — tests AVANT le code (Red → Green → Refactor). Coverage ≥ **80 %** global,
   ≥ **95 %** sur `event-bus/**` et `registry/**` (modules critiques).
2. **Périmètre strict** — pas de features ou décisions non explicitement demandées. Demander avant d'ajouter.
3. **Standards pro** — TS strict (pas de `any`), Biome (pas ESLint+Prettier), Conventional
   Commits (enforced via commitlint), husky + lint-staged, semver, SPDX headers (REUSE),
   ADRs pour les décisions archi.
4. **Imports** : toujours `node:` protocol (`import … from 'node:fs/promises'`).
5. **Contenu public-facing en anglais** — tout nouveau contenu public, et toute mise à jour
   substantielle d'un contenu public existant, est rédigé en anglais. Périmètre :
   - `.github/` (workflows YAML, PR template, issue templates, renovate)
   - Titres + descriptions de PR, commentaires de PR, messages de commit
   - Titres + descriptions d'issues
   - Marketplace : `mcp-brick.json` description/tools, `bricks/<name>/README.md`
   - Docs contributor-facing : `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`,
     `CODE_OF_CONDUCT.md`
   - Exception permanente : `CLAUDE.md` (ce fichier, guide d'agent interne) reste en français.
6. **Git-flow strict** — `develop` est **permanente**, jamais `--delete-branch` sur une PR
   `develop → main`. Feature branches éphémères (`feat/*`, `fix/*`, `docs/*`, etc.),
   auto-delete après merge.
7. **Scope npm** — `@focus-mcp/*` (avec tiret). `focusmcp` sans tiret est réservé (squatting
   protection) mais le scope canonique est `@focus-mcp`.
8. **Rulesets GitHub** — chaque nouveau repo reçoit :
   - `main protection` : `required_status_checks`, `pull_request`, `code_scanning` (CodeQL),
     `code_quality`, `required_linear_history`, `deletion`, `non_fast_forward`.
     **Pas `required_signatures`** (les commits assistés ne sont pas signés).
   - `develop protection` : `deletion`, `non_fast_forward`, `required_linear_history`,
     `pull_request` (pas de `code_quality` : impossible sur non-default branch).
   - Pitfall connu : NE JAMAIS mettre `develop` dans les targets de "main protection".

## Dans ce repo (core)

**Stack** : Node ≥ 22, pnpm ≥ 10, TypeScript 5.7+ strict, ESM only, Vitest, Biome 2.x, tsup.

**Layout** :
```
packages/
  core/      ← Registry, EventBus (guards), Router, manifest parser, observability, marketplace resolver
  sdk/       ← defineBrick helper
  validator/ ← test runner conformance briques
  cli/       ← stub DEPRECATED ; le vrai CLI vit dans focus-mcp/cli. À supprimer au prochain cleanup.
```

**À surveiller** :
- Le CLI a été **extrait dans son propre repo** (`focus-mcp/cli`) qui consomme `@focus-mcp/core`.
  `packages/cli` ici est un vieux stub vide — à supprimer lors du prochain cleanup.

## Commandes

```bash
pnpm install              # install (frozen lockfile en CI)
pnpm test                 # Vitest
pnpm test:watch
pnpm test:coverage        # coverage + thresholds
pnpm typecheck            # tsc --noEmit (tous packages)
pnpm lint                 # Biome check
pnpm lint:fix             # Biome auto-fix
pnpm build                # tsup (tous packages)
```

## Workflow pour une feature

1. Lire VISION.md + ce fichier
2. Feature branch depuis `develop` (`feat/*`, `fix/*`, `docs/*`…)
3. Red → Green → Refactor (tests AVANT le code)
4. `pnpm test:coverage && pnpm typecheck && pnpm lint`
5. Conventional Commits
6. PR vers `develop` (jamais `main` direct)
7. Attendre CI verte avant merge

## Sécurité

- **Aucun secret** commité (gitleaks en pre-commit + CI)
- Pas d'`eval` ni de construction dynamique de code
- Le sandbox OS est hérité du parent process. `isolated-vm` disponible en Phase 2 si besoin.

## Documentation à lire en priorité

1. [VISION.md](./VISION.md) — vision, design principles
2. [AGENTS.md](./AGENTS.md) — instructions cross-agents
3. [CONTRIBUTING.md](./CONTRIBUTING.md) — workflow de contribution
