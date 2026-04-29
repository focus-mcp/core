// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * Tests covering the makeNodeIO adapter (real Node.js I/O) via vi.mock.
 * These tests call checkForUpdates without injecting `io`, forcing
 * the code path through makeNodeIO.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------- mock node built-ins (hoisted by Vitest) ----------

vi.mock('node:fs/promises', () => ({
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
}));

vi.mock('node:os', () => ({
    homedir: vi.fn().mockReturnValue('/home/testuser'),
}));

// ---------- imports (after mocks) ----------

import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import { checkForUpdates } from './update-checker.ts';

// ---------- helpers ----------

const HOME = '/home/testuser';

function enoent(): Promise<never> {
    return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
}

function setupFsDefaults(): void {
    vi.mocked(os.homedir).mockReturnValue(HOME);
    vi.mocked(fsPromises.readFile).mockImplementation(() => enoent() as unknown as Promise<string>);
    vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);
    vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
}

// ---------- makeNodeIO — getFocusDir ----------

describe('makeNodeIO — getFocusDir', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupFsDefaults();
    });

    it('derives focus dir from os.homedir()', async () => {
        vi.mocked(os.homedir).mockReturnValue('/home/alice');
        // No cache → fresh fetch path; no includeCli/includeBricks → minimal work
        const result = await checkForUpdates({});
        expect(result).toBeDefined();
        expect(result.fromCache).toBe(false);
        expect(os.homedir).toHaveBeenCalled();
        // writeFile must have been called with the path derived from homedir
        const writeCalls = vi.mocked(fsPromises.writeFile).mock.calls;
        expect(writeCalls.length).toBe(1);
        const [writtenPath] = writeCalls[0] as [string, string, string];
        expect(writtenPath).toContain('/home/alice/.focus/');
        expect(writtenPath).toContain('update-cache.json');
    });
});

// ---------- makeNodeIO — readFile ----------

describe('makeNodeIO — readFile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupFsDefaults();
    });

    it('reads cache file and serves from cache when fresh', async () => {
        const cacheContent = JSON.stringify({
            lastCheckedAt: Date.now() - 1000, // 1 second ago — fresh
            cliLatest: '3.0.0',
        });
        vi.mocked(fsPromises.readFile).mockImplementation((path) => {
            const p = path as string;
            if (p.endsWith('update-cache.json')) return Promise.resolve(cacheContent) as never;
            return enoent() as never;
        });

        const result = await checkForUpdates({
            includeCli: true,
            cliCurrentVersion: '2.0.0',
            throttleHours: 24,
        });

        expect(result.fromCache).toBe(true);
        expect(result.cliUpdate?.latest).toBe('3.0.0');
        // Should not have written a new cache
        expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('returns undefined (no cache hit) when file does not exist', async () => {
        // readFile already mocked to ENOENT by setupFsDefaults
        const result = await checkForUpdates({});
        expect(result.fromCache).toBe(false);
        // writeFile called for fresh cache persist
        expect(fsPromises.writeFile).toHaveBeenCalled();
    });
});

// ---------- makeNodeIO — writeFile ----------

describe('makeNodeIO — writeFile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupFsDefaults();
    });

    it('calls mkdir then writeFile when persisting cache', async () => {
        // No cache (ENOENT), no fetch needed (no includeCli/includeBricks)
        await checkForUpdates({});

        expect(fsPromises.mkdir).toHaveBeenCalledWith(
            expect.stringContaining(`${HOME}/.focus`),
            { recursive: true },
        );
        expect(fsPromises.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('update-cache.json'),
            expect.any(String),
            'utf-8',
        );
    });

    it('does not throw when writeFile throws EACCES', async () => {
        vi.mocked(fsPromises.writeFile).mockRejectedValue(
            Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }),
        );

        await expect(checkForUpdates({})).resolves.toBeDefined();
    });

    it('does not throw when mkdir throws', async () => {
        vi.mocked(fsPromises.mkdir).mockRejectedValue(new Error('mkdir failed'));
        vi.mocked(fsPromises.writeFile).mockRejectedValue(new Error('write failed'));

        await expect(checkForUpdates({})).resolves.toBeDefined();
    });
});

