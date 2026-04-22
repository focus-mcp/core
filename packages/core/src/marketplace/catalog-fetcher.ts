// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * Catalog fetcher — pure, browser-compatible.
 *
 * Fetches and aggregates catalogs from multiple sources. Does no
 * direct network I/O: the host injects a FetchIO implementation.
 * Deduplication keeps the entry with the highest semver across
 * catalogs so bricks from different mirrors compose cleanly.
 */

import { type Catalog, type CatalogBrick, compareSemver, parseCatalog } from './resolver.ts';

export interface FetchIO {
    fetchJson(url: string): Promise<unknown>;
}

export interface FetchResult {
    readonly url: string;
    readonly catalog: Catalog;
}

export interface FetchError {
    readonly url: string;
    readonly error: string;
}

export interface AggregatedBrick extends CatalogBrick {
    readonly catalogUrl: string;
    readonly catalogName: string;
}

export interface AggregatedCatalog {
    readonly bricks: readonly AggregatedBrick[];
    readonly errors: readonly FetchError[];
}

// ---------- fetchCatalog ----------

/** Fetches and parses a single catalog. Never throws — returns an error string on failure. */
export async function fetchCatalog(io: FetchIO, url: string): Promise<FetchResult | FetchError> {
    try {
        const raw = await io.fetchJson(url);
        const catalog = parseCatalog(raw);
        return { url, catalog };
    } catch (err) {
        return { url, error: err instanceof Error ? err.message : String(err) };
    }
}

// ---------- fetchAllCatalogs ----------

export async function fetchAllCatalogs(
    io: FetchIO,
    urls: readonly string[],
): Promise<{ readonly results: readonly FetchResult[]; readonly errors: readonly FetchError[] }> {
    const settled = await Promise.allSettled(urls.map((url) => fetchCatalog(io, url)));
    const results: FetchResult[] = [];
    const errors: FetchError[] = [];

    for (const outcome of settled) {
        if (outcome.status === 'rejected') {
            // fetchCatalog itself never rejects, but guard defensively.
            errors.push({ url: 'unknown', error: String(outcome.reason) });
        } else {
            const value = outcome.value;
            if ('catalog' in value) {
                results.push(value);
            } else {
                errors.push(value);
            }
        }
    }

    return { results, errors };
}

// ---------- aggregateCatalogs ----------

/**
 * Merges results from multiple catalogs, keeping only the highest semver
 * for each brick name. Bricks from later results override earlier ones
 * only when their version is strictly greater.
 */
export function aggregateCatalogs(results: readonly FetchResult[]): AggregatedCatalog {
    const map = new Map<string, AggregatedBrick>();
    const errors: FetchError[] = [];

    for (const result of results) {
        for (const brick of result.catalog.bricks) {
            const existing = map.get(brick.name);
            if (existing === undefined) {
                map.set(brick.name, {
                    ...brick,
                    catalogUrl: result.url,
                    catalogName: result.catalog.name,
                });
            } else {
                try {
                    if (compareSemver(brick.version, existing.version) === 1) {
                        map.set(brick.name, {
                            ...brick,
                            catalogUrl: result.url,
                            catalogName: result.catalog.name,
                        });
                    }
                } catch {
                    errors.push({
                        url: result.url,
                        error: `Invalid semver for brick "${brick.name}": ${brick.version}`,
                    });
                }
            }
        }
    }

    return { bricks: Array.from(map.values()), errors };
}

// ---------- searchBricks ----------

export function searchBricks(
    catalog: AggregatedCatalog,
    query: string,
): readonly AggregatedBrick[] {
    const q = query.toLowerCase();
    return catalog.bricks.filter(
        (b) =>
            b.name.toLowerCase().includes(q) ||
            b.description.toLowerCase().includes(q) ||
            (b.tags ?? []).some((t) => t.toLowerCase().includes(q)),
    );
}

// ---------- findBrickAcrossCatalogs ----------

export function findBrickAcrossCatalogs(
    catalog: AggregatedCatalog,
    name: string,
): AggregatedBrick | undefined {
    return catalog.bricks.find((b) => b.name === name);
}
