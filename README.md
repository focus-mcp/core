<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# FocusMCP — core

> **Focaliser les agents AI sur l'essentiel.**
>
> 🌐 [focusmcp.dev](https://focusmcp.dev) · 📖 [PRD](./PRD.md) · 🗺️ [Roadmap](./docs/ROADMAP.md)

FocusMCP est un **écosystème intelligent de briques MCP** qui communiquent entre elles, travaillent ensemble, et sont chargées à la demande. Les briques optimisent la compréhension du code, filtrent les données et distillent les résultats pour **minimiser les tokens et le contexte** envoyés à l'agent AI.

> **Sans FocusMCP** : l'AI lit 50 fichiers bruts → 200k tokens consommés
> **Avec FocusMCP** : les briques indexent, analysent, filtrent → l'AI reçoit 2k tokens de résultat pertinent

## Statut

🚧 **En développement actif** — pré-MVP. Voir [docs/ROADMAP.md](./docs/ROADMAP.md).

## Architecture

FocusMCP est une **coquille vide** (Tauri + Node.js sidecar) qui orchestre un écosystème de briques MCP atomiques. Trois piliers :

- **McpRegistry** — annuaire des briques + résolution de dépendances
- **EventBus** — communication inter-briques + garde-fous (timeout, rate-limit, permissions)
- **MCP Router** — endpoint Streamable HTTP pour les clients AI

Voir [PRD.md](./PRD.md) pour les détails complets.

## Structure du monorepo

```
packages/
  core/   — Registry + EventBus + Router + transport HTTP/HTTPS
  sdk/    — outils pour développer une brique
  cli/    — focus CLI (start, add, remove…)
```

**Repos compagnons** (même org [`focus-mcp`](https://github.com/focus-mcp)) :
- [`focus-mcp/client`](https://github.com/focus-mcp/client) — app Tauri (shell desktop + UI dashboard)
- [`focus-mcp/marketplace`](https://github.com/focus-mcp/marketplace) — briques officielles (`focus-indexer`, `focus-memory`…)

## Démarrer

```bash
nvm use                # Node 22+
pnpm install
pnpm test              # tests Vitest
pnpm typecheck
pnpm lint
```

## Contribuer

Voir [CONTRIBUTING.md](./CONTRIBUTING.md).

## Licence

[MIT](./LICENSE)
