// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import type { BrickContext, BrickLogger } from '@focusmcp/core';
import { InProcessEventBus } from '@focusmcp/core';
import { describe, expect, it, vi } from 'vitest';
import { BrickDefinitionError, defineBrick } from './define-brick.ts';

const noopLogger: BrickLogger = {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
};

const validManifest = {
    name: 'indexer',
    version: '1.0.0',
    prefix: 'idx',
    description: 'Indexation filesystem',
    dependencies: [],
    tools: [
        {
            name: 'search',
            description: 'Search files',
            inputSchema: { type: 'object' as const },
        },
    ],
};

function makeCtx(overrides: Partial<BrickContext> = {}): BrickContext {
    return {
        bus: overrides.bus ?? new InProcessEventBus(),
        config: overrides.config ?? {},
        logger: overrides.logger ?? noopLogger,
    };
}

describe('defineBrick — shape', () => {
    it('retourne un Brick conforme avec manifest, start, stop', () => {
        const brick = defineBrick({
            manifest: validManifest,
            handlers: { search: () => ({ files: [] }) },
        });

        expect(brick.manifest.name).toBe('indexer');
        expect(typeof brick.start).toBe('function');
        expect(typeof brick.stop).toBe('function');
    });

    it('valide le manifeste via parseManifest (propage les erreurs)', () => {
        expect(() =>
            defineBrick({
                manifest: { ...validManifest, name: 'BadName' },
                handlers: { search: () => 'ok' },
            }),
        ).toThrow(expect.objectContaining({ name: 'ManifestError', code: 'INVALID_NAME' }));
    });

    it('MISSING_HANDLER : un tool déclaré sans handler', () => {
        expect(() =>
            defineBrick({
                manifest: validManifest,
                handlers: {},
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'BrickDefinitionError',
                code: 'MISSING_HANDLER',
            }),
        );
    });

    it('UNKNOWN_HANDLER : un handler sans tool correspondant dans le manifeste', () => {
        expect(() =>
            defineBrick({
                manifest: validManifest,
                handlers: {
                    search: () => 'ok',
                    orphan: () => 'ko',
                },
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'BrickDefinitionError',
                code: 'UNKNOWN_HANDLER',
            }),
        );
    });
});

describe('defineBrick — lifecycle', () => {
    it('start enregistre chaque handler au format <brick>:<tool> sur le bus', async () => {
        const bus = new InProcessEventBus();
        const brick = defineBrick({
            manifest: validManifest,
            handlers: {
                search: (payload) => {
                    const typed = payload as { q: string };
                    return { found: typed.q };
                },
            },
        });

        await brick.start(makeCtx({ bus }));

        await expect(bus.request('indexer:search', { q: 'foo' })).resolves.toEqual({
            found: 'foo',
        });
    });

    it('injecte le BrickContext (bus/config/logger) dans chaque handler', async () => {
        const bus = new InProcessEventBus();
        const config = { phpVersion: '8.3' } as const;
        const logger = { ...noopLogger, info: vi.fn() };

        const brick = defineBrick({
            manifest: validManifest,
            handlers: {
                search: (_payload, ctx) => {
                    ctx.logger.info('called');
                    return { version: ctx.config['phpVersion'] };
                },
            },
        });

        await brick.start(makeCtx({ bus, config, logger }));
        const result = await bus.request('indexer:search', null);

        expect(result).toEqual({ version: '8.3' });
        expect(logger.info).toHaveBeenCalledWith('called');
    });

    it('stop désenregistre tous les handlers', async () => {
        const bus = new InProcessEventBus();
        const brick = defineBrick({
            manifest: validManifest,
            handlers: { search: () => 'ok' },
        });

        await brick.start(makeCtx({ bus }));
        await brick.stop();

        await expect(bus.request('indexer:search', null)).rejects.toMatchObject({
            code: 'NO_HANDLER',
        });
    });

    it('stop avant start ne throw pas', () => {
        const brick = defineBrick({
            manifest: validManifest,
            handlers: { search: () => 'ok' },
        });

        expect(() => brick.stop()).not.toThrow();
    });

    it('double start refuse (ALREADY_STARTED)', async () => {
        const bus = new InProcessEventBus();
        const brick = defineBrick({
            manifest: validManifest,
            handlers: { search: () => 'ok' },
        });

        await brick.start(makeCtx({ bus }));
        expect(() => brick.start(makeCtx({ bus }))).toThrow(
            expect.objectContaining({
                name: 'BrickDefinitionError',
                code: 'ALREADY_STARTED',
            }),
        );
    });

    it('BrickDefinitionError est une sous-classe d’Error exportée', () => {
        const err = new BrickDefinitionError('x', 'MISSING_HANDLER');
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('BrickDefinitionError');
        expect(err.code).toBe('MISSING_HANDLER');
    });
});
