// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import type { Brick, BrickContext, BrickLogger, EventBus, Unsubscribe } from '@focusmcp/core';
import { InProcessEventBus } from '@focusmcp/core';
import { describe, expect, it } from 'vitest';
import { validateBrick } from './validate-brick.ts';

const noopLogger: BrickLogger = {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
};

function makeCtx(bus: EventBus): BrickContext {
    return { bus, config: {}, logger: noopLogger };
}

function conformingBrick(): Brick {
    let unsubs: Unsubscribe[] = [];
    return {
        manifest: {
            name: 'indexer',
            version: '1.0.0',
            prefix: 'idx',
            description: 'indexation',
            dependencies: [],
            tools: [{ name: 'search', description: 'search', inputSchema: { type: 'object' } }],
        },
        start(ctx): void {
            unsubs.push(
                ctx.bus.handle('indexer:search', () => ({
                    content: [{ type: 'text', text: 'ok' }],
                })),
            );
        },
        stop(): void {
            for (const u of unsubs) u();
            unsubs = [];
        },
    };
}

describe('validateBrick — manifeste', () => {
    it('ok=true quand la brique est conforme', async () => {
        const report = await validateBrick(conformingBrick(), {
            ctx: makeCtx(new InProcessEventBus()),
        });
        expect(report.ok).toBe(true);
        expect(report.issues).toEqual([]);
    });

    it('INVALID_MANIFEST : manifeste invalide (nom non kebab-case)', async () => {
        const brick: Brick = {
            ...conformingBrick(),
            manifest: { ...conformingBrick().manifest, name: 'BadName' },
        };
        const report = await validateBrick(brick, { ctx: makeCtx(new InProcessEventBus()) });
        expect(report.ok).toBe(false);
        expect(report.issues.map((i) => i.code)).toContain('INVALID_MANIFEST');
    });
});

describe('validateBrick — lifecycle', () => {
    it('START_FAILED : start() lève une exception', async () => {
        const brick: Brick = {
            ...conformingBrick(),
            start(): void {
                throw new Error('boom');
            },
        };
        const report = await validateBrick(brick, { ctx: makeCtx(new InProcessEventBus()) });
        expect(report.ok).toBe(false);
        expect(report.issues.map((i) => i.code)).toContain('START_FAILED');
    });

    it('MISSING_HANDLER : un tool déclaré n’est pas enregistré après start()', async () => {
        const brick: Brick = {
            ...conformingBrick(),
            start(): void {
                /* oublie d'enregistrer */
            },
        };
        const report = await validateBrick(brick, { ctx: makeCtx(new InProcessEventBus()) });
        expect(report.ok).toBe(false);
        const codes = report.issues.map((i) => i.code);
        expect(codes).toContain('MISSING_HANDLER');
    });

    it('HANDLER_LEAK : un handler reste enregistré après stop()', async () => {
        const brick: Brick = {
            ...conformingBrick(),
            stop: () => {
                /* ne désenregistre rien */
            },
        };
        const report = await validateBrick(brick, { ctx: makeCtx(new InProcessEventBus()) });
        expect(report.ok).toBe(false);
        expect(report.issues.map((i) => i.code)).toContain('HANDLER_LEAK');
    });

    it('STOP_FAILED : stop() lève une exception', async () => {
        const brick: Brick = {
            ...conformingBrick(),
            stop(): void {
                throw new Error('boom');
            },
        };
        const report = await validateBrick(brick, { ctx: makeCtx(new InProcessEventBus()) });
        expect(report.ok).toBe(false);
        expect(report.issues.map((i) => i.code)).toContain('STOP_FAILED');
    });
});

describe('validateBrick — contrat tool/bus', () => {
    it('TOOL_CALL_FAILED : un tool déclaré throw à l’appel', async () => {
        const brick: Brick = {
            ...conformingBrick(),
            start(ctx): void {
                ctx.bus.handle('indexer:search', () => {
                    throw new Error('nope');
                });
            },
        };
        const report = await validateBrick(brick, { ctx: makeCtx(new InProcessEventBus()) });
        expect(report.ok).toBe(false);
        expect(report.issues.map((i) => i.code)).toContain('TOOL_CALL_FAILED');
    });

    it('fourni un ctx par défaut si aucun n’est passé', async () => {
        const report = await validateBrick(conformingBrick());
        expect(report.ok).toBe(true);
    });
});
