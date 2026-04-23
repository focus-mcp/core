<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# CLAUDE.md — @focus-mcp/core

> Auto-loaded by Claude Code (and any agents.md-compatible tool) when working in this repo.
> This file is the **source of truth for AI agent behaviour** on this project. It replaces the
> former `~/.claude/projects/**/memory/` system — do not recreate that folder.

## Projet

**FocusMCP** — orchestrateur MCP. Reduces AI-agent context from 200k to ~2k tokens by composing
**briques** (atomic MCP modules) that communicate via an EventBus with central guards. Site
[focusmcp.dev](https://focusmcp.dev). Full vision : [PRD.md](./PRD.md).

Ce repo héberge la **bibliothèque `@focus-mcp/core`** (Registry + EventBus + Router + SDK +
Validator + marketplace resolver) importée par le CLI.

## Écosystème (3 repos actifs + 1 archivé)

| Repo | Statut | Rôle |
|---|---|---|
| `focus-mcp/core` (ici) | actif | Monorepo lib TS — 3 piliers + SDK/Validator/Marketplace resolver |
| `focus-mcp/cli` | actif | `@focus-mcp/cli` — stdio MCP via `@modelcontextprotocol/sdk`, entrée primaire, publié npm |
| `focus-mcp/marketplace` | actif | Catalogue officiel + `bricks/*` + `modules/*` (dont `manager` = dashboard). `catalog.json` publié sur gh-pages (domaine custom `marketplace.focusmcp.dev` à configurer). |
| `focus-mcp/client` | **archivé** | Ex desktop Tauri. Pivot CLI-first (2026-04-16) a gelé ce repo en Phase 2. |

## Architecture (post-pivot CLI-first, 2026-04-16)

```
AI client (Claude Code, Cursor, Codex, Gemini…)
       │ stdio (JSON-RPC MCP)
       ▼
@focus-mcp/cli (Node, npm)
  ├─ @modelcontextprotocol/sdk StdioServerTransport
  ├─ import { createFocusMcp } from '@focus-mcp/core'  ← CE REPO
  └─ (opt-in P1) admin API HTTP côté latéral
```

**Le core** est importé par la CLI (pas l'inverse). **Browser-compatible** : pas de
`node:async_hooks`, pas de Pino, primitives custom côté logger/tracing. Pas de `HttpTransport`
côté core — Tauri pouvait l'héberger via WebView (ancien design, gelé) ; aujourd'hui la CLI
héberge tout, mais l'architecture reste browser-compatible pour un futur Phase 2 desktop.

**Le cli-manager (dashboard)** ne dépend PAS du core — il consomme l'admin API HTTP de la CLI.

## Règles non-négociables (applicables à TOUS les repos FocusMCP)

1. **TDD strict** — tests AVANT le code (Red → Green → Refactor). Coverage ≥ **80 %** global,
   ≥ **95 %** sur `event-bus/**` et `registry/**` (modules critiques).
2. **Périmètre strict** — pas de features ou décisions non explicitement demandées. Le user a
   corrigé plusieurs fois le scope ; demander avant d'ajouter de l'inconnu.
3. **Standards pro** — TS strict (pas de `any`), Biome (pas ESLint+Prettier), Conventional
   Commits (enforced via commitlint), husky + lint-staged, semver, SPDX headers (REUSE),
   ADRs pour les décisions archi.
4. **Imports** : toujours `node:` protocol (`import … from 'node:fs/promises'`).
5. **Public-facing content en anglais** — règle "à partir de maintenant" : tout **nouveau**
   contenu public, et toute **mise à jour substantielle** d'un contenu public existant, est
   rédigé en anglais. Périmètre :
   - `.github/` (workflows YAML, PR template, issue templates, renovate)
   - Titres + descriptions de PR, commentaires de PR, messages de commit
   - Titres + descriptions d'issues
   - Marketplace : `mcp-brick.json` description/tools, `bricks/<name>/README.md`, entries Changesets
   - Docs contributor-facing cibles : `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`,
     `CODE_OF_CONDUCT.md`
   - Exception transitoire : les versions **existantes** de ces docs peuvent rester majoritairement
     en français jusqu'à leur prochaine réécriture substantielle.
   - Exceptions permanentes : `PRD.md` (doc stratégique interne) et `CLAUDE.md` (ce fichier, guide
     d'agent interne) restent en français.
6. **Git-flow strict** — `develop` est **permanente**, jamais `--delete-branch` sur une PR
   `develop → main`. Feature branches éphémères (`feat/*`, `fix/*`, `docs/*`, etc.),
   auto-delete après merge.
7. **npm orgs** — `focusmcp` ET `focus-mcp` sont réservées (squatting protection). Pas de
   publish au MVP sauf `@focus-mcp/cli` (primary distribution). Scope canonique :
   `@focus-mcp/*`.
8. **Rulesets GitHub** — chaque nouveau repo reçoit le couple :
   - `main protection` cible **UNIQUEMENT `refs/heads/main`** — `required_status_checks`,
     `pull_request`, `code_scanning` (CodeQL), `code_quality`, `required_linear_history`,
     `deletion`, `non_fast_forward`. **Pas `required_signatures`** (les commits assistés ne
     sont pas signés).
   - `develop protection` cible **UNIQUEMENT `refs/heads/develop`** — `deletion`,
     `non_fast_forward`, `required_linear_history`, `pull_request` (pas de `code_quality` :
     impossible sur non-default branch = pending éternel).
   - Pitfall connu : NE JAMAIS mettre `develop` dans les targets de "main protection".

## Dans ce repo (core)

**Stack** : Node ≥ 22, pnpm ≥ 10, TypeScript 5.7+ strict, ESM only, Vitest, Biome 2.x,
tsup, Changesets.

**Layout** :
```
packages/
  core/      ← Registry, EventBus (guards), Router, manifest parser, observability, marketplace resolver
  sdk/       ← defineBrick helper
  validator/ ← test runner conformance briques
  cli/       ← DEPRECATED stub ; le vrai CLI vit dans focus-mcp/cli. Peut être supprimé.
```

**À surveiller** :
- Le CLI a été **extrait dans son propre repo** (`focus-mcp/cli`) qui consomme `@focus-mcp/core`
  via `file:../core/packages/core` (sibling clone en CI). `packages/cli` ici est un vieux stub
  vide — à supprimer quand on fait le cleanup.
- `@focus-mcp/core` n'est **pas publié sur npm** ; la CLI le bundle au build (`tsup --noExternal`).

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
pnpm changeset            # créer un changeset avant de merger
```

## Workflow pour une feature

1. Lire PRD.md + ce fichier
2. Feature branch depuis `develop` (`feat/*`, `fix/*`, `docs/*`…)
3. Red → Green → Refactor (tests AVANT le code)
4. `pnpm test:coverage && pnpm typecheck && pnpm lint`
5. `pnpm changeset` si ça change l'API publique
6. Conventional Commits
7. PR vers `develop` (jamais `main` direct)
8. Attendre CI verte + résoudre les threads Copilot avant merge

## Sécurité

- **Aucun secret** commité (gitleaks en pre-commit + CI)
- Pas de `eval` ni `new Function()`
- Le sandbox OS est **hérité du parent process** (Claude Code spawn via Seatbelt/bubblewrap).
  `isolated-vm` disponible en Phase 2 si besoin de faire tourner des briques non-reviewed.

## Documentation à lire en priorité

1. [PRD.md](./PRD.md) — vision, architecture, roadmap
2. [AGENTS.md](./AGENTS.md) — instructions cross-agents (note : peut contenir des résidus
   pré-pivot ; CE fichier est la source de vérité)
3. [CONTRIBUTING.md](./CONTRIBUTING.md) — workflow de contribution
