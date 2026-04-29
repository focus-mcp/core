// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type UpdateCheckIO, checkForUpdates } from './update-checker.ts';

// ---------- helpers ----------

function makeIO(overrides: Partial<UpdateCheckIO> = {}): UpdateCheckIO {
    return {
        readFile: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
        fetchJson: vi.fn().mockResolvedValue(undefined),
        getFocusDir: vi.fn().mockReturnValue('/home/test/.focus'),
        getInstalledBricks: vi.fn().mockResolvedValue({}),
        getCatalogUrls: vi.fn().mockResolvedValue(['https://example.com/catalog.json']),
        ...overrides,
    };
}

function makeCacheContent(overrides: object = {}): string {
    return JSON.stringify({
        lastCheckedAt: Date.now() - 1000, // 1 second ago → within throttle
        ...overrides,
    });
}

const CATALOG_JSON = {
    name: 'test-catalog',
    owner: { name: 'test' },
    updated: '2026-01-01',
    bricks: [
        { name: 'treesitter', version: '0.6.0', description: '', dependencies: [], tools: [], source: { type: 'npm', package: '@focus-mcp/brick-treesitter' } },
        { name: 'refs', version: '0.4.0', description: '', dependencies: [], tools: [], source: { type: 'npm', package: '@focus-mcp/brick-refs' } },
        { name: 'smartread', version: '0.3.0', description: '', dependencies: [], tools: [], source: { type: 'npm', package: '@focus-mcp/brick-smartread' } },
    ],
};

// ---------- cache hit (throttle) ----------

describe('checkForUpdates — cache hit', () => {
    it('returns fromCache=true when cache is fresh and cli update cached', async () => {
        const io = makeIO({
            readFile: vi.fn().mockResolvedValue(
                makeCacheContent({ cliLatest: '2.1.0' }),
            ),
        });

        const result = await checkForUpdates({
            includeCli: true,
            cliCurrentVersion: '2.0.0',
            throttleHours: 24,
            io,
        });

        expect(result.fromCache).toBe(true);
        expect(result.cliUpdate).toMatchObject({
            current: '2.0.0',
            latest: '2.1.0',
            command: expect.stringContaining('@focus-mcp/cli'),
        });
        // Should NOT have fetched
        expect(io.fetchJson).not.toHaveBeenCalled();
        expect(io.writeFile).not.toHaveBeenCalled();
    });

    it('returns fromCache=true with bricks updates from cache', async () => {
        const io = makeIO({
            readFile: vi.fn().mockResolvedValue(
                makeCacheContent({
                    bricksLatest: {
                        treesitter: { latest: '0.6.0', current: '0.5.1' },
                        refs: { latest: '0.4.0', current: '0.3.2' },
                    },
                }),
            ),
        });

        const result = await checkForUpdates({
            includeBricks: true,
            throttleHours: 24,
            io,
        });

        expect(result.fromCache).toBe(true);
        expect(result.bricksUpdates).toHaveLength(2);
        expect(result.bricksUpdates).toContainEqual({
            name: 'treesitter',
            current: '0.5.1',
            latest: '0.6.0',
        });
        expect(io.fetchJson).not.toHaveBeenCalled();
    });

    it('returns no cli update when cached version is same as current', async () => {
        const io = makeIO({
            readFile: vi.fn().mockResolvedValue(
                makeCacheContent({ cliLatest: '2.0.0' }),
            ),
        });

        const result = await checkForUpdates({
            includeCli: true,
            cliCurrentVersion: '2.0.0',
            io,
        });

        expect(result.fromCache).toBe(true);
        expect(result.cliUpdate).toBeUndefined();
    });
});

// ---------- cache miss (fetch) ----------

