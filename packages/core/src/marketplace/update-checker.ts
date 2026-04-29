// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * Update checker — pure, Node-only (uses fs/os).
 *
 * Checks if a newer version of @focus-mcp/cli or installed bricks is
 * available on the npm registry or the configured catalog. Results are
 * cached in ~/.focus/update-cache.json and only refreshed after
 * `throttleHours` (default 24h).
 *
 * All I/O is injected via UpdateCheckIO so the module is fully testable.
 */

// ---------- interfaces ----------

export interface UpdateCheckOptions {
    /** Check @focus-mcp/cli against npm registry. */
    includeCli?: boolean;
    /** Check installed bricks against the catalog. */
    includeBricks?: boolean;
    /** Hours to wait before re-checking (default 24). */
    throttleHours?: number;
    /**
     * Current CLI version (injected by caller — npm_package_version is
     * unreliable for globally installed packages).
     */
    cliCurrentVersion?: string;
    /** Injected I/O; defaults to real Node I/O when omitted. */
    io?: UpdateCheckIO;
}

export interface CliUpdateInfo {
    readonly current: string;
    readonly latest: string;
    /** Suggested shell command to run. */
    readonly command: string;
}

export interface BrickUpdateInfo {
    readonly name: string;
    readonly current: string;
    readonly latest: string;
}

export interface UpdateCheckResult {
    readonly cliUpdate?: CliUpdateInfo;
    readonly bricksUpdates?: readonly BrickUpdateInfo[];
    /** True when the result was served from the on-disk cache. */
    readonly fromCache: boolean;
}

// ---------- cache shape ----------

interface BrickCacheEntry {
    /** Latest version available in catalog. */
    latest: string;
    /** Installed version at check time. */
    current: string;
}

interface UpdateCache {
    lastCheckedAt: number;
    cliLatest?: string;
    /** Map of brick name → { latest, current } — only bricks that have updates. */
    bricksLatest?: Record<string, BrickCacheEntry>;
}

// ---------- I/O port ----------

export interface UpdateCheckIO {
    /** Read raw file content; resolve undefined when the file does not exist. */
    readFile(path: string): Promise<string | undefined>;
    /** Write file content (creates parent dirs if needed). */
    writeFile(path: string, content: string): Promise<void>;
    /**
     * Fetch JSON from `url` within `timeoutMs`.
     * Must resolve undefined (not throw) on network error or timeout.
     */
    fetchJson(url: string, timeoutMs: number): Promise<unknown | undefined>;
    /** Returns the path to ~/.focus/ */
    getFocusDir(): string;
    /**
     * Return a list of installed bricks (name → version).
     * Resolve to empty map when center.json is absent.
     */
    getInstalledBricks(): Promise<Record<string, string>>;
    /** Return all enabled catalog URLs (including default). */
    getCatalogUrls(): Promise<readonly string[]>;
}

// ---------- constants ----------

const CACHE_FILE = 'update-cache.json';
const DEFAULT_THROTTLE_HOURS = 24;
const NETWORK_TIMEOUT_MS = 2000;
const CLI_PACKAGE = '@focus-mcp/cli';

// ---------- helpers ----------

function parseCacheFile(raw: string | undefined): UpdateCache | undefined {
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (
            parsed !== null &&
            typeof parsed === 'object' &&
            'lastCheckedAt' in parsed &&
            typeof (parsed as Record<string, unknown>)['lastCheckedAt'] === 'number'
        ) {
            return parsed as UpdateCache;
        }
        return undefined;
    } catch {
        return undefined;
    }
}

function extractLatestVersion(json: unknown): string | undefined {
    if (json !== null && typeof json === 'object' && 'version' in json) {
        const v = (json as Record<string, unknown>)['version'];
        if (typeof v === 'string' && v.length > 0) return v;
    }
    return undefined;
}

/** Returns 1 if a > b, -1 if a < b, 0 if equal. Simple numeric semver compare. */
function compareSemver(a: string, b: string): -1 | 0 | 1 {
    const parse = (s: string): [number, number, number] => {
        const [maj, min, pat] = s.replace(/[^0-9.]/g, '').split('.').map(Number);
        return [maj ?? 0, min ?? 0, pat ?? 0];
    };
    const [aMaj, aMin, aPat] = parse(a);
    const [bMaj, bMin, bPat] = parse(b);
    if (aMaj !== bMaj) return aMaj > bMaj ? 1 : -1;
    if (aMin !== bMin) return aMin > bMin ? 1 : -1;
    if (aPat !== bPat) return aPat > bPat ? 1 : -1;
    return 0;
}

