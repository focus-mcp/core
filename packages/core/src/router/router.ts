// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import type { EventBus } from '../types/event-bus.ts';
import type { Registry } from '../types/registry.ts';
import { type Router, RouterError } from '../types/router.ts';
import type { ToolDefinition, ToolResult } from '../types/tool.ts';

export interface McpRouterOptions {
    readonly registry: Registry;
    readonly bus: EventBus;
}

/**
 * MCP Router — gateway pour les clients AI.
 *
 * Reçoit les appels `tools/list` (agrégation depuis le Registry) et
 * `tools/call` (dispatch via l'EventBus vers la brique propriétaire).
 *
 * Convention event target : `<brickName>:<toolName>`.
 */
export class McpRouter implements Router {
    readonly #registry: Registry;
    readonly #bus: EventBus;

    constructor(options: McpRouterOptions) {
        this.#registry = options.registry;
        this.#bus = options.bus;
    }

    listTools(): readonly ToolDefinition[] {
        return this.#registry.getTools();
    }

    async callTool(name: string, args: unknown): Promise<ToolResult> {
        const brickName = this.#registry.getBrickForTool(name);
        if (brickName === undefined) {
            throw new RouterError(`Tool "${name}" not found`, 'TOOL_NOT_FOUND', { tool: name });
        }

        if (this.#registry.getStatus(brickName) !== 'running') {
            throw new RouterError(
                `Brick "${brickName}" is not running (required for tool "${name}")`,
                'BRICK_NOT_RUNNING',
                { tool: name, brick: brickName },
            );
        }

        const target = `${brickName}:${name}`;
        return await this.#bus.request<unknown, ToolResult>(target, args);
    }
}
