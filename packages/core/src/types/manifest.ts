// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import type { ToolDefinition } from './tool.ts';

/**
 * Manifeste déclaratif d'une brique.
 * Chaque brique du marketplace expose un fichier `mcp-brick.json`
 * conforme à cette interface.
 */
export interface BrickManifest {
    /** Identifiant unique de la brique (kebab-case, ex: "indexer", "sf-router"). */
    readonly name: string;
    /** Version SemVer de la brique. */
    readonly version: string;
    /**
     * Prefix exposed to AI clients. Tools are listed as `{prefix}_{toolName}`.
     * Must be lowercase alphanumeric, unique per registry.
     * Reserved: focus, focusmcp, mcp, internal, system.
     */
    readonly prefix: string;
    /** Description courte (une ligne). */
    readonly description: string;
    /** Liste des briques dont cette brique dépend (whitelist EventBus). */
    readonly dependencies: readonly string[];
    /** Tools exposés par cette brique au MCP Router. */
    readonly tools: readonly ToolDefinition[];
    /** Schéma de configuration (JSON Schema partiel, optionnel). */
    readonly config?: Readonly<Record<string, ConfigField>>;
    /** Tags pour la recherche/découverte dans le marketplace. */
    readonly tags?: readonly string[];
    /** Free-form keywords for discovery (e.g. "typescript", "ast", "security"). */
    readonly keywords?: readonly string[];
    /** Stacks or frameworks this brick is recommended for (e.g. "react", "next", "symfony"). */
    readonly recommendedFor?: readonly string[];
}

export interface ConfigField {
    readonly type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    readonly description: string;
    readonly default?: unknown;
    readonly required?: boolean;
}
