// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { requireBoolean, requireObject, requireString } from './helpers.ts';

/**
 * Catalog store — pure, browser-compatible.
 *
 * Manages the list of catalog source URLs the user has registered.
 * Does no I/O: the host injects a CatalogStoreIO implementation that
 * reads/writes the persisted store. This module validates, normalises
 * and mutates in-memory state only.
 */

export const DEFAULT_CATALOG_URL = 'https://focus-mcp.github.io/marketplace/catalog.json';

export interface CatalogSource {
    readonly url: string;
    readonly name: string;
    readonly enabled: boolean;
    readonly addedAt: string;
}

export interface CatalogStoreData {
    readonly sources: readonly CatalogSource[];
}

export interface CatalogStoreIO {
    readStore(): Promise<unknown>;
    writeStore(data: CatalogStoreData): Promise<void>;
}

// ---------- createDefaultStore ----------

export function createDefaultStore(): CatalogStoreData {
    return {
        sources: [
            {
                url: DEFAULT_CATALOG_URL,
                name: 'FocusMCP Marketplace',
                enabled: true,
                addedAt: new Date().toISOString(),
            },
        ],
    };
}

// ---------- parseCatalogStore ----------

export function parseCatalogStore(raw: unknown): CatalogStoreData {
    const obj = requireObject(raw, 'store');
    const sourcesRaw = obj['sources'];
    if (!Array.isArray(sourcesRaw)) {
        throw new Error('store.sources must be an array');
    }
    const sources = sourcesRaw.map((s, i) => parseSource(s, i));
    return { sources };
}

function parseSource(raw: unknown, index: number): CatalogSource {
    const loc = `store.sources[${index}]`;
    const obj = requireObject(raw, loc);
    const url = requireString(obj, 'url', loc);
    const name = requireString(obj, 'name', loc);
    const enabled = requireBoolean(obj, 'enabled', loc);
    const addedAt = requireString(obj, 'addedAt', loc);
    return { url, name, enabled, addedAt };
}

// ---------- addSource ----------

export function addSource(
    store: CatalogStoreData,
    url: string,
    name: string,
    now: string = new Date().toISOString(),
): CatalogStoreData {
    if (store.sources.some((s) => s.url === url)) {
        throw new Error(`Catalog source already exists: ${url}`);
    }
    const newSource: CatalogSource = { url, name, enabled: true, addedAt: now };
    return { sources: [...store.sources, newSource] };
}

// ---------- removeSource ----------

export function removeSource(store: CatalogStoreData, url: string): CatalogStoreData {
    if (url === DEFAULT_CATALOG_URL) {
        throw new Error('Cannot remove the default catalog source');
    }
    const filtered = store.sources.filter((s) => s.url !== url);
    if (filtered.length === store.sources.length) {
        throw new Error(`Catalog source not found: ${url}`);
    }
    return { sources: filtered };
}

// ---------- enableSource / disableSource ----------

export function enableSource(store: CatalogStoreData, url: string): CatalogStoreData {
    return setEnabled(store, url, true);
}

export function disableSource(store: CatalogStoreData, url: string): CatalogStoreData {
    return setEnabled(store, url, false);
}

function setEnabled(store: CatalogStoreData, url: string, enabled: boolean): CatalogStoreData {
    const found = store.sources.some((s) => s.url === url);
    if (!found) {
        throw new Error(`Catalog source not found: ${url}`);
    }
    return {
        sources: store.sources.map((s) => (s.url === url ? { ...s, enabled } : s)),
    };
}

// ---------- listSources / getEnabledSources ----------

export function listSources(store: CatalogStoreData): readonly CatalogSource[] {
    return store.sources;
}

export function getEnabledSources(store: CatalogStoreData): readonly CatalogSource[] {
    return store.sources.filter((s) => s.enabled);
}
