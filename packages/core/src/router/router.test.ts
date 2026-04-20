// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { InProcessEventBus } from '../event-bus/event-bus.ts';
import { InMemoryRegistry } from '../registry/registry.ts';
import type { Brick } from '../types/brick.ts';
import type { BrickManifest } from '../types/manifest.ts';
import type { ToolResult } from '../types/tool.ts';
import { McpRouter } from './router.ts';

let _prefixCounter = 0;
function fakeBrick(manifest: Partial<BrickManifest> & Pick<BrickManifest, 'name'>): Brick {
    const defaultPrefix = manifest.prefix ?? `b${++_prefixCounter}`;
    return {
        manifest: {
            version: '1.0.0',
            prefix: defaultPrefix,
            description: '',
            dependencies: [],
            tools: [],
            ...manifest,
        },
        start: () => {},
        stop: () => {},
    };
}

function setupRouter(): {
    router: McpRouter;
    registry: InMemoryRegistry;
    bus: InProcessEventBus;
} {
    const registry = new InMemoryRegistry();
    const bus = new InProcessEventBus();
    const router = new McpRouter({ registry, bus });
    return { router, registry, bus };
}

describe('McpRouter — listTools', () => {
    it('agrège les tools de toutes les briques running avec noms préfixés', () => {
        const { router, registry } = setupRouter();

        registry.register(
            fakeBrick({
                name: 'indexer',
                prefix: 'idx',
                tools: [
                    {
                        name: 'search',
                        description: 'search',
                        inputSchema: { type: 'object' },
                    },
                ],
            }),
        );
        registry.setStatus('indexer', 'running');

        const tools = router.listTools().map((t) => t.name);

        expect(tools).toEqual(['idx_search']);
    });

    it('ne retourne pas les tools de briques non-running', () => {
        const { router, registry } = setupRouter();

        registry.register(
            fakeBrick({
                name: 'indexer',
                prefix: 'idx',
                tools: [
                    {
                        name: 'search',
                        description: 'search',
                        inputSchema: { type: 'object' },
                    },
                ],
            }),
        );

        expect(router.listTools()).toEqual([]);
    });
});

describe('McpRouter — callTool', () => {
    it("dispatch l'appel vers la brique propriétaire via l'EventBus avec le nom original (brick:toolName)", async () => {
        const { router, registry, bus } = setupRouter();

        registry.register(
            fakeBrick({
                name: 'indexer',
                prefix: 'idx',
                tools: [
                    {
                        name: 'search',
                        description: 'search',
                        inputSchema: { type: 'object' },
                    },
                ],
            }),
        );
        registry.setStatus('indexer', 'running');

        const expected: ToolResult = { content: [{ type: 'text', text: 'ok' }] };
        bus.handle('indexer:search', () => expected);

        const result = await router.callTool('idx_search', { pattern: '*.ts' });

        expect(result).toBe(expected);
    });

    it('propage les arguments au handler', async () => {
        const { router, registry, bus } = setupRouter();

        registry.register(
            fakeBrick({
                name: 'indexer',
                prefix: 'idx',
                tools: [
                    {
                        name: 'search',
                        description: 'search',
                        inputSchema: { type: 'object' },
                    },
                ],
            }),
        );
        registry.setStatus('indexer', 'running');

        let captured: unknown;
        bus.handle('indexer:search', (args) => {
            captured = args;
            return { content: [] };
        });

        await router.callTool('idx_search', { pattern: '*.ts' });

        expect(captured).toEqual({ pattern: '*.ts' });
    });

    it("rejette avec TOOL_NOT_FOUND si le tool n'existe dans aucune brique", async () => {
        const { router } = setupRouter();

        await expect(router.callTool('unknown_tool', {})).rejects.toMatchObject({
            name: 'RouterError',
            code: 'TOOL_NOT_FOUND',
        });
    });

    it("rejette avec BRICK_NOT_RUNNING si la brique propriétaire n'est pas running", async () => {
        const { router, registry } = setupRouter();

        registry.register(
            fakeBrick({
                name: 'indexer',
                prefix: 'idx',
                tools: [
                    {
                        name: 'search',
                        description: 'search',
                        inputSchema: { type: 'object' },
                    },
                ],
            }),
        );
        // pas de setStatus('running')

        await expect(router.callTool('idx_search', {})).rejects.toMatchObject({
            name: 'RouterError',
            code: 'BRICK_NOT_RUNNING',
        });
    });
});