function buildCliCommand(currentVersion: string): string {
    // Detect package manager from env (same heuristic as cli-updater.ts)
    const execPath = process.env['npm_execpath'] ?? '';
    if (execPath.includes('pnpm')) return `pnpm add -g ${CLI_PACKAGE}@latest`;
    if (execPath.includes('yarn')) return `yarn global add ${CLI_PACKAGE}@latest`;
    return `npm install -g ${CLI_PACKAGE}@latest`;
}

// ---------- real I/O implementation ----------

/* v8 ignore next 90 -- Node.js I/O adapter; covered by integration tests, not unit tests */
/** Default Node.js I/O implementation. Lazily imported to keep core browser-safe. */
async function makeNodeIO(): Promise<UpdateCheckIO> {
    const { readFile, writeFile, mkdir } = await import('node:fs/promises');
    const { homedir } = await import('node:os');
    const { join, dirname } = await import('node:path');
    const { createDefaultStore, getEnabledSources, parseCatalogStore } = await import(
        './catalog-store.ts'
    );

    const focusDir = join(homedir(), '.focus');

    return {
        getFocusDir: () => focusDir,

        async readFile(path: string): Promise<string | undefined> {
            try {
                return await readFile(path, 'utf-8');
            } catch {
                return undefined;
            }
        },

        async writeFile(path: string, content: string): Promise<void> {
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, content, 'utf-8');
        },

        async fetchJson(url: string, timeoutMs: number): Promise<unknown | undefined> {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => {
                    controller.abort();
                }, timeoutMs);
                try {
                    const res = await fetch(url, { signal: controller.signal });
                    if (!res.ok) return undefined;
                    return (await res.json()) as unknown;
                } finally {
                    clearTimeout(timer);
                }
            } catch {
                return undefined;
            }
        },

        async getInstalledBricks(): Promise<Record<string, string>> {
            try {
                const raw = await readFile(join(focusDir, 'center.json'), 'utf-8');
                const parsed = JSON.parse(raw) as unknown;
                if (
                    parsed !== null &&
                    typeof parsed === 'object' &&
                    'bricks' in parsed &&
                    typeof (parsed as Record<string, unknown>)['bricks'] === 'object'
                ) {
                    const bricks = (parsed as Record<string, unknown>)['bricks'] as Record<
                        string,
                        unknown
                    >;
                    const result: Record<string, string> = {};
                    for (const [name, entry] of Object.entries(bricks)) {
                        if (
                            entry !== null &&
                            typeof entry === 'object' &&
                            'version' in entry &&
                            typeof (entry as Record<string, unknown>)['version'] === 'string'
                        ) {
                            result[name] = (entry as Record<string, unknown>)['version'] as string;
                        }
                    }
                    return result;
                }
            } catch {
                // center.json absent or invalid — silently ignore
            }
            return {};
        },

        async getCatalogUrls(): Promise<readonly string[]> {
            try {
                const raw = await readFile(join(focusDir, 'catalog-store.json'), 'utf-8');
                const parsed = JSON.parse(raw) as unknown;
                const store = parseCatalogStore(parsed);
                return getEnabledSources(store).map((s) => s.url);
            } catch {
                return getEnabledSources(createDefaultStore()).map((s) => s.url);
            }
        },
    };
}

// ---------- checkForUpdates ----------

/**
 * Check for available updates to @focus-mcp/cli and/or installed bricks.
 *
 * Network errors are swallowed: the function always resolves (never rejects).
 * When throttled, returns the cached result immediately.
 */
