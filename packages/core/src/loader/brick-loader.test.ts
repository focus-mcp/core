// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from 'vitest';
import type { Brick, BrickManifest } from '../types/index.ts';
import { type BrickSource, loadBricks } from './brick-loader.ts';

function makeManifest(name: string, deps: readonly string[] = [], prefix?: string): BrickManifest {
    return {
        name,
        version: '1.0.0',
        prefix: prefix ?? (name.replace(/[^a-z0-9]/g, '').slice(0, 8) || 'b'),
        description: `${name} brick`,
        dependencies: deps,
        tools: [],
    };
}

function makeBrick(manifest: BrickManifest): Brick {
    return {
        manifest,
        start() {
            /* noop */
        },
        stop() {
            /* noop */
        },
    };
}

function makeSource(
    bricks: ReadonlyArray<{
        name: string;
        manifest?: unknown;
        module?: unknown;
        throws?: 'manifest' | 'module';
    }>,
): BrickSource {
    return {
        list: vi.fn(async () => bricks.map((b) => b.name)),
        readManifest: vi.fn(async (name) => {
            const entry = bricks.find((b) => b.name === name);
            if (!entry) throw new Error(`unknown brick: ${name}`);
            if (entry.throws === 'manifest') throw new Error(`manifest read failed: ${name}`);
            return 'manifest' in entry ? entry.manifest : makeManifest(name);
        }),
        loadModule: vi.fn(async (name) => {
            const entry = bricks.find((b) => b.name === name);
            if (!entry) throw new Error(`unknown brick: ${name}`);
            if (entry.throws === 'module') throw new Error(`module load failed: ${name}`);
            return 'module' in entry ? entry.module : { default: makeBrick(makeManifest(name)) };
        }),
    };
}

describe('loadBricks', () => {
    it('returns empty result when no bricks are listed', async () => {
        const source = makeSource([]);
        const result = await loadBricks({ source });
        expect(result.bricks).toEqual([]);
        expect(result.failures).toEqual([]);
    });

    it('loads a single brick successfully', async () => {
        const source = makeSource([{ name: 'indexer' }]);
        const result = await loadBricks({ source });
        expect(result.bricks).toHaveLength(1);
        expect(result.bricks[0]?.manifest.name).toBe('indexer');
        expect(result.failures).toEqual([]);
    });

    it('loads multiple bricks preserving input order', async () => {
        const source = makeSource([{ name: 'indexer' }, { name: 'cache' }, { name: 'php' }]);
        const result = await loadBricks({ source });
        expect(result.bricks.map((b) => b.manifest.name)).toEqual(['indexer', 'cache', 'php']);
        expect(result.failures).toEqual([]);
    });

    it('records a failure when manifest read throws', async () => {
        const source = makeSource([{ name: 'indexer' }, { name: 'broken', throws: 'manifest' }]);
        const result = await loadBricks({ source });
        expect(result.bricks.map((b) => b.manifest.name)).toEqual(['indexer']);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0]?.name).toBe('broken');
        expect(result.failures[0]?.error).toBeInstanceOf(Error);
    });

    it('records a failure when manifest is invalid (parse error)', async () => {
        const source = makeSource([
            { name: 'broken', manifest: { name: 'broken' /* missing fields */ } },
        ]);
        const result = await loadBricks({ source });
        expect(result.bricks).toEqual([]);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0]?.name).toBe('broken');
    });

    it('records a failure when module load throws', async () => {
        const source = makeSource([{ name: 'indexer' }, { name: 'broken', throws: 'module' }]);
        const result = await loadBricks({ source });
        expect(result.bricks.map((b) => b.manifest.name)).toEqual(['indexer']);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0]?.name).toBe('broken');
    });

    it('records a failure when manifest name mismatches module brick name', async () => {
        const source = makeSource([
            {
                name: 'indexer',
                manifest: makeManifest('indexer'),
                module: { default: makeBrick(makeManifest('cache')) },
            },
        ]);
        const result = await loadBricks({ source });
        expect(result.bricks).toEqual([]);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0]?.name).toBe('indexer');
        expect(result.failures[0]?.error.message).toMatch(/mismatch/i);
    });

    it('records a failure when module manifest diverges from source manifest', async () => {
        const source = makeSource([
            {
                name: 'indexer',
                manifest: makeManifest('indexer', ['cache']),
                module: { default: makeBrick(makeManifest('indexer', [])) },
            },
        ]);
        const result = await loadBricks({ source });
        expect(result.bricks).toEqual([]);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0]?.error.message).toMatch(/mismatch/i);
    });

    it('records a failure when module brick has malformed manifest', async () => {
        const source = makeSource([
            {
                name: 'broken',
                manifest: makeManifest('broken'),
                module: {
                    default: { manifest: 'not-an-object', start() {}, stop() {} },
                },
            },
        ]);
        const result = await loadBricks({ source });
        expect(result.bricks).toEqual([]);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0]?.name).toBe('broken');
    });

    it('records a failure when module has no default export', async () => {
        const source = makeSource([{ name: 'broken', module: { other: 1 } }]);
        const result = await loadBricks({ source });
        expect(result.bricks).toEqual([]);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0]?.name).toBe('broken');
        expect(result.failures[0]?.error.message).toMatch(/has no default export/i);
    });

    it('records a failure when default export is not an object (e.g. number)', async () => {
        const source = makeSource([{ name: 'broken', module: { default: 42 } }]);
        const result = await loadBricks({ source });
        expect(result.bricks).toEqual([]);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0]?.error.message).toMatch(/default export is not an object/i);
    });

    it('records a failure when module is not an object (null)', async () => {
        const source = makeSource([{ name: 'broken', module: null }]);
        const result = await loadBricks({ source });
        expect(result.bricks).toEqual([]);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0]?.error.message).toMatch(/not an object/i);
    });

    it('records a failure when default export does not implement Brick contract', async () => {
        const source = makeSource([
            {
                name: 'broken',
                module: { default: { manifest: makeManifest('broken') /* no start/stop */ } },
            },
        ]);
        const result = await loadBricks({ source });
        expect(result.bricks).toEqual([]);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0]?.error.message).toMatch(/brick contract/i);
    });

    it('continues loading subsequent bricks after a failure', async () => {
        const source = makeSource([
            { name: 'a' },
            { name: 'broken', throws: 'manifest' },
            { name: 'b' },
        ]);
        const result = await loadBricks({ source });
        expect(result.bricks.map((b) => b.manifest.name)).toEqual(['a', 'b']);
        expect(result.failures.map((f) => f.name)).toEqual(['broken']);
    });
});