// ---------- makeNodeIO — fetchJson ----------

describe('makeNodeIO — fetchJson', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupFsDefaults();
    });

    it('returns parsed JSON and produces cliUpdate when fetch succeeds', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ version: '3.1.0' }),
        } as Response);

        const result = await checkForUpdates({
            includeCli: true,
            cliCurrentVersion: '2.0.0',
        });

        expect(result.cliUpdate?.latest).toBe('3.1.0');
        globalThis.fetch = originalFetch;
    });

    it('returns no cliUpdate when response is not ok', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
        } as Response);

        const result = await checkForUpdates({
            includeCli: true,
            cliCurrentVersion: '2.0.0',
        });

        expect(result.cliUpdate).toBeUndefined();
        globalThis.fetch = originalFetch;
    });

    it('returns no cliUpdate when fetch throws a network error', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

        const result = await checkForUpdates({
            includeCli: true,
            cliCurrentVersion: '2.0.0',
        });

        expect(result.cliUpdate).toBeUndefined();
        globalThis.fetch = originalFetch;
    });

    it('returns no cliUpdate when fetch is aborted (timeout)', async () => {
        const originalFetch = globalThis.fetch;
        // Simulate AbortError (thrown when AbortController.abort() is called)
        globalThis.fetch = vi.fn().mockImplementation(
            (_url: string, opts: RequestInit) =>
                new Promise((_resolve, reject) => {
                    const signal = opts?.signal as AbortSignal | undefined;
                    if (signal) {
                        signal.addEventListener('abort', () =>
                            reject(new DOMException('The operation was aborted.', 'AbortError')),
                        );
                    } else {
                        reject(new DOMException('The operation was aborted.', 'AbortError'));
                    }
                }),
        );

        const result = await checkForUpdates({
            includeCli: true,
            cliCurrentVersion: '2.0.0',
        });

        expect(result.cliUpdate).toBeUndefined();
        globalThis.fetch = originalFetch;
    });
});

// ---------- makeNodeIO — getInstalledBricks ----------

describe('makeNodeIO — getInstalledBricks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupFsDefaults();
    });

    it('reads bricks from center.json and detects updates', async () => {
        const centerJson = JSON.stringify({
            bricks: {
                treesitter: { version: '0.5.1', enabled: true },
                refs: { version: '0.3.2', enabled: true },
            },
        });
        const catalogJson = {
            name: 'test',
            owner: { name: 'test' },
            updated: '2026-01-01',
            bricks: [
                {
                    name: 'treesitter',
                    version: '0.6.0',
                    description: '',
                    dependencies: [],
                    tools: [],
                    source: { type: 'npm', package: '@focus-mcp/brick-treesitter' },
                },
                {
                    name: 'refs',
                    version: '0.4.0',
                    description: '',
                    dependencies: [],
                    tools: [],
                    source: { type: 'npm', package: '@focus-mcp/brick-refs' },
                },
            ],
        };

        vi.mocked(fsPromises.readFile).mockImplementation((path) => {
            const p = path as string;
            if (p.endsWith('center.json')) return Promise.resolve(centerJson) as never;
            return enoent() as never;
        });

        const originalFetch = globalThis.fetch;
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(catalogJson),
        } as Response);

        const result = await checkForUpdates({ includeBricks: true });

        expect(result.bricksUpdates).toHaveLength(2);
        const names = result.bricksUpdates?.map((b) => b.name);
        expect(names).toContain('treesitter');
        expect(names).toContain('refs');

        globalThis.fetch = originalFetch;
    });

    it('returns empty bricks when center.json is absent', async () => {
        // setupFsDefaults already mocks all readFile calls to ENOENT
        const result = await checkForUpdates({ includeBricks: true });
        expect(result.bricksUpdates).toHaveLength(0);
    });

    it('returns empty bricks when center.json contains malformed JSON', async () => {
        vi.mocked(fsPromises.readFile).mockImplementation((path) => {
            const p = path as string;
            if (p.endsWith('center.json')) return Promise.resolve('not valid json {{') as never;
            return enoent() as never;
        });

        const result = await checkForUpdates({ includeBricks: true });
        expect(result.bricksUpdates).toHaveLength(0);
    });

    it('returns empty bricks when center.json has no bricks field', async () => {
        vi.mocked(fsPromises.readFile).mockImplementation((path) => {
            const p = path as string;
            if (p.endsWith('center.json'))
                return Promise.resolve(JSON.stringify({ other: 'data' })) as never;
            return enoent() as never;
        });

        const result = await checkForUpdates({ includeBricks: true });
        expect(result.bricksUpdates).toHaveLength(0);
    });
});

