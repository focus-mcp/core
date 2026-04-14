# FocusMCP — Product Requirements Document

## Vision

**FocusMCP** — Focaliser les agents AI sur l'essentiel.

FocusMCP est un **écosystème intelligent de briques MCP** qui communiquent entre elles, travaillent ensemble, et sont chargées à la demande. Les briques optimisent la compréhension du code, filtrent les données et distillent les résultats pour **minimiser les tokens et le contexte** envoyés à l'agent AI.

FocusMCP est une **coquille vide** — un orchestrateur sans aucune brique incluse. Il fournit l'infrastructure (Registry, EventBus, Router, UI) et un **marketplace officiel par défaut** pour découvrir et installer des briques. Toute la valeur est dans l'écosystème de briques, pas dans FocusMCP lui-même.

Comme **Node.js + npm**, **VS Code + marketplace**, ou **Docker + Docker Hub** : FocusMCP est le runtime, les briques sont les packages.

> **Sans FocusMCP** : l'AI lit 50 fichiers bruts → 200k tokens consommés
> **Avec FocusMCP** : les briques indexent, analysent, filtrent → l'AI reçoit 2k tokens de résultat pertinent

---

## Problème

Aujourd'hui, les serveurs MCP sont :
- **Isolés** : chaque serveur fonctionne seul, sans connaissance des autres
- **Redondants** : chaque serveur réimplémente les mêmes bases (lecture de fichiers, cache, parsing...)
- **Lourds à configurer** : chaque client AI doit référencer chaque serveur manuellement
- **Non composables** : impossible de chaîner les capacités de plusieurs serveurs

## Solution

Une **application desktop** (comme WAMP/MAMP) qui orchestre un écosystème de MCP modulaires (**briques**) :
- **App desktop** (Tauri) : tray icon, auto-start, tourne en fond, UI native
- Chaque brique a **une responsabilité unique**
- Les briques **déclarent leurs dépendances** et peuvent utiliser d'autres briques
- FocusMCP **résout les dépendances**, route les appels et expose un endpoint unifié
- Tauri **sandbox le JavaScript** des briques MCP (couche de sécurité système)
- Un **marketplace officiel** par défaut pour découvrir et installer des briques

---

## Architecture

### Principes

| Principe | Description |
|---|---|
| **Atomique** | Une brique = **un seul domaine spécialisé**, comme un plugin VS Code (1 plugin Prettier, 1 plugin ESLint, 1 plugin Twig...). Le nom déclare le domaine (`focus-doctrine`, `focus-twig`, `focus-sf-router`). Pas de brique fourre-tout. |
| **Micro-service** | Chaque MCP = une brique indépendante, découplée, remplaçable |
| **Composabilité** | Les briques s'empilent : une brique peut utiliser d'autres briques |
| **Point d'entrée unique** | Le client AI ne connecte qu'un seul endpoint HTTP |
| **Déclaratif** | Chaque brique déclare ses tools, ses dépendances et sa config via un manifeste |
| **Hot-swap** | Ajouter/retirer une brique sans redémarrer le système |
| **Event-driven** | Les briques communiquent via un EventBus (pub/sub), jamais directement |

### Application Desktop (Tauri)

Le FocusMCP est une **application desktop** construite avec Tauri, inspirée de WAMP/MAMP. L'utilisateur double-clique pour lancer, l'app tourne en fond avec un tray icon dans la barre des tâches.

```
┌──────────────────────────────────────────────────────────┐
│  MCP CENTER — App Desktop (Tauri)                        │
│                                                          │
│  Tauri (Rust) — Coquille desktop + Sandbox               │
│  • Tray icon (barre des tâches)                          │
│  • Auto-start au démarrage du système                    │
│  • Sandbox : contrôle l'accès filesystem/réseau du JS    │
│  • Fenêtre native avec WebView                           │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  WebView — UI                                      │  │
│  │  Dashboard, Marketplace, Logs, Config, Graphe      │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │ Tauri Commands (IPC)            │
│  ┌──────────────────────▼─────────────────────────────┐  │
│  │  Node.js (sidecar) — Le MCP Server                 │  │
│  │                                                    │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │  │
│  │  │ Registry │  │ EventBus │  │    MCP Router    │ │  │
│  │  │          │  │ + gardes │  │  (HTTP endpoint) │ │  │
│  │  └──────────┘  └──────────┘  └──────────────────┘ │  │
│  │                                                    │  │
│  │  🧱 Indexer  🧱 Cache  🧱 PHP  🧱 Symfony         │  │
│  │  (module)   (module)  (module) (module)            │  │
│  └────────────────────────────────────────────────────┘  │
│                         │                                │
│  Tauri Sandbox ─────────┤ contrôle les accès             │
│                         ▼                                │
│              Host (filesystem, réseau, OS)                │
└──────────────────────────────────────────────────────────┘
```

