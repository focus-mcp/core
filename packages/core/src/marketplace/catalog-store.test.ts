// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import {
    addSource,
    type CatalogSource,
    type CatalogStoreData,
    createDefaultStore,
    DEFAULT_CATALOG_URL,
    disableSource,
    enableSource,
    getEnabledSources,
    listSources,
    parseCatalogStore,
    removeSource,
} from './catalog-store.ts';

const NOW = '2026-04-22T00:00:00.000Z';
const EXTRA_URL = 'https://example.com/catalog.json';

function makeStore(overrides: Partial<CatalogStoreData> = {}): CatalogStoreData {
    return {
        sources: [
            {
                url: DEFAULT_CATALOG_URL,
                name: 'FocusMCP Marketplace',
                enabled: true,
                addedAt: NOW,
            },
        ],
        ...overrides,
    };
}

function makeSource(overrides: Partial<CatalogSource> = {}): CatalogSource {
    return {
        url: EXTRA_URL,
        name: 'Extra Catalog',
        enabled: true,
        addedAt: NOW,
        ...overrides,
    };
}

// ---------- createDefaultStore ----------

describe('createDefaultStore', () => {
    it('returns a store with one enabled source pointing to the default URL', () => {
        const store = createDefaultStore();
        expect(store.sources).toHaveLength(1);
        expect(store.sources[0]?.url).toBe(DEFAULT_CATALOG_URL);
        expect(store.sources[0]?.enabled).toBe(true);
    });

    it('sets addedAt to the current ISO date', () => {
        const before = Date.now();
        const store = createDefaultStore();
        const after = Date.now();
        const source = store.sources[0];
        if (!source) throw new Error('expected at least one source');
        const addedAt = new Date(source.addedAt).getTime();
        expect(addedAt).toBeGreaterThanOrEqual(before);
        expect(addedAt).toBeLessThanOrEqual(after);
    });
});

// ---------- parseCatalogStore ----------

describe('parseCatalogStore', () => {
    it('parses a valid store object', () => {
        const raw = {
            sources: [{ url: DEFAULT_CATALOG_URL, name: 'FocusMCP', enabled: true, addedAt: NOW }],
        };
        const store = parseCatalogStore(raw);
        expect(store.sources).toHaveLength(1);
        expect(store.sources[0]?.url).toBe(DEFAULT_CATALOG_URL);
    });

    it('parses an empty sources array', () => {
        const store = parseCatalogStore({ sources: [] });
        expect(store.sources).toHaveLength(0);
    });

    it('rejects non-objects', () => {
        expect(() => parseCatalogStore(null)).toThrow(/store/i);
        expect(() => parseCatalogStore('string')).toThrow(/store/i);
        expect(() => parseCatalogStore(42)).toThrow(/store/i);
    });

    it('rejects missing sources array', () => {
        expect(() => parseCatalogStore({})).toThrow(/sources/i);
    });

    it('rejects a source missing url', () => {
        expect(() =>
            parseCatalogStore({
                sources: [{ name: 'X', enabled: true, addedAt: NOW }],
            }),
        ).toThrow(/url/i);
    });

    it('rejects a source missing name', () => {
        expect(() =>
            parseCatalogStore({
                sources: [{ url: DEFAULT_CATALOG_URL, enabled: true, addedAt: NOW }],
            }),
        ).toThrow(/name/i);
    });

    it('rejects a source with non-boolean enabled', () => {
        expect(() =>
            parseCatalogStore({
                sources: [{ url: DEFAULT_CATALOG_URL, name: 'X', enabled: 'yes', addedAt: NOW }],
            }),
        ).toThrow(/enabled/i);
    });
});

// ---------- addSource ----------

describe('addSource', () => {
    it('adds a new source to the store', () => {
        const store = makeStore();
        const updated = addSource(store, EXTRA_URL, 'Extra Catalog', NOW);
        expect(updated.sources).toHaveLength(2);
        expect(updated.sources[1]?.url).toBe(EXTRA_URL);
        expect(updated.sources[1]?.enabled).toBe(true);
        expect(updated.sources[1]?.addedAt).toBe(NOW);
    });

    it('does not mutate the original store', () => {
        const store = makeStore();
        addSource(store, EXTRA_URL, 'Extra', NOW);
        expect(store.sources).toHaveLength(1);
    });

    it('rejects adding a duplicate URL', () => {
        const store = makeStore();
        expect(() => addSource(store, DEFAULT_CATALOG_URL, 'Duplicate', NOW)).toThrow(
            /already exists/i,
        );
    });
});

