# @focusmcp/core — Product Requirements Document

> Périmètre de ce document : la **bibliothèque TypeScript** `@focusmcp/core` (monorepo `core/`).
> Pour l'app desktop : voir [`client/PRD.md`](../client/PRD.md). Pour le catalogue de briques : voir [`marketplace/PRD.md`](../marketplace/PRD.md).

## Vision (rappel)

**FocusMCP** — Focaliser les agents AI sur l'essentiel.

FocusMCP est un **écosystème intelligent de briques MCP** qui communiquent entre elles, travaillent ensemble, et sont chargées à la demande. Les briques optimisent la compréhension du code, filtrent les données et distillent les résultats pour **minimiser les tokens et le contexte** envoyés à l'agent AI.

Comme **Node.js + npm** : le core est le runtime, les briques sont les packages.

> **Sans FocusMCP** : l'AI lit 50 fichiers bruts → 200k tokens
> **Avec FocusMCP** : les briques indexent, filtrent, distillent → 2k tokens pertinents

---

## Rôle de `@focusmcp/core` dans l'écosystème

`@focusmcp/core` est la **bibliothèque TypeScript** qui implémente toute la logique MCP :

- **Importée par l'app desktop** (`client/`, Tauri) directement dans la WebView — pas de sidecar Node.js
- **Aucun transport HTTP** : Tauri (Rust) est le **seul gardien HTTP** (Streamable HTTP MCP côté client)
- **Browser-compatible** : pas de `node:async_hooks`, pas de Pino, primitives compatibles WebView
- **Sans dépendance OS directe** : tout accès filesystem/réseau passe par des fournisseurs injectés (le client Tauri fournit les implémentations sandboxed)

```
┌────────────────────────────────────┐
│ Tauri (Rust) — gateway HTTP MCP    │
│  • Streamable HTTP /mcp            │
│  • Sandbox système (FS, réseau)    │
└──────────────┬─────────────────────┘
               │ Tauri commands (IPC)
┌──────────────▼─────────────────────┐
│ WebView — UI Svelte                │
│  └─ @focusmcp/core (this lib)      │
│       Registry + EventBus + Router │
│       + briques (modules TS)       │
└────────────────────────────────────┘
```

---

## Packages du monorepo

| Package | Rôle |
|---|---|
| `@focusmcp/core` | Registry, EventBus, Router, Manifest, Bootstrap, Observability |
| `@focusmcp/sdk` | Helper `defineBrick` pour auteurs de briques |
| `@focusmcp/validator` | Test runner conformance (manifeste, namespace, dépendances, garde-fous) |
| `@focusmcp/cli` | CLI `focus` — gestion des briques installées |

---

## Les 3 piliers

### 1. McpRegistry — L'annuaire

Le registre central connaît toutes les briques, leurs manifestes, leurs dépendances et leur état.

```typescript
registry.register(brick)       // enregistre une brique + son manifeste
registry.unregister("php")     // supprime une brique
registry.resolve("symfony")    // résout l'arbre de dépendances complet
registry.getStatus("php")      // état : running, stopped, error
registry.getBricks()           // liste toutes les briques enregistrées
registry.getTools()            // liste tous les tools exposés par toutes les briques
```

Responsabilités :
- Stocker les manifestes (`mcp-brick.json`)
- Résoudre le **graphe de dépendances** (ordre de démarrage, détection de cycles)
- Suivre l'**état** de chaque brique (running, stopped, error, starting)
- Valider la **compatibilité** entre versions de briques

### 2. EventBus — Le système nerveux

Les briques ne s'appellent **jamais directement entre elles**. Toute communication passe par l'EventBus.

**Événements (fire & forget)** :
```typescript
eventBus.emit("files:indexed", { path: "src/", files: [...] })
eventBus.on("files:indexed", (data) => { /* ... */ })
```

**Requêtes (request/response)** :
```typescript
const files = await eventBus.request("indexer:search", { pattern: "*.php" })
```

**Avantages** : découplage total, monitoring gratuit (tout passe par le bus), cache au niveau du bus, extensibilité, résilience.

#### Garde-fous (intégrés au bus)

| Garde-fou | Protection | Comportement |
|---|---|---|
| **Max call depth** | Boucles infinies (A → B → A...) | Bloque au-delà de N niveaux |
| **Timeout** | Brique qui ne répond plus | Coupe l'appel après N secondes |
| **Rate limit** | Brique qui spam le bus | Limite appels/sec par source |
| **Permissions** | Appels non autorisés | Whitelist via `dependencies` du manifeste |
| **Payload size** | Données trop volumineuses | Rejette au-delà d'une taille max |
| **Circuit breaker** | Brique instable | Désactivation temporaire après X échecs |

**Permissions via le manifeste** :
```
PHP déclare dependencies: ["indexer", "cache"]
PHP → request("indexer:search")     ✅ autorisé
PHP → request("symfony:something")  ❌ bloqué
```

