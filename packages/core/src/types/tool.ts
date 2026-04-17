// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * Définition d'un tool exposé par une brique au MCP Router.
 * Conforme au format MCP officiel (tools/list, tools/call).
 */
export interface ToolDefinition {
    /** Nom du tool (préfixé par la brique au runtime, ex: "indexer_search"). */
    readonly name: string;
    /** Description lisible par l'AI. */
    readonly description: string;
    /** JSON Schema des arguments d'entrée. */
    readonly inputSchema: JsonSchema;
}

export interface JsonSchema {
    readonly type: 'object';
    readonly properties?: Readonly<Record<string, JsonSchemaProperty>>;
    readonly required?: readonly string[];
    readonly additionalProperties?: boolean;
}

export interface JsonSchemaProperty {
    readonly type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
    readonly description?: string;
    readonly enum?: readonly (string | number)[];
    readonly default?: unknown;
    readonly items?: JsonSchemaProperty;
    readonly properties?: Readonly<Record<string, JsonSchemaProperty>>;
}

export interface ToolResult {
    readonly content: readonly ToolContentItem[];
    readonly isError?: boolean;
}

export type ToolContentItem =
    | { readonly type: 'text'; readonly text: string }
    | { readonly type: 'json'; readonly data: unknown };