// ---------- removeSource ----------

describe('removeSource', () => {
    it('removes an existing non-default source', () => {
        const store = makeStore({
            sources: [
                { url: DEFAULT_CATALOG_URL, name: 'FocusMCP', enabled: true, addedAt: NOW },
                makeSource(),
            ],
        });
        const updated = removeSource(store, EXTRA_URL);
        expect(updated.sources).toHaveLength(1);
        expect(updated.sources[0]?.url).toBe(DEFAULT_CATALOG_URL);
    });

    it('does not mutate the original store', () => {
        const store = makeStore({
            sources: [
                { url: DEFAULT_CATALOG_URL, name: 'FocusMCP', enabled: true, addedAt: NOW },
                makeSource(),
            ],
        });
        removeSource(store, EXTRA_URL);
        expect(store.sources).toHaveLength(2);
    });

    it('rejects removing the default catalog URL', () => {
        const store = makeStore();
        expect(() => removeSource(store, DEFAULT_CATALOG_URL)).toThrow(/default/i);
    });

    it('rejects removing a URL that does not exist', () => {
        const store = makeStore();
        expect(() => removeSource(store, 'https://unknown.example.com/catalog.json')).toThrow(
            /not found/i,
        );
    });
});

// ---------- enableSource / disableSource ----------

describe('enableSource', () => {
    it('enables a disabled source', () => {
        const store = makeStore({
            sources: [makeSource({ enabled: false })],
        });
        const updated = enableSource(store, EXTRA_URL);
        expect(updated.sources[0]?.enabled).toBe(true);
    });

    it('is idempotent when already enabled', () => {
        const store = makeStore({ sources: [makeSource({ enabled: true })] });
        const updated = enableSource(store, EXTRA_URL);
        expect(updated.sources[0]?.enabled).toBe(true);
    });

    it('throws when the source does not exist', () => {
        const store = makeStore();
        expect(() => enableSource(store, 'https://ghost.example.com/catalog.json')).toThrow(
            /not found/i,
        );
    });
});

describe('disableSource', () => {
    it('disables an enabled source', () => {
        const store = makeStore({ sources: [makeSource({ enabled: true })] });
        const updated = disableSource(store, EXTRA_URL);
        expect(updated.sources[0]?.enabled).toBe(false);
    });

    it('is idempotent when already disabled', () => {
        const store = makeStore({ sources: [makeSource({ enabled: false })] });
        const updated = disableSource(store, EXTRA_URL);
        expect(updated.sources[0]?.enabled).toBe(false);
    });

    it('throws when the source does not exist', () => {
        const store = makeStore();
        expect(() => disableSource(store, 'https://ghost.example.com/catalog.json')).toThrow(
            /not found/i,
        );
    });
});

// ---------- listSources ----------

describe('listSources', () => {
    it('returns all sources regardless of enabled state', () => {
        const store = makeStore({
            sources: [
                makeSource({ url: 'https://a.example.com/catalog.json', enabled: true }),
                makeSource({ url: 'https://b.example.com/catalog.json', enabled: false }),
            ],
        });
        const sources = listSources(store);
        expect(sources).toHaveLength(2);
    });

    it('returns an empty array when the store has no sources', () => {
        const store = makeStore({ sources: [] });
        expect(listSources(store)).toHaveLength(0);
    });
});

// ---------- getEnabledSources ----------

describe('getEnabledSources', () => {
    it('returns only enabled sources', () => {
        const store = makeStore({
            sources: [
                makeSource({ url: 'https://a.example.com/catalog.json', enabled: true }),
                makeSource({ url: 'https://b.example.com/catalog.json', enabled: false }),
                makeSource({ url: 'https://c.example.com/catalog.json', enabled: true }),
            ],
        });
        const enabled = getEnabledSources(store);
        expect(enabled).toHaveLength(2);
        expect(enabled.every((s) => s.enabled)).toBe(true);
    });

    it('returns an empty array when all sources are disabled', () => {
        const store = makeStore({
            sources: [makeSource({ enabled: false })],
        });
        expect(getEnabledSources(store)).toHaveLength(0);
    });

    it('returns an empty array when the store has no sources', () => {
        const store = makeStore({ sources: [] });
        expect(getEnabledSources(store)).toHaveLength(0);
    });
});
