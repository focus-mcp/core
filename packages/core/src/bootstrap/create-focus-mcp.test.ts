// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { Brick, Unsubscribe } from '../types/index.ts';
import { createFocusMcp } from './create-focus-mcp.ts';

function brick(
    name: string,
    deps: readonly string[],
    toolName: string,
    handler: (payload: unknown) => unknown,
    prefix?: string,
): Brick {
    const resolvedPrefix = prefix ?? (name.replace(/[^a-z0-9]/g, '').slice(0, 8) || 'b');
    let unsubs: Unsubscribe[] = [];
    return {
        manifest: {
            name,
            version: '1.0.0',
            prefix: resolvedPrefix,
            description: name,
            dependencies: deps,
            tools: [{ name: toolName, description: 'x', inputSchema: { type: 'object' } }],
        },
        start(ctx): void {
            unsubs.push(ctx.bus.handle(`${name}:${toolName}`, handler));
        },
        stop(): void {
            for (const u of unsubs) u();
            unsubs = [];
        },
    };
}

describe('createFocusMcp — assembly', () => {
    it('expose registry, bus, router immédiatement', () => {
        const app = createFocusMcp();
        expect(app.registry).toBeDefined();
        expect(app.bus).toBeDefined();
        expect(app.router).toBeDefined();
    });

    it('enregistre les briques passées dans options.bricks', () => {
        const app = createFocusMcp({
            bricks: [brick('indexer', [], 'search', () => 'ok')],
        });
        expect(app.registry.getBrick('indexer')).toBeDefined();
    });
});

describe('createFocusMcp — lifecycle', () => {
    it('start() passe les briques en running', async () => {
        const app = createFocusMcp({
            bricks: [brick('maths', [], 'add', () => ({ ok: true }))],
        });
        await app.start();
        expect(app.registry.getStatus('maths')).toBe('running');
        await app.stop();
    });

    it("start() démarre les briques dans l'ordre des dépendances", async () => {
        const starts: string[] = [];
        let _rctr = 0;
        const recording = (name: string, deps: readonly string[]): Brick => ({
            manifest: {
                name,
                version: '1.0.0',
                prefix: `r${++_rctr}`,
                description: name,
                dependencies: deps,
                tools: [],
            },
            start(): void {
                starts.push(name);
            },
            stop(): void {},
        });

        const app = createFocusMcp({
            bricks: [
                recording('php', ['indexer']),
                recording('indexer', []),
                recording('symfony', ['php']),
            ],
        });

        await app.start();
        expect(starts).toEqual(['indexer', 'php', 'symfony']);
        await app.stop();
    });

    it('expose les tools des briques running via le Router (noms préfixés)', async () => {
        const app = createFocusMcp({
            bricks: [
                brick(
                    'maths',
                    [],
                    'add',
                    () => ({
                        content: [{ type: 'text', text: '42' }],
                    }),
                    'maths',
                ),
            ],
        });
        await app.start();

        const names = app.router.listTools().map((t) => t.name);
        expect(names).toEqual(['maths_add']);

        const result = await app.router.callTool('maths_add', {});
        expect(result.content[0]).toEqual({ type: 'text', text: '42' });

        await app.stop();
    });

    it('stop() passe les briques en stopped', async () => {
        const app = createFocusMcp({
            bricks: [brick('maths', [], 'add', () => 'ok')],
        });
        await app.start();
        await app.stop();
        expect(app.registry.getStatus('maths')).toBe('stopped');
    });
});

describe('createFocusMcp — permissions', () => {
    it('applique les permissions manifeste : appel hors deps → PERMISSION_DENIED', async () => {
        let unsubs: Unsubscribe[] = [];
        const indexer: Brick = {
            manifest: {
                name: 'indexer',
                version: '1.0.0',
                prefix: 'idx',
                description: 'indexer',
                dependencies: [],
                tools: [{ name: 'search', description: 'x', inputSchema: { type: 'object' } }],
            },
            start(ctx): void {
                unsubs.push(ctx.bus.handle('indexer:search', () => ({ files: [] })));
            },
            stop(): void {
                for (const u of unsubs) u();
                unsubs = [];
            },
        };

        // php déclare UNIQUEMENT 'indexer' comme dépendance
        let phpUnsubs: Unsubscribe[] = [];
        const php: Brick = {
            manifest: {
                name: 'php',
                version: '1.0.0',
                prefix: 'phpb',
                description: 'php',
                dependencies: ['indexer'],
                tools: [
                    { name: 'ok', description: 'allowed', inputSchema: { type: 'object' } },
                    { name: 'ko', description: 'denied', inputSchema: { type: 'object' } },
                ],
            },
            start(ctx): void {
                phpUnsubs.push(
                    ctx.bus.handle('php:ok', () => ctx.bus.request('indexer:search', {})),
                );
                phpUnsubs.push(ctx.bus.handle('php:ko', () => ctx.bus.request('cache:get', {})));
            },
            stop(): void {
                for (const u of phpUnsubs) u();
                phpUnsubs = [];
            },
        };

        const app = createFocusMcp({ bricks: [indexer, php] });
        await app.start();

        await expect(app.bus.request('php:ok', {})).resolves.toEqual({ files: [] });
        await expect(app.bus.request('php:ko', {})).rejects.toMatchObject({
            code: 'PERMISSION_DENIED',
        });

        await app.stop();
    });
});