// ---------- makeNodeIO — getCatalogUrls ----------

describe('makeNodeIO — getCatalogUrls', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupFsDefaults();
    });

    it('uses enabled sources from catalog-store.json', async () => {
        const storeJson = JSON.stringify({
            sources: [
                {
                    url: 'https://custom.example.com/catalog.json',
                    name: 'Custom',
                    enabled: true,
                    addedAt: '2026-01-01T00:00:00.000Z',
                },
                {
                    url: 'https://disabled.example.com/catalog.json',
                    name: 'Disabled',
                    enabled: false,
                    addedAt: '2026-01-01T00:00:00.000Z',
                },
            ],
        });

        vi.mocked(fsPromises.readFile).mockImplementation((path) => {
            const p = path as string;
            if (p.endsWith('catalog-store.json')) return Promise.resolve(storeJson) as never;
            return enoent() as never;
        });

        const originalFetch = globalThis.fetch;
        const fetchedUrls: string[] = [];
        globalThis.fetch = vi.fn().mockImplementation((url: string) => {
            fetchedUrls.push(url);
            return Promise.resolve({ ok: false, status: 404 } as Response);
        });

        await checkForUpdates({ includeBricks: true });

        expect(fetchedUrls).toContain('https://custom.example.com/catalog.json');
        expect(fetchedUrls).not.toContain('https://disabled.example.com/catalog.json');

        globalThis.fetch = originalFetch;
    });

    it('falls back to default catalog URL when catalog-store.json is absent', async () => {
        // All reads → ENOENT (setupFsDefaults)
        const originalFetch = globalThis.fetch;
        const fetchedUrls: string[] = [];
        globalThis.fetch = vi.fn().mockImplementation((url: string) => {
            fetchedUrls.push(url);
            return Promise.resolve({ ok: false, status: 404 } as Response);
        });

        await checkForUpdates({ includeBricks: true });

        expect(fetchedUrls.some((u) => u.includes('focus-mcp.github.io'))).toBe(true);

        globalThis.fetch = originalFetch;
    });

    it('falls back to default catalog URL when catalog-store.json is invalid', async () => {
        vi.mocked(fsPromises.readFile).mockImplementation((path) => {
            const p = path as string;
            if (p.endsWith('catalog-store.json'))
                return Promise.resolve('{"sources":"not-an-array"}') as never;
            return enoent() as never;
        });

        const originalFetch = globalThis.fetch;
        const fetchedUrls: string[] = [];
        globalThis.fetch = vi.fn().mockImplementation((url: string) => {
            fetchedUrls.push(url);
            return Promise.resolve({ ok: false, status: 404 } as Response);
        });

        await checkForUpdates({ includeBricks: true });

        expect(fetchedUrls.some((u) => u.includes('focus-mcp.github.io'))).toBe(true);

        globalThis.fetch = originalFetch;
    });
});
