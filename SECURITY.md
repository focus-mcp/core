<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# Politique de sécurité

## Versions supportées

Le projet est en pré-MVP (`0.x`). Aucune version n'est encore considérée comme stable.

## Reporter une vulnérabilité

**Ne pas ouvrir d'issue publique** pour une vulnérabilité de sécurité.

Envoyer un rapport privé via :
- GitLab : utiliser l'option [Confidential issues](https://docs.gitlab.com/ee/user/project/issues/confidential_issues.html)
- ou par email : à définir

Inclure si possible :
- Description du problème
- Étapes de reproduction
- Impact estimé
- Suggestions de mitigation

## Engagement

Nous nous engageons à :
- **Accuser réception** sous 72h
- **Évaluer** et **prioriser** la vulnérabilité sous 7 jours
- **Coordonner** la divulgation responsable
- **Créditer** le découvreur (sauf demande contraire)

## Périmètre

Les couches de sécurité de FocusMCP sont décrites dans le [PRD](./PRD.md#sécurité--3-couches) :

1. **EventBus** — garde-fous logiques (timeout, rate limit, permissions inter-briques)
2. **Tauri sandbox** — contrôle système (filesystem, réseau)
3. **UI** — supervision humaine

Les vulnérabilités affectant l'une de ces couches sont prioritaires.

## Pratiques de sécurité du projet

- Secret scanning (gitleaks) en pre-commit + CI
- Dependency scanning (Renovate + `pnpm audit`)
- SAST (CodeQL/Semgrep) en CI
- License compliance (refus GPL/AGPL pour préserver MIT)
- SBOM (CycloneDX) à chaque release
- Commits signés (GPG/SSH) requis
- npm provenance + Sigstore pour les releases