### 3. McpRouter — La gateway

Reçoit les appels MCP (`tools/list`, `tools/call`) du transport (Tauri HTTP) et les dispatche.

```typescript
router.handle("symfony_find_controllers", { entity: "User" })
  // 1. Registry : "qui gère ce tool ?" → brique "symfony"
  // 2. EventBus : request("symfony:find_controllers", ...)
  // 3. Retourne le résultat
```

Responsabilités :
- **Agréger les tools** de toutes les briques actives (`tools/list`)
- **Router** chaque appel tool vers la bonne brique via l'EventBus
- Gérer **timeouts** et **erreurs** proprement
- **Aucun transport HTTP propre** : exposé via une API JS consommée par le client Tauri

### Flux complet

```
AI → Tauri HTTP /mcp → IPC → Router → Registry (lookup)
                                  ↓
                              EventBus → Brique cible
                                          ↓
                                      (peut chaîner d'autres briques via le bus)
                                          ↓
                                   ← résultat ←
```

---

## Manifeste de brique

Format `mcp-brick.json` (parsé par `parseManifest`) :

```json
{
  "name": "php",
  "version": "1.0.0",
  "description": "Compréhension avancée du langage PHP",
  "dependencies": ["indexer", "cache"],
  "tools": [
    { "name": "php_analyze", "description": "Analyse un fichier PHP" },
    { "name": "php_find_usages", "description": "Trouve les utilisations d'un symbole" }
  ],
  "config": {
    "phpVersion": { "type": "string", "default": "8.3", "description": "Version PHP cible" }
  }
}
```

Validation stricte : nom (`focus-<domaine>`), version semver, namespace `brique:action` pour les events, dépendances déclarées.

---

## SDK — `@focusmcp/sdk`

Helper `defineBrick` pour les auteurs de briques :

```typescript
import { defineBrick } from '@focusmcp/sdk'

export default defineBrick({
  manifest: { /* mcp-brick.json inline ou import */ },
  setup({ eventBus, logger }) {
    eventBus.on('files:indexed', (data) => { /* ... */ })
    return {
      'php:analyze': async ({ file }) => { /* ... */ },
    }
  },
})
```

---

## Validator — `@focusmcp/validator`

Test runner qui valide qu'une brique respecte le contrat FocusMCP :
- Manifeste valide (schema)
- Tools déclarés conformes au schéma JSON Schema
- Namespace `brique:action` respecté
- Dépendances déclarées correspondent aux appels effectifs
- Garde-fous EventBus respectés (pas de bypass)

Lancé en CI sur chaque brique du marketplace officiel et utilisable par les développeurs tiers.

---

## CLI — `@focusmcp/cli`

Commandes (inspirées npm/yarn) opérant sur `~/.focus/center.json` + `~/.focus/center.lock` :

```bash
focus add <brick>              # installe une brique (+ ses dépendances)
focus remove <brick>           # supprime une brique
focus update [brick]           # met à jour
focus list                     # liste les briques installées
focus search <terme>           # cherche dans le marketplace
focus info <brick>             # détails d'une brique

focus status                   # état de chaque brique (running/stopped/error)
focus logs [brick]             # logs EventBus

focus catalog add <source>     # ajoute un marketplace tiers (P1)
focus catalog list
focus catalog remove <source>

focus config get / set <k> <v>
```

Note : `focus start/stop` lance l'app desktop (Tauri) — implémenté côté `client/`, exposé via la CLI pour confort.

---

## Marketplace client (résolveur + installer)

Module du core qui résout/télécharge/installe les briques publiées dans le marketplace.

### Mapping npm → FocusMCP

```
npm/yarn                        FocusMCP
─────────                       ──────────
package.json                    center.json    (briques installées + config)
package-lock.json               center.lock    (versions exactes verrouillées)
node_modules/                   bricks/        (code des briques téléchargées)
.npmrc                          .centerrc      (config globale, auth, registries)
npm registry                    marketplace officiel
```

### Structure fichiers

```
~/.focus/
├── .centerrc              # config globale (port, auth, catalogues)
├── center.json            # briques installées + config par brique
├── center.lock            # versions résolues + hash intégrité
└── bricks/                # code des briques téléchargées
    ├── indexer/
    └── php/
```

### Format `center.json`

```json
{
  "bricks": {
    "indexer": { "version": "^1.0.0", "enabled": true },
    "php": { "version": "^1.0.0", "enabled": true, "config": { "phpVersion": "8.3" } }
  }
}
```

### Format `center.lock`

```json
{
  "indexer": {
    "version": "1.0.3",
    "resolved": "focus/brick-indexer#v1.0.3",
    "integrity": "sha256-abc123..."
  }
}
```

### Responsabilités du marketplace client

