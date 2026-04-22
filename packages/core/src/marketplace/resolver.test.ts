// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import {
    type Catalog,
    type CatalogBrick,
    compareSemver,
    findBrick,
    type InstalledBrick,
    listUpdates,
    parseCatalog,
} from './resolver.ts';

function validCatalog(bricks: CatalogBrick[] = []): Catalog {
    return {
        $schema: 'https://marketplace.focusmcp.dev/schemas/catalog/v1.json',
        name: 'FocusMCP Marketplace',
        description: 'Official catalog',
        owner: { name: 'FocusMCP contributors' },
        updated: '2026-04-16T00:00:00.000Z',
        bricks,
    };
}

function validBrick(overrides: Partial<CatalogBrick> = {}): CatalogBrick {
    return {
        name: 'echo',
        version: '1.0.0',
        description: 'Hello-world brick',
        dependencies: [],
        tools: [{ name: 'say', description: 'Echo' }],
        source: { type: 'local', path: 'bricks/echo' },
        ...overrides,
    };
}

describe('parseCatalog', () => {
    it('parses a well-formed catalog', () => {
        const catalog = parseCatalog(validCatalog([validBrick()]));
        expect(catalog.name).toBe('FocusMCP Marketplace');
        expect(catalog.bricks).toHaveLength(1);
        expect(catalog.bricks[0]?.name).toBe('echo');
    });

    it('rejects non-objects', () => {
        expect(() => parseCatalog(null)).toThrow(/catalog/i);
        expect(() => parseCatalog('not a catalog')).toThrow(/catalog/i);
        expect(() => parseCatalog(42)).toThrow(/catalog/i);
    });

    it('rejects a catalog missing required top-level fields', () => {
        expect(() => parseCatalog({ bricks: [] })).toThrow(/name/i);
        expect(() => parseCatalog({ name: 'X', bricks: [] })).toThrow(/owner/i);
    });

    it('rejects a catalog where bricks is not an array', () => {
        expect(() =>
            parseCatalog({
                ...validCatalog(),
                bricks: 'nope',
            }),
        ).toThrow(/bricks/i);
    });

    it('rejects a brick with an invalid semver version', () => {
        expect(() => parseCatalog(validCatalog([validBrick({ version: 'not-semver' })]))).toThrow(
            /version/i,
        );
    });

    it('rejects a brick with an invalid kebab-case name', () => {
        expect(() => parseCatalog(validCatalog([validBrick({ name: 'BadName' })]))).toThrow(
            /name/i,
        );
    });

    it('rejects a brick with an invalid source type', () => {
        const bad = { ...validBrick(), source: { type: 'invalid' } } as unknown as CatalogBrick;
        expect(() => parseCatalog(validCatalog([bad]))).toThrow(/source/i);
    });
});

describe('findBrick', () => {
    it('returns the brick matching the name', () => {
        const catalog = validCatalog([validBrick(), validBrick({ name: 'indexer' })]);
        expect(findBrick(catalog, 'indexer')?.name).toBe('indexer');
    });

    it('returns undefined when the brick is not in the catalog', () => {
        const catalog = validCatalog([validBrick()]);
        expect(findBrick(catalog, 'missing')).toBeUndefined();
    });
});

describe('compareSemver', () => {
    it('returns 0 for equal versions', () => {
        expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
    });

    it('returns -1 when a is older than b', () => {
        expect(compareSemver('1.2.3', '1.2.4')).toBe(-1);
        expect(compareSemver('1.2.3', '1.3.0')).toBe(-1);
        expect(compareSemver('1.2.3', '2.0.0')).toBe(-1);
    });

    it('returns 1 when a is newer than b', () => {
        expect(compareSemver('1.2.4', '1.2.3')).toBe(1);
        expect(compareSemver('2.0.0', '1.99.99')).toBe(1);
    });

    it('treats pre-release as older than the same major.minor.patch', () => {
        expect(compareSemver('1.0.0-alpha', '1.0.0')).toBe(-1);
        expect(compareSemver('1.0.0', '1.0.0-alpha')).toBe(1);
    });

    it('compares pre-release identifiers lexically', () => {
        expect(compareSemver('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
        expect(compareSemver('1.0.0-beta', '1.0.0-alpha')).toBe(1);
        expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.2')).toBe(-1);
    });

    it('ignores build metadata when comparing versions', () => {
        expect(compareSemver('1.0.0+build.1', '1.0.0+build.2')).toBe(0);
        expect(compareSemver('1.0.0+build.1', '1.0.0')).toBe(0);
        expect(compareSemver('1.0.0-alpha+x', '1.0.0-alpha+y')).toBe(0);
    });

    it('throws on malformed input', () => {
        expect(() => compareSemver('not-semver', '1.0.0')).toThrow(/semver/i);
        expect(() => compareSemver('1.0', '1.0.0')).toThrow(/semver/i);
        expect(() => compareSemver('1.0.0-alpha.01', '1.0.0-alpha.1')).toThrow(/semver/i);
        expect(() => compareSemver('1.0.0-01', '1.0.0-1')).toThrow(/semver/i);
    });
});

describe('listUpdates', () => {
    it('returns empty when every installed brick is at the catalog version', () => {
        const catalog = validCatalog([validBrick({ version: '1.0.0' })]);
        const installed: InstalledBrick[] = [{ name: 'echo', version: '1.0.0' }];
        expect(listUpdates(installed, catalog)).toEqual([]);
    });

    it('reports an available update when the catalog has a newer version', () => {
        const catalog = validCatalog([validBrick({ version: '1.3.0' })]);
        const installed: InstalledBrick[] = [{ name: 'echo', version: '1.0.0' }];
        expect(listUpdates(installed, catalog)).toEqual([
            { name: 'echo', installed: '1.0.0', available: '1.3.0' },
        ]);
    });

    it('ignores bricks installed locally but missing from the catalog', () => {
        const catalog = validCatalog([validBrick()]);
        const installed: InstalledBrick[] = [{ name: 'ghost', version: '0.1.0' }];
        expect(listUpdates(installed, catalog)).toEqual([]);
    });

    it('ignores catalog bricks that are not installed', () => {
        const catalog = validCatalog([
            validBrick({ version: '1.0.0' }),
            validBrick({ name: 'indexer', version: '2.0.0' }),
        ]);
        const installed: InstalledBrick[] = [{ name: 'echo', version: '1.0.0' }];
        expect(listUpdates(installed, catalog)).toEqual([]);
    });

    it('never reports a downgrade when the installed version is newer', () => {
        const catalog = validCatalog([validBrick({ version: '1.0.0' })]);
        const installed: InstalledBrick[] = [{ name: 'echo', version: '1.5.0' }];
        expect(listUpdates(installed, catalog)).toEqual([]);
    });
});
