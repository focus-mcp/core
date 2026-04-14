<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# Gouvernance FocusMCP

## Statut

Projet en pré-MVP. Gouvernance simple et évolutive.

## Rôles

### Mainteneurs

- Approuvent les MR
- Tranchent les ADRs (Architecture Decision Records)
- Releasent les versions
- Définissent la roadmap

### Contributeurs

Toute personne soumettant une MR conforme aux standards (voir [CONTRIBUTING.md](../CONTRIBUTING.md)).

## Décisions

- **Petites décisions** (bugfix, refactor) : 1 approval mainteneur, merge
- **Décisions architecturales** : ADR obligatoire dans `docs/adr/`, discussion publique, 2 approvals
- **Breaking changes** : ADR + bump majeur + changelog détaillé + migration guide

## Marketplace officiel

Les briques officielles `focus-*` sont hébergées dans un repo séparé (`focus-marketplace`). Elles suivent les mêmes standards que le core et passent par `focus-validator`.

Le marketplace officiel **refuse les briques fourre-tout** (principe d'atomicité — voir [PRD](../PRD.md)).

## Communication

- **Discussions techniques** : MR + Issues GitLab
- **Annonces** : CHANGELOG.md + tags sémantiques

## Évolution

Ce document évoluera au fur et à mesure que le projet grandit (passage d'un mainteneur unique à une équipe, comité technique, etc.).