**Tauri (Rust)** gère : tray icon, auto-start, fenêtre, sandbox, lancement du sidecar Node.js
**Node.js (sidecar)** gère : tout le MCP (core, briques, HTTP endpoint)
**WebView** affiche : l'UI (même code qu'une web app classique)

### Les 3 piliers du MCP Core

Le core MCP tourne dans le sidecar Node.js. Les briques sont des **modules TypeScript** chargés dans le même process.

#### 1. McpRegistry — L'annuaire

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
- Stocker les manifestes (`mcp-brick.json`) de chaque brique
- Résoudre le **graphe de dépendances** (ordre de démarrage, détection de cycles)
- Suivre l'**état** de chaque brique (running, stopped, error, starting)
- Valider la **compatibilité** entre versions de briques

#### 2. EventBus — Le système nerveux

Les briques ne s'appellent **jamais directement entre elles**. Toute communication passe par l'EventBus.

Deux modes de communication :

**Événements (fire & forget)** — notification sans attente de réponse :
```typescript
// MCP Indexer publie quand l'indexation est terminée
eventBus.emit("files:indexed", { path: "src/", files: [...] })

// MCP PHP écoute et réagit
eventBus.on("files:indexed", (data) => { /* met à jour son cache PHP */ })
```

**Requêtes (request/response)** — appel synchrone avec réponse attendue :
```typescript
// MCP PHP demande à Indexer de chercher des fichiers
const files = await eventBus.request("indexer:search", { pattern: "*.php" })

// MCP Symfony demande à PHP d'analyser un fichier
const ast = await eventBus.request("php:analyze", { file: "src/Controller/UserController.php" })
```

Avantages de l'EventBus :
- **Découplage total** : les briques ne se connaissent pas, elles connaissent des événements
- **Monitoring gratuit** : FocusMCP intercepte et logue tous les événements
- **Cache au niveau du bus** : même requête = résultat en cache, sans toucher la brique
- **Extensibilité** : ajouter une brique qui réagit à un événement existant sans modifier les autres
- **Résilience** : si une brique est down, l'EventBus peut retourner une erreur propre

#### Garde-fous (EventBus)

L'EventBus intègre des protections centralisées. Les briques n'ont rien à implémenter — les garde-fous sont appliqués automatiquement par le bus :

| Garde-fou | Protection | Comportement |
|---|---|---|
| **Max call depth** | Boucles infinies (A → B → A → B...) | Bloque l'appel au-delà de N niveaux de profondeur |
| **Timeout** | Brique qui ne répond plus | Coupe l'appel après N secondes, retourne une erreur |
| **Rate limit** | Brique qui spam le bus | Limite le nombre d'appels/seconde par brique |
| **Permissions (manifeste)** | Appels non autorisés | Une brique ne peut appeler que ses **dépendances déclarées** dans `mcp-brick.json` |
| **Payload size** | Données trop volumineuses | Rejette les payloads au-delà d'une taille max |
| **Circuit breaker** | Brique instable | Si une brique échoue X fois consécutives → désactivée temporairement |

**Permissions via le manifeste** — le `dependencies` du manifeste sert de whitelist :
```
PHP déclare dependencies: ["indexer", "cache"]

PHP → request("indexer:search")     ✅ autorisé (dans ses dépendances)
PHP → request("symfony:something")  ❌ bloqué (pas dans ses dépendances)
```

