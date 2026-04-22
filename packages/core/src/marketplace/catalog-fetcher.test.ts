// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import {
    type AggregatedBrick,
    type AggregatedCatalog,
    aggregateCatalogs,
    type FetchIO,
    type FetchResult,
    fetchAllCatalogs,
    fetchCatalog,
    findBrickAcrossCatalogs,
    searchBricks,
} from './catalog-fetcher.ts';
import type { Catalog, CatalogBrick } from './resolver.ts';

// ---------- helpers ----------

function validCatalog(overrides: Partial<Catalog> = {}): Catalog {
    return {
        name: 'Test Catalog',
        owner: { name: 'Tester' },
        updated: '2026-04-22T00:00:00.000Z',
        bricks: [],
        ...overrides,
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

function makeFetchIO(map: Record<string, unknown>): FetchIO {
    return {
        fetchJson: async (url: string) => {
            if (url in map) return map[url];
            throw new Error(`Not found: ${url}`);
        },
    };
}

const URL_A = 'https://catalog-a.example.com/catalog.json';
const URL_B = 'https://catalog-b.example.com/catalog.json';

// ---------- fetchCatalog ----------

describe('fetchCatalog', () => {
    it('returns a FetchResult for a valid catalog URL', async () => {
        const catalog = validCatalog({ bricks: [validBrick()] });
        const io = makeFetchIO({ [URL_A]: catalog });
        const result = await fetchCatalog(io, URL_A);
        expect('catalog' in result).toBe(true);
        if ('catalog' in result) {
            expect(result.url).toBe(URL_A);
            expect(result.catalog.bricks).toHaveLength(1);
        }
    });

    it('returns a FetchError when the URL is not reachable', async () => {
        const io = makeFetchIO({});
        const result = await fetchCatalog(io, URL_A);
        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(result.url).toBe(URL_A);
            expect(result.error).toMatch(/not found/i);
        }
    });

    it('returns a FetchError when the JSON is not a valid catalog', async () => {
        const io = makeFetchIO({ [URL_A]: { invalid: true } });
        const result = await fetchCatalog(io, URL_A);
        expect('error' in result).toBe(true);
    });

    it('never throws — even on unexpected errors', async () => {
        const io: FetchIO = {
            fetchJson: async () => {
                throw new TypeError('Network failure');
            },
        };
        await expect(fetchCatalog(io, URL_A)).resolves.toHaveProperty('error');
    });
});

// ---------- fetchAllCatalogs ----------

describe('fetchAllCatalogs', () => {
    it('returns results and errors separately', async () => {
        const catalog = validCatalog();
        const io = makeFetchIO({ [URL_A]: catalog });
        const { results, errors } = await fetchAllCatalogs(io, [URL_A, URL_B]);
        expect(results).toHaveLength(1);
        expect(errors).toHaveLength(1);
    });

    it('handles an empty URL list', async () => {
        const io = makeFetchIO({});
        const { results, errors } = await fetchAllCatalogs(io, []);
        expect(results).toHaveLength(0);
        expect(errors).toHaveLength(0);
    });

    it('returns all results when all URLs are valid', async () => {
        const io = makeFetchIO({
            [URL_A]: validCatalog({ name: 'Catalog A' }),
            [URL_B]: validCatalog({ name: 'Catalog B' }),
        });
        const { results, errors } = await fetchAllCatalogs(io, [URL_A, URL_B]);
        expect(results).toHaveLength(2);
        expect(errors).toHaveLength(0);
    });
});

// ---------- aggregateCatalogs ----------

describe('aggregateCatalogs', () => {
    it('returns an empty brick list when given no results', () => {
        const agg = aggregateCatalogs([]);
        expect(agg.bricks).toHaveLength(0);
    });

    it('merges bricks from multiple catalogs', () => {
        const resultA: FetchResult = {
            url: URL_A,
            catalog: validCatalog({ bricks: [validBrick({ name: 'echo' })] }),
        };
        const resultB: FetchResult = {
            url: URL_B,
            catalog: validCatalog({ bricks: [validBrick({ name: 'indexer' })] }),
        };
        const agg = aggregateCatalogs([resultA, resultB]);
        expect(agg.bricks).toHaveLength(2);
    });

    it('keeps the highest semver when the same brick appears in multiple catalogs', () => {
        const resultA: FetchResult = {
            url: URL_A,
            catalog: validCatalog({ bricks: [validBrick({ name: 'echo', version: '1.0.0' })] }),
        };
        const resultB: FetchResult = {
            url: URL_B,
            catalog: validCatalog({ bricks: [validBrick({ name: 'echo', version: '2.0.0' })] }),
        };
        const agg = aggregateCatalogs([resultA, resultB]);
        expect(agg.bricks).toHaveLength(1);
        expect(agg.bricks[0]?.version).toBe('2.0.0');
        expect(agg.bricks[0]?.catalogUrl).toBe(URL_B);
    });

    it('keeps the first entry when versions are equal', () => {
        const resultA: FetchResult = {
            url: URL_A,
            catalog: validCatalog({ bricks: [validBrick({ name: 'echo', version: '1.0.0' })] }),
        };
        const resultB: FetchResult = {
            url: URL_B,
            catalog: validCatalog({ bricks: [validBrick({ name: 'echo', version: '1.0.0' })] }),
        };
        const agg = aggregateCatalogs([resultA, resultB]);
        expect(agg.bricks).toHaveLength(1);
        expect(agg.bricks[0]?.catalogUrl).toBe(URL_A);
    });

    it('attaches catalogUrl and catalogName to each aggregated brick', () => {
        const result: FetchResult = {
            url: URL_A,
            catalog: validCatalog({ name: 'My Catalog', bricks: [validBrick()] }),
        };
        const agg = aggregateCatalogs([result]);
        const brick = agg.bricks[0] as AggregatedBrick;
        expect(brick.catalogUrl).toBe(URL_A);
        expect(brick.catalogName).toBe('My Catalog');
    });

    it('does not keep a lower version when a higher one was already seen', () => {
        const resultA: FetchResult = {
            url: URL_A,
            catalog: validCatalog({ bricks: [validBrick({ name: 'echo', version: '2.0.0' })] }),
        };
        const resultB: FetchResult = {
            url: URL_B,
            catalog: validCatalog({ bricks: [validBrick({ name: 'echo', version: '1.5.0' })] }),
        };
        const agg = aggregateCatalogs([resultA, resultB]);
        expect(agg.bricks[0]?.version).toBe('2.0.0');
    });
});

// ---------- searchBricks ----------

describe('searchBricks', () => {
    function makeAgg(bricks: AggregatedBrick[]): AggregatedCatalog {
        return { bricks, errors: [] };
    }

    function aggBrick(overrides: Partial<AggregatedBrick> = {}): AggregatedBrick {
        return {
            ...validBrick(),
            catalogUrl: URL_A,
            catalogName: 'Test Catalog',
            ...overrides,
        };
    }

    it('matches by name (case-insensitive)', () => {
        const agg = makeAgg([aggBrick({ name: 'echo' }), aggBrick({ name: 'indexer' })]);
        expect(searchBricks(agg, 'ECHO')).toHaveLength(1);
        expect(searchBricks(agg, 'ECHO')[0]?.name).toBe('echo');
    });

    it('matches by description (case-insensitive)', () => {
        const agg = makeAgg([
            aggBrick({ description: 'Hello world brick' }),
            aggBrick({ name: 'other', description: 'Something else' }),
        ]);
        expect(searchBricks(agg, 'HELLO')).toHaveLength(1);
    });

    it('matches by tag (case-insensitive)', () => {
        const agg = makeAgg([
            aggBrick({ tags: ['Search', 'Filesystem'] }),
            aggBrick({ name: 'other', tags: ['database'] }),
        ]);
        expect(searchBricks(agg, 'filesystem')).toHaveLength(1);
    });

    it('returns empty when no bricks match', () => {
        const agg = makeAgg([aggBrick()]);
        expect(searchBricks(agg, 'zzznomatch')).toHaveLength(0);
    });

    it('returns all bricks when query matches all', () => {
        const agg = makeAgg([aggBrick({ name: 'alpha' }), aggBrick({ name: 'alpha-v2' })]);
        expect(searchBricks(agg, 'alpha')).toHaveLength(2);
    });
});

// ---------- findBrickAcrossCatalogs ----------

describe('findBrickAcrossCatalogs', () => {
    function makeAgg(bricks: AggregatedBrick[]): AggregatedCatalog {
        return { bricks, errors: [] };
    }

    function aggBrick(overrides: Partial<AggregatedBrick> = {}): AggregatedBrick {
        return {
            ...validBrick(),
            catalogUrl: URL_A,
            catalogName: 'Test Catalog',
            ...overrides,
        };
    }

    it('returns the brick when found by exact name', () => {
        const agg = makeAgg([aggBrick({ name: 'echo' }), aggBrick({ name: 'indexer' })]);
        expect(findBrickAcrossCatalogs(agg, 'indexer')?.name).toBe('indexer');
    });

    it('returns undefined when the brick is not found', () => {
        const agg = makeAgg([aggBrick()]);
        expect(findBrickAcrossCatalogs(agg, 'missing')).toBeUndefined();
    });

    it('returns undefined for an empty catalog', () => {
        const agg = makeAgg([]);
        expect(findBrickAcrossCatalogs(agg, 'echo')).toBeUndefined();
    });
});
