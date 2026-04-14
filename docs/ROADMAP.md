<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# Roadmap FocusMCP — `core`

Voir [PRD.md](../PRD.md) pour les détails fonctionnels complets.

> Ce repo contient le **runtime** (Registry + EventBus + Router + transport HTTP/HTTPS + SDK + CLI).
> L'app desktop est dans [`focus-mcp/client`](https://github.com/focus-mcp/client).
> Les briques officielles sont dans [`focus-mcp/marketplace`](https://github.com/focus-mcp/marketplace).

## Phase 0 — Fondations (en cours)

- [x] PRD finalisé
- [x] Setup monorepo + tooling pro (TS strict, Biome, Vitest, husky, GitLab CI…)
- [x] Interfaces TS du core (Brick, Manifest, Tool, EventBus, Registry, Router)
- [x] `InProcessEventBus` (TDD, coverage ≥95/90%)
- [x] `InMemoryRegistry` (TDD, coverage 100/97%)
- [x] `McpRouter` (TDD, coverage 100%)
- [x] Transport HTTP + HTTPS (spec MCP 2025-03-26 via SDK officiel)
- [ ] `focus-validator` — test runner pour briques tierces
- [ ] SDK brique (`@focusmcp/sdk`) — helpers pour écrire une brique

## Phase 1 — CLI et ergonomie

- [ ] CLI : `focus start`, `focus stop`, `focus status`, `focus logs`
- [ ] CLI : `focus add/remove/update` (installation briques depuis marketplace)
- [ ] Fichiers : `.centerrc`, `center.json`, `center.lock`
- [ ] Chargement dynamique de briques au runtime (hot-reload)

## Phase 2 — Maturité core

- [ ] Garde-fous EventBus complets : rate limit, circuit breaker
- [ ] Permissions inter-briques (whitelist via manifeste `dependencies`)
- [ ] Monitoring : métriques agrégées par brique, traces OpenTelemetry
- [ ] Authentification optionnelle pour mode serveur
- [ ] Mode stdio (transport alternatif au HTTP)

## Phase 3 — Écosystème

- [ ] Hook-based routing : adaptateurs clients (Claude Code, Cursor, Codex...)
- [ ] Catalogues tiers (URL, GitHub, local)
- [ ] Auto-update briques + catalogues
- [ ] Changesets + release automatisée