**Monitoring** — tout ce qui passe par le bus est observable :
- Chaque appel est loggé (source, cible, arguments, durée, résultat/erreur)
- Traçabilité complète d'une requête de bout en bout (trace ID)
- Métriques agrégées par brique (nombre d'appels, temps moyen, taux d'erreur)
- Appels bloqués par les garde-fous visibles dans l'UI
- Tout est affichable en **temps réel** dans le dashboard

#### 3. MCP Router — La gateway

Le point d'entrée pour les clients AI. Reçoit les appels MCP (tools/list, tools/call) et les dispatch.

```typescript
// Client AI appelle un tool
router.handle("symfony_find_controllers", { entity: "User" })
  // 1. Consulte le Registry : "qui gère symfony_find_controllers ?"
  //    → Brique "symfony"
  // 2. Dispatch via l'EventBus : request("symfony:find_controllers", { entity: "User" })
  // 3. Retourne le résultat au client AI
```

Responsabilités :
- Exposer l'**endpoint Streamable HTTP** conforme à la spec MCP
- **Agréger les tools** de toutes les briques actives (tools/list)
- **Router** chaque appel tool vers la bonne brique via l'EventBus
- Gérer les **timeouts** et **erreurs** proprement

### Communication inter-briques — Flux complet

```
AI appelle "symfony_find_controllers({ entity: 'User' })"
  │
  ▼
Router → Registry : "qui gère symfony_find_controllers ?"
  │        → Brique "symfony"
  ▼
Router → EventBus : request("symfony:find_controllers", { entity: "User" })
  │
  ▼
Symfony → EventBus : request("php:analyze", { path: "src/Controller/" })
  │
  ▼
PHP → EventBus : request("indexer:search", { pattern: "*.php", path: "src/Controller/" })
  │
  ▼
Indexer → Cache hit ? → retourne les fichiers indexés
  │
  ▼
PHP ← parse les fichiers, extrait les classes et leurs dépendances
  │
  ▼
Symfony ← filtre les AbstractController qui utilisent l'entité User
  │
  ▼
Router ← résultat final → Client AI
```

