<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# Contribuer à FocusMCP

Merci de l'intérêt porté à FocusMCP. Ce document décrit comment contribuer.

## Code of Conduct

Tous les contributeurs s'engagent à respecter le [Code of Conduct](./CODE_OF_CONDUCT.md).

## Workflow

1. **Fork** le repo et crée une branche : `git checkout -b feat/ma-feature`
2. **Code en TDD** : écris les tests AVANT le code (Red → Green → Refactor)
3. **Lint + format** : `pnpm lint:fix`
4. **Typecheck** : `pnpm typecheck`
5. **Test** : `pnpm test` (coverage ≥80% global, ≥95% sur EventBus/Registry)
6. **Commit** en [Conventional Commits](https://www.conventionalcommits.org/) — enforced par commitlint
7. **Changeset** : `pnpm changeset` si la PR introduit un changement utilisateur
8. **Push** et ouvre une Pull Request sur [GitHub](https://github.com/focus-mcp/core/pulls)

## Standards

- **TypeScript strict** (configuré dans `tsconfig.base.json`)
- **TDD strict** — coverage thresholds bloquants en CI
- **Conventional Commits** : `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `build`, `ci`, `style`, `revert`
- **SPDX headers** dans tous les fichiers source (`SPDX-License-Identifier: MIT`)
- **REUSE compliance** vérifiée en CI
- **Pas de console.log** : utiliser le logger pino exposé par `@focus-mcp/core`
- **Pas de `any`** : TypeScript strict + Biome `noExplicitAny`

## Développer une brique

Voir [packages/sdk/README.md](./packages/sdk/README.md) (à venir).

## Architecture Decision Records (ADR)

Toute décision architecturale significative doit être documentée dans [`docs/adr/`](./docs/adr/).
Format : [MADR](https://adr.github.io/madr/).

## Reporter un bug / proposer une feature

Ouvre une issue avec le template approprié : [bug](https://github.com/focus-mcp/core/issues/new?template=bug.yml) ou [feature](https://github.com/focus-mcp/core/issues/new?template=feature.yml).

## Sécurité

Les vulnérabilités doivent être reportées **en privé** — voir [SECURITY.md](./SECURITY.md).
