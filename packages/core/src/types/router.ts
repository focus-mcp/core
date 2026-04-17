// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import type { ToolDefinition, ToolResult } from './tool.ts';

/**
 * Gateway exposée aux clients AI via l'endpoint Streamable HTTP MCP.
 * Reçoit tools/list et tools/call et dispatch vers les briques via l'EventBus.
 */
export interface Router {
    /** Liste des tools agrégés (tools/list). */
    listTools(): readonly ToolDefinition[];

    /** Appel d'un tool (tools/call). Dispatch vers la brique propriétaire. */
    callTool(name: string, args: unknown): Promise<ToolResult>;
}

export class RouterError extends Error {
    constructor(
        message: string,
        public readonly code: RouterErrorCode,
        public readonly meta?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'RouterError';
    }
}

export type RouterErrorCode = 'TOOL_NOT_FOUND' | 'INVALID_ARGS' | 'BRICK_NOT_RUNNING';
