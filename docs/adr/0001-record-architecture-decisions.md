<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# 1. Documenter les décisions architecturales avec des ADR

- **Statut** : Accepté
- **Date** : 2026-04-14

## Contexte

FocusMCP est un projet à long terme avec des décisions architecturales structurantes (3 piliers, EventBus in-process, Tauri sandbox, atomicité des briques…). Sans documentation explicite, ces décisions se perdent et leurs raisons deviennent obscures pour les nouveaux contributeurs.

## Décision

Toutes les décisions architecturales significatives sont documentées dans `docs/adr/` au format [MADR](https://adr.github.io/madr/) (Markdown Architecture Decision Records).

Format minimal :
- Titre
- Statut (Proposé / Accepté / Déprécié / Remplacé par X)
- Date
- Contexte
- Décision
- Conséquences

Numérotation séquentielle (`0001-...`, `0002-...`).

## Conséquences

**Positives** :
- Traçabilité des décisions et de leur motivation
- Onboarding simplifié pour nouveaux contributeurs
- Évite de re-débattre des décisions déjà tranchées

**Négatives** :
- Léger surcoût documentaire à chaque décision structurante
- Discipline requise pour maintenir à jour
