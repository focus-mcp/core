<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# Roadmap FocusMCP

Voir [PRD.md](../PRD.md) pour les détails fonctionnels complets.

## Phase 0 — Fondations (en cours)

- [x] PRD finalisé
- [x] Setup monorepo + tooling pro (TS strict, Biome, Vitest, husky, GitLab CI…)
- [ ] Bootstrap interfaces TS du core
- [ ] EventBus en TDD (>=95% coverage)
- [ ] McpRegistry en TDD (>=95% coverage)
- [ ] MCP Router (Streamable HTTP) avec conformité spec MCP 2025-03-26
- [ ] `focus-validator` (test runner pour briques)

## Phase 1 — Premières briques officielles

- [ ] `focus-indexer` — indexation FTS5/BM25
- [ ] `focus-memory` — persistance session SQLite
- [ ] `focus-sandbox` — exécution JS éphémère
- [ ] `focus-thinking` — reasoning externalisé

## Phase 2 — UI et expérience

- [ ] App Tauri (shell + sidecar)
- [ ] Dashboard Svelte (briques, logs, métriques)
- [ ] Visualisation graphe de dépendances
- [ ] Hot-reload des briques

## Phase 3 — Écosystème

- [ ] Catalogues tiers
- [ ] SDK + documentation pour devs de briques
- [ ] Briques par framework (focus-php, focus-symfony, focus-doctrine, focus-twig, focus-react…)
- [ ] Hook-based routing (adapters Claude Code, Cursor, Codex, Gemini CLI…)

## Phase 4 — Industrialisation

- [ ] `focus-worktree` (parallélisation git)
- [ ] `focus-reactor` (événements externes : CI, PR, webhooks)
- [ ] Mode serveur multi-tenants
- [ ] Métriques Prometheus
- [ ] i18n complète
