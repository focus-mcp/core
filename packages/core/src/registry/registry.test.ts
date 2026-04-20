// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { Brick } from '../types/brick.ts';
import type { BrickManifest } from '../types/manifest.ts';
import { InMemoryRegistry } from './registry.ts';

let _prefixCounter = 0;
function fakeBrick(manifest: Partial<BrickManifest> & Pick<BrickManifest, 'name'>): Brick {
    // generate a unique default prefix if not provided
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

describe('InMemoryRegistry — register / unregister', () => {
    it('enregistre une brique et la rend récupérable par son nom', () => {
        const registry = new InMemoryRegistry();
        const brick = fakeBrick({ name: 'indexer' });

        registry.register(brick);

        expect(registry.getBrick('indexer')).toBe(brick);
        expect(registry.getBricks()).toContain(brick);
    });

    it("rejette l'enregistrement si une brique du même nom existe déjà", () => {
        const registry = new InMemoryRegistry();
        registry.register(fakeBrick({ name: 'indexer' }));

        expect(() => registry.register(fakeBrick({ name: 'indexer' }))).toThrow(
            expect.objectContaining({ name: 'RegistryError', code: 'BRICK_ALREADY_REGISTERED' }),
        );
    });

    it('désenregistre une brique sans dépendants', () => {
        const registry = new InMemoryRegistry();
        registry.register(fakeBrick({ name: 'indexer' }));

        registry.unregister('indexer');

        expect(registry.getBrick('indexer')).toBeUndefined();
    });

    it("refuse de désenregistrer une brique dont d'autres briques running dépendent", () => {
        const registry = new InMemoryRegistry();
        registry.register(fakeBrick({ name: 'indexer' }));
        registry.register(fakeBrick({ name: 'php', dependencies: ['indexer'] }));
        registry.setStatus('php', 'running');

        expect(() => registry.unregister('indexer')).toThrow(
            expect.objectContaining({ name: 'RegistryError', code: 'DEPENDENT_BRICKS_RUNNING' }),
        );
    });
});

describe('InMemoryRegistry — resolve (graphe de dépendances)', () => {
    it("retourne les briques dans l'ordre de démarrage (dépendances d'abord)", () => {
        const registry = new InMemoryRegistry();
        registry.register(fakeBrick({ name: 'cache' }));
        registry.register(fakeBrick({ name: 'indexer', dependencies: ['cache'] }));
        registry.register(fakeBrick({ name: 'php', dependencies: ['indexer'] }));

        const order = registry.resolve('php').map((b) => b.manifest.name);

        expect(order).toEqual(['cache', 'indexer', 'php']);
    });

    it('détecte les cycles (CYCLE_DETECTED)', () => {
        const registry = new InMemoryRegistry();
        registry.register(fakeBrick({ name: 'a', dependencies: ['b'] }));
        registry.register(fakeBrick({ name: 'b', dependencies: ['a'] }));

        expect(() => registry.resolve('a')).toThrow(
            expect.objectContaining({ name: 'RegistryError', code: 'CYCLE_DETECTED' }),
        );
    });

    it('signale les dépendances manquantes (MISSING_DEPENDENCY)', () => {
        const registry = new InMemoryRegistry();
        registry.register(fakeBrick({ name: 'php', dependencies: ['indexer'] }));

        expect(() => registry.resolve('php')).toThrow(
            expect.objectContaining({ name: 'RegistryError', code: 'MISSING_DEPENDENCY' }),
        );
    });
});

describe('InMemoryRegistry — erreurs BRICK_NOT_FOUND', () => {
    it("unregister d'une brique inexistante rejette avec BRICK_NOT_FOUND", () => {
        const registry = new InMemoryRegistry();

        expect(() => registry.unregister('ghost')).toThrow(
            expect.objectContaining({ name: 'RegistryError', code: 'BRICK_NOT_FOUND' }),
        );
    });

    it("getStatus d'une brique inexistante rejette avec BRICK_NOT_FOUND", () => {
        const registry = new InMemoryRegistry();

        expect(() => registry.getStatus('ghost')).toThrow(
            expect.objectContaining({ name: 'RegistryError', code: 'BRICK_NOT_FOUND' }),
        );
    });

    it("setStatus d'une brique inexistante rejette avec BRICK_NOT_FOUND", () => {
        const registry = new InMemoryRegistry();

        expect(() => registry.setStatus('ghost', 'running')).toThrow(
            expect.objectContaining({ name: 'RegistryError', code: 'BRICK_NOT_FOUND' }),
        );
    });
});

describe('InMemoryRegistry — status', () => {
    it("la valeur initiale d'une brique enregistrée est 'stopped'", () => {
        const registry = new InMemoryRegistry();
        registry.register(fakeBrick({ name: 'indexer' }));

        expect(registry.getStatus('indexer')).toBe('stopped');
    });

    it('met à jour le statut via setStatus', () => {
        const registry = new InMemoryRegistry();
        registry.register(fakeBrick({ name: 'indexer' }));

        registry.setStatus('indexer', 'running');

        expect(registry.getStatus('indexer')).toBe('running');
    });
});

describe('InMemoryRegistry — getBrickForTool', () => {
    it('retourne le nom de la brique via le nom préfixé', () => {
        const registry = new InMemoryRegistry();
        registry.register(
            fakeBrick({
                name: 'indexer',
                prefix: 'idx',
                tools: [{ name: 'search', description: '', inputSchema: { type: 'object' } }],
            }),
        );

        expect(registry.getBrickForTool('idx_search')).toBe('indexer');
    });

    it("retourne undefined si le tool n'est exposé par aucune brique", () => {
        const registry = new InMemoryRegistry();

        expect(registry.getBrickForTool('ghost_tool')).toBeUndefined();
    });

    it('retourne undefined si le préfixe est inconnu', () => {
        const registry = new InMemoryRegistry();
        registry.register(
            fakeBrick({
                name: 'indexer',
                prefix: 'idx',
                tools: [{ name: 'search', description: '', inputSchema: { type: 'object' } }],
            }),
        );

        expect(registry.getBrickForTool('unknown_search')).toBeUndefined();
    });

    it("cherche parmi plusieurs tools d'une brique et plusieurs briques", () => {
        const registry = new InMemoryRegistry();
        registry.register(
            fakeBrick({
                name: 'indexer',
                prefix: 'idx',
                tools: [
                    { name: 'search', description: '', inputSchema: { type: 'object' } },
                    { name: 'stats', description: '', inputSchema: { type: 'object' } },
                ],
            }),
        );
        registry.register(
            fakeBrick({
                name: 'php',
                prefix: 'phpb',
                tools: [{ name: 'analyze', description: '', inputSchema: { type: 'object' } }],
            }),
        );

        expect(registry.getBrickForTool('idx_stats')).toBe('indexer');
        expect(registry.getBrickForTool('phpb_analyze')).toBe('php');
    });
});

describe('InMemoryRegistry — getTools', () => {
    it('agrège les tools de toutes les briques running avec noms préfixés', () => {
        const registry = new InMemoryRegistry();
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
        registry.register(
            fakeBrick({
                name: 'php',
                prefix: 'phpb',
                tools: [
                    {
                        name: 'analyze',
                        description: 'analyze',
                        inputSchema: { type: 'object' },
                    },
                ],
            }),
        );
        registry.setStatus('indexer', 'running');
        registry.setStatus('php', 'running');

        const toolNames = registry.getTools().map((t) => t.name);

        expect(toolNames).toEqual(expect.arrayContaining(['idx_search', 'phpb_analyze']));
    });

    it("n'inclut PAS les tools des briques non-running", () => {
        const registry = new InMemoryRegistry();
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

        expect(registry.getTools()).toEqual([]);
    });
});

describe('InMemoryRegistry — unicité du prefix', () => {
    it("rejette l'enregistrement si le prefix est déjà utilisé", () => {
        const registry = new InMemoryRegistry();
        registry.register(fakeBrick({ name: 'indexer', prefix: 'idx' }));

        expect(() => registry.register(fakeBrick({ name: 'other', prefix: 'idx' }))).toThrow(
            expect.objectContaining({ name: 'RegistryError', code: 'DUPLICATE_PREFIX' }),
        );
    });

    it('libère le prefix après unregister, permettant de le réutiliser', () => {
        const registry = new InMemoryRegistry();
        registry.register(fakeBrick({ name: 'indexer', prefix: 'idx' }));
        registry.unregister('indexer');

        expect(() => registry.register(fakeBrick({ name: 'other', prefix: 'idx' }))).not.toThrow();
    });
});

describe('getBrickForTool — edge cases', () => {
    it('returns undefined for tool without underscore', () => {
        const registry = new InMemoryRegistry();
        expect(registry.getBrickForTool('noprefix')).toBeUndefined();
    });

    it('returns undefined for unknown prefix', () => {
        const registry = new InMemoryRegistry();
        expect(registry.getBrickForTool('unknown_tool')).toBeUndefined();
    });

    it('returns undefined for unknown tool name with valid prefix', () => {
        const registry = new InMemoryRegistry();
        registry.register(
            fakeBrick({
                name: 'test',
                prefix: 'tst',
                tools: [{ name: 'search', description: 'x', inputSchema: { type: 'object' } }],
            }),
        );
        expect(registry.getBrickForTool('tst_nonexistent')).toBeUndefined();
    });
});

describe('getOriginalToolName — edge cases', () => {
    it('returns undefined for tool without underscore', () => {
        const registry = new InMemoryRegistry();
        expect(registry.getOriginalToolName('noprefix')).toBeUndefined();
    });

    it('returns undefined for unknown prefix', () => {
        const registry = new InMemoryRegistry();
        expect(registry.getOriginalToolName('unknown_tool')).toBeUndefined();
    });

    it('returns undefined for unknown tool with valid prefix', () => {
        const registry = new InMemoryRegistry();
        registry.register(
            fakeBrick({
                name: 'test',
                prefix: 'tst',
                tools: [{ name: 'search', description: 'x', inputSchema: { type: 'object' } }],
            }),
        );
        expect(registry.getOriginalToolName('tst_nonexistent')).toBeUndefined();
    });

    it('returns original name for valid prefixed tool', () => {
        const registry = new InMemoryRegistry();
        registry.register(
            fakeBrick({
                name: 'test',
                prefix: 'tst',
                tools: [{ name: 'search', description: 'x', inputSchema: { type: 'object' } }],
            }),
        );
        expect(registry.getOriginalToolName('tst_search')).toBe('search');
    });
});

describe('prefix edge cases — coverage', () => {
    it('getBrickForTool returns undefined when entry exists but tool not found', () => {
        const registry = new InMemoryRegistry();
        registry.register(
            fakeBrick({
                name: 'alpha',
                prefix: 'alp',
                tools: [{ name: 'one', description: 'x', inputSchema: { type: 'object' } }],
            }),
        );
        expect(registry.getBrickForTool('alp_two')).toBeUndefined();
    });

    it('getOriginalToolName returns undefined when entry not in entries map', () => {
        const registry = new InMemoryRegistry();
        registry.register(fakeBrick({ name: 'beta', prefix: 'bet', tools: [] }));
        // Unregister removes from entries
        registry.unregister('beta');
        expect(registry.getOriginalToolName('bet_x')).toBeUndefined();
    });
});
