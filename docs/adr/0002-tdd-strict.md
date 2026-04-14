<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# 2. Développement en TDD strict

- **Statut** : Accepté
- **Date** : 2026-04-14

## Contexte

FocusMCP est une fondation sur laquelle des briques tierces s'appuieront. La rétro-compatibilité, la robustesse et la testabilité sont critiques. Le code de l'EventBus et du Registry doit être irréprochable car toute régression impacte tout l'écosystème.

## Décision

Tout le code de FocusMCP est développé en **TDD strict** (cycle Red → Green → Refactor) :

1. Écrire un test qui échoue (Red)
2. Écrire le minimum de code pour passer le test (Green)
3. Refactorer (Refactor)

**Coverage thresholds bloquants en CI** :
- Global : ≥ 80%
- `packages/core/src/event-bus/**` : ≥ 95%
- `packages/core/src/registry/**` : ≥ 95%

**Mutation testing** (Stryker) en nightly pour valider la qualité des tests.

**Property-based testing** (fast-check) pour les composants critiques (EventBus : résolution de cycles, garde-fous, etc.).

## Conséquences

**Positives** :
- Design émergent guidé par les tests
- Documentation vivante via les specs
- Robustesse et confiance pour refactorer
- Détection précoce des régressions

**Négatives** :
- Vélocité initiale plus lente
- Discipline requise (refusée tout shortcut "on testera plus tard")