describe('checkForUpdates — cache miss', () => {
    it('fetches npm registry when cache is absent', async () => {
        const io = makeIO({
            readFile: vi.fn().mockResolvedValue(undefined),
            fetchJson: vi.fn().mockResolvedValue({ version: '2.1.0' }),
        });

        const result = await checkForUpdates({
            includeCli: true,
            cliCurrentVersion: '2.0.0',
            io,
        });

        expect(result.fromCache).toBe(false);
        expect(result.cliUpdate).toMatchObject({ current: '2.0.0', latest: '2.1.0' });
        expect(io.writeFile).toHaveBeenCalledOnce();
        const [path, content] = (io.writeFile as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
        expect(path).toBe('/home/test/.focus/update-cache.json');
        const cache = JSON.parse(content) as { cliLatest?: string };
        expect(cache.cliLatest).toBe('2.1.0');
    });

    it('fetches catalog and compares installed bricks', async () => {
        const io = makeIO({
            readFile: vi.fn().mockResolvedValue(undefined),
            getInstalledBricks: vi.fn().mockResolvedValue({
                treesitter: '0.5.1',
                refs: '0.3.2',
                smartread: '0.3.0', // already up-to-date (same version in catalog)
            }),
            fetchJson: vi.fn().mockResolvedValue(CATALOG_JSON),
        });

        const result = await checkForUpdates({ includeBricks: true, io });

        expect(result.fromCache).toBe(false);
        expect(result.bricksUpdates).toHaveLength(2);
        const names = result.bricksUpdates?.map((b) => b.name);
        expect(names).toContain('treesitter');
        expect(names).toContain('refs');
        expect(names).not.toContain('smartread');
    });

    it('returns empty bricksUpdates when all bricks are up-to-date', async () => {
        const io = makeIO({
            readFile: vi.fn().mockResolvedValue(undefined),
            getInstalledBricks: vi.fn().mockResolvedValue({
                treesitter: '0.6.0',
                refs: '0.4.0',
            }),
            fetchJson: vi.fn().mockResolvedValue(CATALOG_JSON),
        });

        const result = await checkForUpdates({ includeBricks: true, io });

        expect(result.fromCache).toBe(false);
        expect(result.bricksUpdates).toHaveLength(0);
    });

    it('re-fetches when cache is stale (throttle expired)', async () => {
        const staleCache = JSON.stringify({
            lastCheckedAt: Date.now() - 25 * 3_600_000, // 25 hours ago
            cliLatest: '2.0.0',
        });
        const io = makeIO({
            readFile: vi.fn().mockResolvedValue(staleCache),
            fetchJson: vi.fn().mockResolvedValue({ version: '2.1.0' }),
        });

        const result = await checkForUpdates({
            includeCli: true,
            cliCurrentVersion: '2.0.0',
            throttleHours: 24,
            io,
        });

        expect(result.fromCache).toBe(false);
        expect(result.cliUpdate?.latest).toBe('2.1.0');
        expect(io.fetchJson).toHaveBeenCalled();
    });
});

// ---------- network timeout / failure ----------

describe('checkForUpdates — network failure', () => {
    it('resolves without cliUpdate when fetchJson returns undefined (timeout)', async () => {
        const io = makeIO({
            readFile: vi.fn().mockResolvedValue(undefined),
            fetchJson: vi.fn().mockResolvedValue(undefined), // simulate timeout
        });

        const result = await checkForUpdates({
            includeCli: true,
            cliCurrentVersion: '2.0.0',
            io,
        });

        expect(result.cliUpdate).toBeUndefined();
        expect(result.fromCache).toBe(false);
        // Should still write cache (with no cliLatest)
        expect(io.writeFile).toHaveBeenCalledOnce();
    });

    it('resolves gracefully when catalog fetch fails', async () => {
        const io = makeIO({
            readFile: vi.fn().mockResolvedValue(undefined),
            getInstalledBricks: vi.fn().mockResolvedValue({ treesitter: '0.5.1' }),
            fetchJson: vi.fn().mockResolvedValue(undefined), // all catalogs fail
        });

        const result = await checkForUpdates({ includeBricks: true, io });

        expect(result.bricksUpdates).toHaveLength(0);
        expect(result.fromCache).toBe(false);
    });

    it('does not throw when writeFile fails', async () => {
        const io = makeIO({
            readFile: vi.fn().mockResolvedValue(undefined),
            fetchJson: vi.fn().mockResolvedValue({ version: '2.1.0' }),
            writeFile: vi.fn().mockRejectedValue(new Error('EACCES')),
        });

        // Should not throw
        await expect(
            checkForUpdates({ includeCli: true, cliCurrentVersion: '2.0.0', io }),
        ).resolves.toBeDefined();
    });
});

// ---------- no-op (nothing requested) ----------

describe('checkForUpdates — defaults', () => {
    it('returns empty result when neither includeCli nor includeBricks', async () => {
        const io = makeIO();

        const result = await checkForUpdates({ io });

        expect(result.cliUpdate).toBeUndefined();
        expect(result.bricksUpdates).toBeUndefined();
    });

    it('skips cliUpdate when cliCurrentVersion is not provided', async () => {
        const io = makeIO({
            readFile: vi.fn().mockResolvedValue(undefined),
            fetchJson: vi.fn().mockResolvedValue({ version: '2.1.0' }),
        });

        const result = await checkForUpdates({ includeCli: true, io });

        expect(result.cliUpdate).toBeUndefined();
    });
});

// ---------- multiple catalogs ----------

describe('checkForUpdates — multi-catalog', () => {
    it('picks the highest version across multiple catalogs', async () => {
        const catalog1 = { ...CATALOG_JSON, bricks: [{ name: 'treesitter', version: '0.5.5', description: '', dependencies: [], tools: [], source: { type: 'npm', package: '@focus-mcp/brick-treesitter' } }] };
        const catalog2 = { ...CATALOG_JSON, bricks: [{ name: 'treesitter', version: '0.6.0', description: '', dependencies: [], tools: [], source: { type: 'npm', package: '@focus-mcp/brick-treesitter' } }] };

        const io = makeIO({
            readFile: vi.fn().mockResolvedValue(undefined),
            getInstalledBricks: vi.fn().mockResolvedValue({ treesitter: '0.5.1' }),
            getCatalogUrls: vi.fn().mockResolvedValue([
                'https://catalog1.example.com/catalog.json',
                'https://catalog2.example.com/catalog.json',
            ]),
            fetchJson: vi.fn()
                .mockResolvedValueOnce(catalog1)
                .mockResolvedValueOnce(catalog2),
        });

        const result = await checkForUpdates({ includeBricks: true, io });

        expect(result.bricksUpdates).toHaveLength(1);
        expect(result.bricksUpdates?.[0]).toMatchObject({
            name: 'treesitter',
            current: '0.5.1',
            latest: '0.6.0',
        });
    });

    it('handles partial catalog failure gracefully', async () => {
        const io = makeIO({
            readFile: vi.fn().mockResolvedValue(undefined),
            getInstalledBricks: vi.fn().mockResolvedValue({ treesitter: '0.5.1' }),
            getCatalogUrls: vi.fn().mockResolvedValue([
                'https://ok.example.com/catalog.json',
                'https://fail.example.com/catalog.json',
            ]),
            fetchJson: vi.fn()
                .mockResolvedValueOnce(CATALOG_JSON)
                .mockResolvedValueOnce(undefined), // second catalog fails
        });

        const result = await checkForUpdates({ includeBricks: true, io });

        expect(result.bricksUpdates).toHaveLength(1);
        expect(result.bricksUpdates?.[0]?.name).toBe('treesitter');
    });
});