export async function checkForUpdates(opts: UpdateCheckOptions = {}): Promise<UpdateCheckResult> {
    const {
        includeCli = false,
        includeBricks = false,
        throttleHours = DEFAULT_THROTTLE_HOURS,
        cliCurrentVersion,
    } = opts;

    const io: UpdateCheckIO = opts.io ?? (await makeNodeIO());
    const cachePath = `${io.getFocusDir()}/${CACHE_FILE}`;

    // --- throttle check ---
    const raw = await io.readFile(cachePath);
    const cache = parseCacheFile(raw);
    const now = Date.now();

    if (cache && now - cache.lastCheckedAt < throttleHours * 3_600_000) {
        // Serve from cache
        return buildResult(
            cache,
            { includeCli, includeBricks, cliCurrentVersion },
            true,
        );
    }

    // --- fetch fresh data ---
    const newCache: UpdateCache = { lastCheckedAt: now };

    if (includeCli) {
        const json = await io.fetchJson(
            `https://registry.npmjs.org/${CLI_PACKAGE}/latest`,
            NETWORK_TIMEOUT_MS,
        );
        const latest = extractLatestVersion(json);
        if (latest) newCache.cliLatest = latest;
    }

    if (includeBricks) {
        const installed = await io.getInstalledBricks();
        const catalogUrls = await io.getCatalogUrls();

        // Fetch all catalogs concurrently (silently ignore failures)
        const catalogResults = await Promise.allSettled(
            catalogUrls.map((url) => io.fetchJson(url, NETWORK_TIMEOUT_MS)),
        );

        // Build a map: brickName → latest version across all catalogs
        const catalogLatest: Record<string, string> = {};
        for (const result of catalogResults) {
            if (result.status !== 'fulfilled' || !result.value) continue;
            const data = result.value;
            if (
                data !== null &&
                typeof data === 'object' &&
                'bricks' in data &&
                Array.isArray((data as Record<string, unknown>)['bricks'])
            ) {
                const bricks = (data as Record<string, unknown>)['bricks'] as unknown[];
                for (const brick of bricks) {
                    if (
                        brick !== null &&
                        typeof brick === 'object' &&
                        'name' in brick &&
                        'version' in brick &&
                        typeof (brick as Record<string, unknown>)['name'] === 'string' &&
                        typeof (brick as Record<string, unknown>)['version'] === 'string'
                    ) {
                        const name = (brick as Record<string, unknown>)['name'] as string;
                        const version = (brick as Record<string, unknown>)['version'] as string;
                        const existing = catalogLatest[name];
                        if (!existing || compareSemver(version, existing) === 1) {
                            catalogLatest[name] = version;
                        }
                    }
                }
            }
        }

        // Only store bricks that actually have an update
        const bricksWithUpdates: Record<string, BrickCacheEntry> = {};
        for (const [name, installedVersion] of Object.entries(installed)) {
            const latest = catalogLatest[name];
            if (latest && compareSemver(latest, installedVersion) === 1) {
                bricksWithUpdates[name] = { latest, current: installedVersion };
            }
        }
        newCache.bricksLatest = bricksWithUpdates;
    }

    // Persist cache (best-effort, never throw)
    try {
        await io.writeFile(cachePath, JSON.stringify(newCache, null, 2));
    } catch {
        // ignore write errors
    }

    return buildResult(newCache, { includeCli, includeBricks, cliCurrentVersion }, false);
}

// ---------- buildResult helper ----------

interface BuildResultOpts {
    readonly includeCli: boolean;
    readonly includeBricks: boolean;
    readonly cliCurrentVersion: string | undefined;
}

function buildResult(
    cache: UpdateCache,
    opts: BuildResultOpts,
    fromCache: boolean,
): UpdateCheckResult {
    const result: UpdateCheckResult = { fromCache };

    if (opts.includeCli && cache.cliLatest && opts.cliCurrentVersion) {
        if (compareSemver(cache.cliLatest, opts.cliCurrentVersion) === 1) {
            (result as { cliUpdate?: CliUpdateInfo }).cliUpdate = {
                current: opts.cliCurrentVersion,
                latest: cache.cliLatest,
                command: buildCliCommand(opts.cliCurrentVersion),
            };
        }
    }

    if (opts.includeBricks && cache.bricksLatest) {
        (result as { bricksUpdates?: readonly BrickUpdateInfo[] }).bricksUpdates = Object.entries(
            cache.bricksLatest,
        ).map(([name, entry]) => ({
            name,
            current: entry.current,
            latest: entry.latest,
        }));
    }

    return result;
}