- Résoudre `<name>@<range>` contre un ou plusieurs catalogues (`catalog.json`)
- Télécharger depuis GitHub (`owner/repo#tag`)
- Vérifier intégrité (sha256)
- Écrire `bricks/<name>/` + mettre à jour `center.lock`
- Construire le graphe de dépendances et installer en cascade

### Brick loader

Au démarrage, le loader lit `center.json` + `center.lock`, charge dynamiquement chaque brique depuis `bricks/<name>/`, parse son manifeste, et l'enregistre dans le `Registry`. Démarrage dans l'ordre topologique du graphe de dépendances.

---

## Observability

- `createLogger` / `rootLogger` : logger structuré browser-compatible (remplace Pino)
- `getTracer` / `trace` : trace ID propagé dans les requêtes EventBus (remplace `node:async_hooks`)
- Tout appel bus est observable : source, cible, args, durée, résultat/erreur, garde-fous déclenchés
- Exposé au client (Tauri) pour affichage dans l'UI temps réel

---

## Roadmap

### P0 — MVP

- [x] McpRegistry + résolution dépendances
- [x] EventBus + garde-fous (timeout, max depth, rate limit, permissions, payload size, circuit breaker)
- [x] McpRouter (sans HTTP propre — exposé via API JS au client Tauri)
- [x] Manifest parser strict
- [x] SDK `defineBrick`
- [x] Validator (test runner conformance)
- [x] Bootstrap helper (`createFocusMcp`)
- [x] Observability browser-compatible (logger, tracing)
- [ ] **CLI** : `focus add/remove/list/search/info/status/logs`
- [ ] **Marketplace client** : résolveur + downloader + intégrité
- [ ] **Brick loader** : chargement dynamique depuis `bricks/`
- [ ] **MCP spec conformance** : suite de tests vs serveur de référence [`Everything`](https://github.com/modelcontextprotocol/servers/tree/main/src/everything)

### P1

- [ ] **Hot-reload** : ajout/suppression de briques sans redémarrer
- [ ] **Health checks** programmés par brique
- [ ] **Catalogues tiers** dans le résolveur (URL, local, GitHub org)
- [ ] **Auto-update** des catalogues et briques

### P2

- [ ] **Permissions tools** : contrôle de quels tools sont exposés au client AI
- [ ] **Scopes** : installation globale, par projet, ou locale
- [ ] **Documentation** auteurs de briques (guide complet)

---

## Patterns d'optimisation des tokens (référence)

Les patterns transverses applicables par toutes les briques. Implémentés dans des **briques officielles** publiées sur le marketplace (voir `marketplace/PRD.md`) :

- **Output filtering** — chaque brique retourne le résultat distillé, jamais la donnée brute
- **Think in code** — sandbox JS éphémère (brique `focus-sandbox`)
- **Session memory** — SQLite + FTS5/BM25 (brique `focus-memory`)
- **Indexation + cache** — index FTS5 partagé (brique `focus-indexer`)
- **Reasoning externalisé** — chaînes de pensées persistées (brique `focus-thinking`)

`@focusmcp/core` ne contient aucune brique — il fournit l'infrastructure qui les rend possibles.

---

## Stack technique

| Composant | Technologie | Rôle |
|---|---|---|
| Lib | **TypeScript strict** | Code source |
| Build | **tsup** | Bundling (ESM + types) |
| Tests | **Vitest** | Unit + intégration |
| Lint/Format | **Biome** | Style et qualité |
| Manifeste | **JSON** + Zod | Validation stricte |
| Logger | Browser-compatible (custom) | Pas de Pino (incompatible WebView) |
| Tracing | Browser-compatible (custom) | Pas de `node:async_hooks` |

---

## Décisions clés

| Décision | Choix | Raison |
|---|---|---|
| **Transport HTTP** | Délégué à Tauri | Un seul gardien HTTP, sandbox Rust |
| **Runtime** | WebView (browser-compatible) | Pas de sidecar Node.js, IPC direct |
| **Communication briques** | EventBus in-process | Découplage + monitoring centralisé |
| **Sécurité bus** | Whitelist via `dependencies` du manifeste | Permissions déclaratives, pas de config séparée |
| **Manifeste** | JSON + JSON Schema | Lisible, validable, versionnable |
| **Lock file** | `center.lock` (sha256) | Reproductibilité + intégrité |
| **Briques** | Modules TS chargés dynamiquement | Hot-reload possible, simple |

---

## Inspirations

- **Context Mode** — pattern "think in code", persistance SQLite + FTS5
- **Claude Octopus** — circuit breakers, isolation worktrees (P2)
- **modelcontextprotocol/servers** — référence pour conformance (`Everything`), pattern sequentialthinking
- **npm / yarn** — `.centerrc`, `center.json`, `center.lock`, CLI, graphe de dépendances, intégrité sha256