Les briques ne se connectent **jamais directement entre elles**. FocusMCP (via l'EventBus) est toujours l'intermédiaire. Cela permet :
- Le **monitoring centralisé** de tous les appels
- Le **remplacement** d'une brique sans impacter les autres
- Le **cache intelligent** des résultats intermédiaires
- La **traçabilité** complète de chaque requête (du client AI jusqu'à la brique finale)

---

## Patterns d'optimisation des tokens

Quatre patterns transverses, applicables par toutes les briques, qui matérialisent la promesse "200k → 2k tokens".

### 1. Output filtering (distillation)

Chaque brique retourne **uniquement le résultat pertinent**, jamais la donnée brute intermédiaire.

```
❌ Mauvais : retourner le contenu de 50 fichiers PHP (200k tokens)
✅ Bon     : retourner la liste des 3 controllers qui matchent (200 tokens)
```

### 2. Think in code (sandbox d'exécution)

Au lieu de demander à l'agent de lire 50 fichiers pour compter des fonctions, l'agent **écrit un script** dans une sandbox JS qui ne `console.log()` que le résultat final.

```
❌ AI : "lis tous les fichiers, compte les fonctions" → 200k tokens
✅ AI : sandbox.run("globby + count") → 1 ligne : "324 fonctions"
```

Implémenté par la brique **focus-sandbox** (V8 isolé, accès filesystem via Tauri).

### 3. Session memory (persistance entre compactions)

Toutes les actions (édits de fichiers, opérations git, tâches, erreurs) sont **trackées dans SQLite + FTS5**. Quand la conversation est compactée, l'agent retrouve le contexte via une recherche BM25 ciblée plutôt qu'en re-lisant tout.

```
Compaction → AI a perdu le contexte
  → memory.search("ce que j'ai modifié dans UserController")
  → 5 entrées pertinentes (200 tokens) au lieu de re-scanner le repo
```

Implémenté par la brique **focus-memory** (SQLite + FTS5/BM25).

### 4. Indexation + cache intelligent

Les briques lourdes (indexation, parsing AST, embeddings) **mémorisent leurs résultats**. Les briques en aval (PHP, Symfony, SQL) consomment l'index sans jamais re-toucher le disque.

Implémenté par la brique **focus-indexer** (FTS5 partagé avec memory).

### 5. Reasoning externalisé (sequential thinking)

L'agent **externalise sa chaîne de raisonnement** dans une brique dédiée : pensées numérotées, révisions, branches alternatives. Au lieu de re-jouer toute la chaîne dans le contexte, l'agent récupère sélectivement les pensées pertinentes.

```
❌ AI re-écrit toute sa réflexion à chaque étape (contexte qui gonfle)
✅ AI : thinking.add({ thought, branch, revisesThought }) → ne garde que la conclusion
   AI : thinking.recall("decision sur X") → 3 thoughts pertinents
```

Implémenté par la brique **focus-thinking** (chaînes de raisonnement persistées via `focus-memory`).

**Combo puissant** : `focus-thinking` + `focus-memory` = chaînes de raisonnement persistées entre sessions, retrouvables via FTS5/BM25.

---

## Manifeste de brique

Chaque brique se déclare via un fichier `mcp-brick.json` :

```json
{
  "name": "php",
  "version": "1.0.0",
  "description": "Compréhension avancée du langage PHP",
  "dependencies": ["indexer", "cache"],
  "tools": [
    {
      "name": "php_analyze",
      "description": "Analyse un fichier PHP et retourne sa structure"
    },
    {
      "name": "php_find_usages",
      "description": "Trouve toutes les utilisations d'un symbole PHP"
    }
  ],
  "config": {
    "phpVersion": {
      "type": "string",
      "default": "8.3",
      "description": "Version PHP cible"
    }
  }
}
```

---

## Exemple concret : Stack Symfony

### Briques impliquées

```
MCP Symfony
  ├── MCP PHP
  │     ├── MCP Indexer
  │     └── MCP Cache
  └── MCP SQL
        └── MCP Cache
```

### Scénario : l'AI demande "Trouve tous les controllers Symfony qui utilisent l'entité User"

1. **MCP Symfony** reçoit l'appel via FocusMCP
2. **MCP Symfony** demande à **MCP PHP** d'analyser les fichiers dans `src/Controller/`
3. **MCP PHP** demande à **MCP Indexer** la liste des fichiers PHP dans ce dossier
4. **MCP Indexer** utilise **MCP Cache** pour retourner le résultat indexé (pas de re-scan disque)
5. **MCP PHP** parse chaque fichier, comprend les `use` statements, les type hints
6. **MCP Symfony** filtre ceux qui étendent `AbstractController` et référencent `User`
7. Le résultat remonte au Center → au client AI

**Bénéfice token** : seul le résultat final (liste des controllers) est envoyé à l'AI, pas le contenu de tous les fichiers.

---

## Fonctionnalités

### P0 — MVP

FocusMCP est une coquille vide livré avec un marketplace officiel. L'utilisateur installe les briques dont il a besoin.

**Core**
- [ ] **Center core** : McpRegistry + EventBus + MCP Router
- [ ] **EventBus** : pub/sub + request/response + garde-fous (timeout, max depth, permissions)
- [ ] **Endpoint HTTP** : Streamable HTTP pour les clients AI
- [ ] **Manifeste** : format `mcp-brick.json` pour déclarer une brique
- [ ] **Marketplace officiel** : catalogue par défaut intégré au Center
  - [ ] Découverte de briques (browse/search)
  - [ ] Installation / désinstallation de briques
  - [ ] Source : GitHub (`owner/repo`)
- [ ] **UI Web** : dashboard
  - [ ] Liste des briques installées + statut
  - [ ] Onglet Discover (marketplace)
  - [ ] Démarrage / arrêt des briques
- [ ] **CLI** : `focus start`, `focus add <brick>`, `focus remove <brick>`

**Briques officielles MVP** (livrées via le marketplace officiel)
- [ ] **focus-indexer** : indexation filesystem + recherche FTS5/BM25 (base partagée pour les autres briques)
- [ ] **focus-memory** : persistance de session SQLite + FTS5 (édits, git ops, tâches, erreurs) — survit aux compactions
- [ ] **focus-sandbox** : exécution JS éphémère ("think in code") — l'agent écrit un script, ne récupère que le résultat
- [ ] **focus-thinking** : raisonnement externalisé (thoughts, révisions, branches) avec persistance via `focus-memory`

**Qualité & conformité**
- [ ] **Conformité spec MCP (externe)** : suite de tests qui vérifie que l'endpoint Streamable HTTP du Router respecte la spec MCP officielle. Oracle = serveur de référence [`Everything`](https://github.com/modelcontextprotocol/servers/tree/main/src/everything) → garantit la compatibilité avec tous les clients AI (Claude, Cursor, Codex…)
- [ ] **focus-validator (interne)** : test runner qui valide qu'une brique respecte le contrat FocusMCP — manifeste valide, tools déclarés conformes au schéma, namespace `brique:action` respecté, dépendances déclarées, garde-fous EventBus respectés. Lancé en CI sur chaque brique du marketplace officiel et utilisable par les développeurs tiers

### P1 — Enrichissement

- [ ] **UI** : visualisation du graphe de dépendances entre briques
- [ ] **UI** : logs en temps réel des appels inter-briques (monitoring EventBus)
- [ ] **UI** : configuration de chaque brique
- [ ] **UI** : métriques par brique (appels, durée, erreurs, garde-fous déclenchés)
- [ ] **Hot-reload** : ajout/suppression de briques sans redémarrage
- [ ] **Health checks** : monitoring de l'état de chaque brique
- [ ] **Catalogues tiers** : ajouter des marketplaces externes (GitHub, GitLab, URL, local)
- [ ] **Auto-update** : mise à jour automatique des catalogues et briques
- [ ] **Hook-based routing** : adaptateurs client (Claude Code, Cursor, Codex, Gemini CLI…) qui interceptent et redirigent les tool calls vers FocusMCP

### P2 — Écosystème

- [ ] **SDK** : template + outils pour créer une nouvelle brique facilement
- [ ] **Permissions** : contrôle de quels tools sont exposés au client AI
- [ ] **Scopes** : installation globale, par projet, ou locale
- [ ] **focus-worktree** : isolation git worktree pour exécutions parallèles (inspiré claude-octopus)
- [ ] **focus-reactor** : écoute événements externes (CI, PR, webhooks) et déclenche des briques (inspiré claude-octopus)
- [ ] **Documentation** : guide pour les développeurs de briques

---

## Marketplace & Gestion des briques (inspiré npm/yarn)

### Philosophie

FocusMCP ne contient **aucune brique**. Il est livré avec un **marketplace officiel** par défaut qui permet de découvrir et installer des briques. L'utilisateur est responsable de ce qu'il installe (comme npm).

> **Granularité maximale, à la VS Code** — l'écosystème FocusMCP suit le principe d'atomicité : préférer 10 briques spécialisées (focus-doctrine, focus-twig, focus-sf-router…) à 1 brique monolithique (focus-symfony). Comme les plugins VS Code : un plugin par capability, l'utilisateur compose son setup. Le nom de chaque brique déclare sans ambiguïté son domaine. Le marketplace officiel **refuse les briques fourre-tout** (« reject the kitchen sink »).

**Convention de nommage** : `focus-<domaine>` ou `focus-<parent>-<sous-domaine>` (ex: `focus-php`, `focus-doctrine`, `focus-sf-router`, `focus-react-query`).

### Mapping npm/yarn → FocusMCP

```
npm/yarn                        FocusMCP
─────────                       ──────────
package.json                    center.json    (briques installées + config)
package-lock.json / yarn.lock   center.lock    (versions exactes verrouillées)
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
    │   ├── mcp-brick.json
    │   └── index.ts
    └── php/
        ├── mcp-brick.json
        └── index.ts
```

### `.centerrc` — Config globale (comme `.npmrc`)

```json
{
  "port": 3000,
  "auth": { "enabled": false, "token": null },
  "catalogs": [
    { "name": "official", "source": "focus/marketplace" }
  ]
}
```

### `center.json` — Briques installées (comme `package.json`)

```json
{
  "bricks": {
    "indexer": { "version": "^1.0.0", "enabled": true },
    "php": { "version": "^1.0.0", "enabled": true, "config": { "phpVersion": "8.3" } }
  }
}
```

### `center.lock` — Versions verrouillées (comme `yarn.lock`)

```json
{
  "indexer": {
    "version": "1.0.3",
    "resolved": "focus/brick-indexer#v1.0.3",
    "integrity": "sha256-abc123..."
  },
  "php": {
    "version": "1.2.0",
    "resolved": "focus/brick-php#v1.2.0",
    "integrity": "sha256-def456...",
    "dependencies": { "indexer": "^1.0.0" }
  }
}
```

### Architecture du marketplace

```
┌──────────────────────────────────────────┐
│            MCP CENTER                     │
│                                           │
│  ┌─────────────────────────────────────┐ │
│  │          Marketplace Manager        │ │
│  │                                     │ │
│  │  ┌───────────┐  ┌───────────────┐  │ │
│  │  │ Officiel  │  │ Tiers (P1)    │  │ │
│  │  │ (défaut)  │  │ owner/repo    │  │ │
│  │  │           │  │ URL           │  │ │
│  │  │           │  │ local         │  │ │
│  │  └───────────┘  └───────────────┘  │ │
│  └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

### Format du catalogue

Chaque marketplace expose un fichier `catalog.json` :

```json
{
  "name": "focus-official",
  "description": "Marketplace officiel FocusMCP",
  "bricks": [
    {
      "name": "indexer",
      "version": "1.0.0",
      "description": "Indexation de fichiers avec cache",
      "source": "focus/brick-indexer",
      "dependencies": [],
      "tags": ["core", "filesystem"]
    },
    {
      "name": "php",
      "version": "1.0.0",
      "description": "Compréhension avancée du langage PHP",
      "source": "focus/brick-php",
      "dependencies": ["indexer"],
      "tags": ["language", "php"]
    }
  ]
}
```

### CLI — Commandes (inspirées npm/yarn)

```bash
focus start                    # démarre FocusMCP (Tauri + sidecar)
focus stop                     # arrête FocusMCP

focus add php                  # installe une brique (+ ses dépendances)
focus remove php               # supprime une brique
focus update                   # met à jour toutes les briques
focus update php               # met à jour une brique spécifique
focus list                     # liste les briques installées
focus search indexer           # cherche dans le marketplace
focus info php                 # détails d'une brique

focus status                   # état de chaque brique (running/stopped/error)
focus logs                     # affiche les logs EventBus
focus logs php                 # logs filtrés pour une brique

focus catalog add org/repo     # ajoute un marketplace tiers (P1)
focus catalog list             # liste les catalogues configurés
focus catalog remove org/repo  # supprime un catalogue

focus config set auth.enabled true   # configure via CLI
focus config set port 4000           # change le port
focus config get                     # affiche la config
```

---

## Sécurité — 3 couches

```
┌─────────────────────────────────────────┐
│  Couche 1 — EventBus (garde-fous)       │  Node.js
│  Timeout, rate limit, max call depth    │
│  Permissions inter-briques (manifeste)  │
│  Circuit breaker, payload size          │
├─────────────────────────────────────────┤
│  Couche 2 — Tauri (sandbox système)     │  Rust
│  Contrôle accès filesystem              │
│  Contrôle accès réseau                  │
│  Scope par brique (dossiers autorisés)  │
│  Confirmation utilisateur si hors scope │
├─────────────────────────────────────────┤
│  Couche 3 — UI (contrôle humain)        │
│  Configurer les permissions par brique  │
│  Voir les accès bloqués / autorisés     │
│  Activer / désactiver les garde-fous    │
└─────────────────────────────────────────┘
```

- **Couche 1 (EventBus)** : protège les briques **entre elles** (logique applicative)
- **Couche 2 (Tauri)** : protège le **système** contre les briques (sandbox OS)
- **Couche 3 (UI)** : l'**utilisateur** configure et supervise le tout

Les briques JS n'accèdent **jamais au système directement**. Tout passe par Tauri (Rust) qui filtre et autorise.

---

## Modes de fonctionnement

### Mode Desktop (par défaut)

App Tauri avec fenêtre native. Tray icon, auto-start, sandbox Rust, UI dans le WebView.

```
Utilisateur → App Desktop (Tauri + WebView) → UI native
Client AI   → http://localhost:3000/mcp (endpoint MCP)
```

### Mode Serveur

Tauri tourne en **headless** (sans fenêtre), mais le sandbox Rust reste actif. L'UI est exposée en web sur un port configurable pour accès à distance.

```
Tauri (headless, sandbox actif)
  └── Node.js (sidecar, sandboxé)
        ├── http://server:3000     → UI web (navigateur distant)
        └── http://server:3000/mcp → endpoint MCP (clients AI)
```

### Mode CLI only

Tauri tourne en **headless** (sans fenêtre, sans UI web). Le sandbox Rust reste actif. Gestion uniquement via le terminal.

```bash
focus start                    # démarre Tauri + sidecar Node.js
focus add php                  # installe une brique
focus list                     # liste les briques
focus status                   # état de chaque brique
focus logs                     # affiche les logs EventBus
focus remove php               # supprime une brique
```

```
Tauri (headless, sandbox actif)
  └── Node.js (sidecar, sandboxé)
        └── http://localhost:3000/mcp → endpoint MCP (clients AI)
```

### Résumé des modes

| Mode | UI | Sandbox Tauri | Tray icon | Cible |
|---|---|---|---|---|
| **Desktop** | WebView natif | Oui | Oui | Utilisateurs desktop |
| **Serveur** | Web (navigateur distant) | Oui | Non | VPS, CI, équipes |
| **CLI only** | Aucune (terminal) | Oui | Non | Devs, scripts, automation |

> **Tauri tourne toujours** — c'est lui qui lance et contrôle le sidecar Node.js. Le sandbox Rust est actif dans les 3 modes. Seule l'interface change : WebView natif, web exposé, ou terminal. Le core Node.js (Registry + EventBus + Router + briques) est identique dans les 3 modes.

---

## Stack technique

| Composant | Technologie | Rôle |
|---|---|---|
| App desktop | **Tauri** (Rust) | Coquille desktop, sandbox, tray icon, auto-start |
| MCP core | **Node.js / TypeScript** | Registry, EventBus, Router, briques |
| UI | **Web** (React/Svelte + Tailwind) | Dashboard (WebView Tauri ou navigateur en mode serveur) |
| Communication AI | **Streamable HTTP** (spec MCP 2025-03-26) | Endpoint pour les clients AI |
| Briques | **TypeScript** | Modules chargés dans le core Node.js |
| Manifeste | **JSON** (`mcp-brick.json`) | Déclaration d'une brique |
| Catalogue | **JSON** (`catalog.json`) | Liste des briques d'un marketplace |
| Persistance briques | **SQLite + FTS5** (BM25) | Mémoire de session, indexation, recherche full-text (briques `focus-memory`, `focus-indexer`) |
| Sandbox JS éphémère | **isolated-vm** ou **vm2** | Exécution "think in code" (brique `focus-sandbox`) |

---

## Ce qui existe vs. ce qu'on fait

| Critère | MetaMCP / MCPHub | Context Mode | Claude Octopus | FocusMCP |
|---|---|---|---|---|
| Architecture | MCP côte à côte | 1 serveur MCP avec 6 outils sandbox | Orchestration multi-LLM (8 providers) | Écosystème de briques composables |
| Communication | Proxy passif | Hooks + sandbox | Phases (discover/define/develop/deliver) | Router + EventBus inter-briques |
| Extensibilité | Brancher d'autres MCP | Outils figés | Personas + commandes | Marketplace de briques |
| Optimisation tokens | Non | Sandbox + persistance SQLite | Compression pipeline (~7k/session) | Cache + indexation + sandbox + memory |
| Persistance | Non | SQLite/FTS5 intégré | Worktrees git | Brique `focus-memory` (SQLite/FTS5) |
| Philosophie | Agrégateur | Boîte à outils figée | Adversarial multi-LLM | Écosystème composable de spécialistes |

---

## Décisions prises

| Décision | Choix | Raison |
|---|---|---|
| **App desktop** | Tauri (Rust) | Léger, sandbox système, tray icon, auto-start, API native |
| **MCP core** | Node.js / TypeScript | Écosystème MCP existant, briques en TS, un seul langage pour le core + briques |
| **Transport externe** (AI → Center) | Streamable HTTP (spec MCP 2025-03-26) | Standard MCP, compatible tous les clients |
| **Transport inter-briques** | EventBus interne (in-process) | Un seul process, zéro overhead |
| **Architecture interne** | 3 piliers : McpRegistry + EventBus + MCP Router | Séparation des responsabilités claire |
| **Communication** | Event-driven : pub/sub + request/response | Découplage total entre briques |
| **Isolation briques** | In-process (modules TS) | Un seul MCP, simple, performant |
| **Sandbox** | Tauri (Rust) contrôle les accès système du JS | Les briques n'accèdent jamais au système directement |
| **Sécurité** | 3 couches : EventBus (logique) + Tauri (système) + UI (humain) | Défense en profondeur |
| **Authentification** | Optionnelle, configurable via UI/CLI | Désactivée par défaut (local). Activable avec token/clé API pour le mode serveur |
| **Monitoring** | Via l'EventBus | Tout passe par le bus → tout est observable gratuitement |
| **Modes** | Desktop / Serveur / CLI only | Tauri toujours actif (sandbox), seule l'UI change |
| **Marketplace** | Officiel par défaut, tiers en P1 | Coquille vide + catalogue, comme npm |
| **Persistence** | Fichier JSON | Simple, lisible, pas de dépendance DB |
| **Namespace événements** | `brick:action` (ex: `indexer:search`) | Cohérent avec le nom de brique dans le manifeste |
| **Framework UI** | Svelte + Tailwind | Léger, parfait pour Tauri, moins de boilerplate |
| **Structure** | 2 repos : `focus` (l'app) + `focus-marketplace` (toutes les briques officielles) | Séparation claire app vs écosystème. Les briques officielles sont dans un seul monorepo |

## Questions ouvertes

Aucune — toutes les décisions sont prises.

---

## Inspirations

FocusMCP s'inspire d'idées éprouvées dans plusieurs projets et écosystèmes. Chaque référence est ici pour rendre à César ce qui est à César et pour documenter d'où viennent nos patterns.

| Source | Ce qu'on a piqué | Pourquoi |
|---|---|---|
| **[Context Mode](https://github.com/mksglu/context-mode)** | Pattern "think in code" (brique `focus-sandbox`), persistance session SQLite + FTS5/BM25 (brique `focus-memory`), hook-based routing client (P1) | Approche éprouvée pour réduire les outputs MCP de 98% et survivre aux compactions de contexte |
| **[Claude Octopus](https://github.com/nyldn/claude-octopus)** | Isolated git worktrees pour parallélisation (brique `focus-worktree` P2), reaction engine pour événements externes CI/PR (brique `focus-reactor` P2), circuit breakers | Patterns d'orchestration et de résilience multi-agents |
| **[Claude Code Plugins](https://code.claude.com/docs/fr/discover-plugins)** | Modèle marketplace officiel + tiers, format de catalogue, mécanisme d'installation/découverte | Référence canonique pour l'expérience d'installation/découverte de plugins |
| **[modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)** — notamment [`sequentialthinking`](https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking) | Concept de raisonnement externalisé (thoughts numérotés, révisions, branches) — réimplémenté en native dans la brique `focus-thinking` | Pattern éprouvé d'optimisation de contexte par externalisation du reasoning |
| **npm / yarn** | `.centerrc`, `center.json`, `center.lock`, CLI (`add`, `remove`, `update`, `search`...), graphe de dépendances, intégrité (sha256) | Modèle mature de gestion de packages, graphes de dépendances, lock files |
| **WAMP / MAMP** | App desktop avec tray icon, auto-start, services en fond | UX desktop familière pour gérer un orchestrateur local |
| **VS Code marketplace** | Coquille vide + écosystème d'extensions, qualité tier (officiel/communauté) | Modèle d'éditeur extensible où la valeur est dans l'écosystème |
| **Docker / Docker Hub** | Runtime + registry public, séparation runtime / catalogue | Architecture éprouvée runtime ↔ marketplace |
| **MetaMCP / MCPHub** | Concept d'agrégation MCP (qu'on dépasse avec la composabilité) | Point de comparaison pour positionner FocusMCP au-delà du simple agrégateur |
