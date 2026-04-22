// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    type CenterJson,
    type CenterLock,
    executeInstall,
    executeRemove,
    type InstallerIO,
    type InstallPlan,
    parseCenterJson,
    parseCenterLock,
    planInstall,
    planRemove,
    satisfiesRange,
    serializeCenterJson,
    serializeCenterLock,
} from './installer.ts';
import type { CatalogBrick } from './resolver.ts';

// ---------- helpers ----------

/** Extracts the first argument of the first call of a vi.fn() mock. */
function firstCallArg<T>(mock: InstallerIO[keyof InstallerIO]): T {
    const calls = (mock as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    return (calls[0] as unknown[])[0] as T;
}

function makeIO(overrides: Partial<InstallerIO> = {}): InstallerIO {
    return {
        npmInstall: vi.fn().mockResolvedValue(undefined),
        npmUninstall: vi.fn().mockResolvedValue(undefined),
        writeCenterJson: vi.fn().mockResolvedValue(undefined),
        writeCenterLock: vi.fn().mockResolvedValue(undefined),
        readCenterJson: vi.fn().mockResolvedValue({}),
        readCenterLock: vi.fn().mockResolvedValue({}),
        ...overrides,
    };
}

function validCenterJson(overrides: Partial<CenterJson> = {}): CenterJson {
    return {
        bricks: {
            echo: { version: '1.0.0', enabled: true },
        },
        ...overrides,
    };
}

function validCenterLock(overrides: Partial<CenterLock> = {}): CenterLock {
    return {
        bricks: {
            echo: {
                version: '1.0.0',
                catalogUrl: 'https://marketplace.focusmcp.dev/catalog.json',
                npmPackage: '@focusmcp/brick-echo',
                installedAt: '2026-04-01T00:00:00.000Z',
            },
        },
        ...overrides,
    };
}

function validNpmBrick(overrides: Partial<CatalogBrick> = {}): CatalogBrick {
    return {
        name: 'echo',
        version: '1.2.3',
        description: 'Echo brick',
        dependencies: [],
        tools: [{ name: 'say', description: 'Echo text' }],
        source: { type: 'npm', package: '@focusmcp/brick-echo' },
        ...overrides,
    };
}

// ---------- parseCenterJson ----------

describe('parseCenterJson', () => {
    it('parses a well-formed center.json', () => {
        const raw = {
            bricks: {
                echo: { version: '1.0.0', enabled: true },
            },
        };
        const result = parseCenterJson(raw);
        expect(result.bricks['echo']).toEqual({ version: '1.0.0', enabled: true });
    });

    it('parses an entry with an optional config field', () => {
        const raw = {
            bricks: {
                echo: { version: '1.0.0', enabled: false, config: { timeout: 5000 } },
            },
        };
        const result = parseCenterJson(raw);
        expect(result.bricks['echo']?.config).toEqual({ timeout: 5000 });
    });

    it('parses an empty bricks object', () => {
        const result = parseCenterJson({ bricks: {} });
        expect(result.bricks).toEqual({});
    });

    it('rejects non-objects at the root', () => {
        expect(() => parseCenterJson(null)).toThrow(/center\.json/i);
        expect(() => parseCenterJson('string')).toThrow(/center\.json/i);
        expect(() => parseCenterJson(42)).toThrow(/center\.json/i);
        expect(() => parseCenterJson([])).toThrow(/center\.json/i);
    });

    it('rejects when bricks is not an object', () => {
        expect(() => parseCenterJson({ bricks: [] })).toThrow(/bricks/i);
        expect(() => parseCenterJson({ bricks: 'nope' })).toThrow(/bricks/i);
        expect(() => parseCenterJson({ bricks: null })).toThrow(/bricks/i);
    });

    it('rejects a brick entry missing version', () => {
        expect(() => parseCenterJson({ bricks: { echo: { enabled: true } } })).toThrow(/version/i);
    });

    it('rejects a brick entry with an empty version string', () => {
        expect(() => parseCenterJson({ bricks: { echo: { version: '', enabled: true } } })).toThrow(
            /version/i,
        );
    });

    it('rejects a brick entry missing enabled', () => {
        expect(() => parseCenterJson({ bricks: { echo: { version: '1.0.0' } } })).toThrow(
            /enabled/i,
        );
    });

    it('rejects a brick entry where enabled is not a boolean', () => {
        expect(() =>
            parseCenterJson({ bricks: { echo: { version: '1.0.0', enabled: 'yes' } } }),
        ).toThrow(/enabled/i);
    });

    it('rejects a brick entry where config is not an object', () => {
        expect(() =>
            parseCenterJson({
                bricks: { echo: { version: '1.0.0', enabled: true, config: 'bad' } },
            }),
        ).toThrow(/config/i);
    });
});

// ---------- parseCenterLock ----------

describe('parseCenterLock', () => {
    it('parses a well-formed center.lock', () => {
        const raw = {
            bricks: {
                echo: {
                    version: '1.0.0',
                    catalogUrl: 'https://marketplace.focusmcp.dev/catalog.json',
                    npmPackage: '@focusmcp/brick-echo',
                    installedAt: '2026-04-01T00:00:00.000Z',
                },
            },
        };
        const result = parseCenterLock(raw);
        expect(result.bricks['echo']).toEqual(raw.bricks.echo);
    });

    it('parses an empty bricks object', () => {
        const result = parseCenterLock({ bricks: {} });
        expect(result.bricks).toEqual({});
    });

    it('rejects non-objects at the root', () => {
        expect(() => parseCenterLock(null)).toThrow(/center\.lock/i);
        expect(() => parseCenterLock(42)).toThrow(/center\.lock/i);
        expect(() => parseCenterLock([])).toThrow(/center\.lock/i);
    });

    it('rejects when bricks is not an object', () => {
        expect(() => parseCenterLock({ bricks: [] })).toThrow(/bricks/i);
        expect(() => parseCenterLock({ bricks: null })).toThrow(/bricks/i);
    });

    it('rejects a lock entry missing version', () => {
        expect(() =>
            parseCenterLock({
                bricks: {
                    echo: {
                        catalogUrl: 'https://x.example',
                        npmPackage: '@x/y',
                        installedAt: '2026-01-01T00:00:00.000Z',
                    },
                },
            }),
        ).toThrow(/version/i);
    });

    it('rejects a lock entry missing catalogUrl', () => {
        expect(() =>
            parseCenterLock({
                bricks: {
                    echo: {
                        version: '1.0.0',
                        npmPackage: '@x/y',
                        installedAt: '2026-01-01T00:00:00.000Z',
                    },
                },
            }),
        ).toThrow(/catalogUrl/i);
    });

    it('rejects a lock entry missing npmPackage', () => {
        expect(() =>
            parseCenterLock({
                bricks: {
                    echo: {
                        version: '1.0.0',
                        catalogUrl: 'https://x.example',
                        installedAt: '2026-01-01T00:00:00.000Z',
                    },
                },
            }),
        ).toThrow(/npmPackage/i);
    });

    it('rejects a lock entry missing installedAt', () => {
        expect(() =>
            parseCenterLock({
                bricks: {
                    echo: {
                        version: '1.0.0',
                        catalogUrl: 'https://x.example',
                        npmPackage: '@x/y',
                    },
                },
            }),
        ).toThrow(/installedAt/i);
    });
});

// ---------- serializeCenterJson ----------

describe('serializeCenterJson', () => {
    it('roundtrips through parseCenterJson', () => {
        const original = parseCenterJson({
            bricks: {
                echo: { version: '1.0.0', enabled: true },
                indexer: { version: '2.3.4', enabled: false, config: { limit: 100 } },
            },
        });
        const serialized = serializeCenterJson(original);
        const reparsed = parseCenterJson(serialized);
        expect(reparsed).toEqual(original);
    });

    it('returns an object with a bricks key', () => {
        const data: CenterJson = { bricks: { echo: { version: '1.0.0', enabled: true } } };
        const result = serializeCenterJson(data) as Record<string, unknown>;
        expect(result).toHaveProperty('bricks');
        expect((result['bricks'] as Record<string, unknown>)['echo']).toEqual({
            version: '1.0.0',
            enabled: true,
        });
    });

    it('returns an empty bricks object when there are no entries', () => {
        const data: CenterJson = { bricks: {} };
        const result = serializeCenterJson(data) as { bricks: Record<string, unknown> };
        expect(result.bricks).toEqual({});
    });
});

// ---------- serializeCenterLock ----------

describe('serializeCenterLock', () => {
    it('roundtrips through parseCenterLock', () => {
        const raw = {
            bricks: {
                echo: {
                    version: '1.0.0',
                    catalogUrl: 'https://marketplace.focusmcp.dev/catalog.json',
                    npmPackage: '@focusmcp/brick-echo',
                    installedAt: '2026-04-01T00:00:00.000Z',
                },
            },
        };
        const original = parseCenterLock(raw);
        const serialized = serializeCenterLock(original);
        const reparsed = parseCenterLock(serialized);
        expect(reparsed).toEqual(original);
    });

    it('returns an object with a bricks key', () => {
        const data: CenterLock = {
            bricks: {
                echo: {
                    version: '1.0.0',
                    catalogUrl: 'https://x',
                    npmPackage: '@x/y',
                    installedAt: '2026-01-01T00:00:00.000Z',
                },
            },
        };
        const result = serializeCenterLock(data) as Record<string, unknown>;
        expect(result).toHaveProperty('bricks');
    });

    it('returns an empty bricks object when there are no entries', () => {
        const data: CenterLock = { bricks: {} };
        const result = serializeCenterLock(data) as { bricks: Record<string, unknown> };
        expect(result.bricks).toEqual({});
    });
});

// ---------- planInstall ----------

describe('planInstall', () => {
    const catalogUrl = 'https://marketplace.focusmcp.dev/catalog.json';

    it('returns a valid InstallPlan for an npm brick', () => {
        const brick = validNpmBrick();
        const plan = planInstall(brick, catalogUrl);
        expect(plan).toEqual({
            name: 'echo',
            npmPackage: '@focusmcp/brick-echo',
            version: '1.2.3',
            catalogUrl,
        });
    });

    it('includes registry when the source specifies one', () => {
        const brick = validNpmBrick({
            source: {
                type: 'npm',
                package: '@focusmcp/brick-echo',
                registry: 'https://my.registry',
            },
        });
        const plan = planInstall(brick, catalogUrl);
        expect(plan.registry).toBe('https://my.registry');
    });

    it('omits registry when the source does not specify one', () => {
        const brick = validNpmBrick();
        const plan = planInstall(brick, catalogUrl);
        expect(plan).not.toHaveProperty('registry');
    });

    it('throws when the source type is not npm', () => {
        const brick = validNpmBrick({
            source: { type: 'local', path: 'bricks/echo' },
        });
        expect(() => planInstall(brick, catalogUrl)).toThrow(/npm/i);
        expect(() => planInstall(brick, catalogUrl)).toThrow(/echo/i);
    });

    it('throws for url source type', () => {
        const brick = validNpmBrick({
            source: { type: 'url', url: 'https://example.com/brick.tgz' },
        });
        expect(() => planInstall(brick, catalogUrl)).toThrow(/url/i);
    });
});

// ---------- planRemove ----------

describe('planRemove', () => {
    it('returns the npm package for an installed brick', () => {
        const centerJson = validCenterJson();
        const centerLock = validCenterLock();
        const result = planRemove('echo', centerJson, centerLock);
        expect(result.npmPackage).toBe('@focusmcp/brick-echo');
    });

    it('throws when the brick is not in center.json', () => {
        const centerJson = validCenterJson();
        const centerLock = validCenterLock();
        expect(() => planRemove('missing', centerJson, centerLock)).toThrow(/missing/i);
        expect(() => planRemove('missing', centerJson, centerLock)).toThrow(/not installed/i);
    });

    it('throws when the brick is in center.json but has no lock entry', () => {
        const centerJson: CenterJson = {
            bricks: { orphan: { version: '1.0.0', enabled: true } },
        };
        const centerLock: CenterLock = { bricks: {} };
        expect(() => planRemove('orphan', centerJson, centerLock)).toThrow(/orphan/i);
        expect(() => planRemove('orphan', centerJson, centerLock)).toThrow(/lock entry/i);
    });
});

// ---------- executeInstall ----------

describe('executeInstall', () => {
    let io: InstallerIO;
    const now = '2026-04-22T00:00:00.000Z';

    beforeEach(() => {
        io = makeIO();
    });

    it('calls npmInstall with the correct package and version', async () => {
        const plan: InstallPlan = {
            name: 'echo',
            npmPackage: '@focusmcp/brick-echo',
            version: '1.2.3',
            catalogUrl: 'https://marketplace.focusmcp.dev/catalog.json',
        };
        await executeInstall(io, plan, validCenterJson(), validCenterLock(), now);
        expect(io.npmInstall).toHaveBeenCalledWith('@focusmcp/brick-echo', '1.2.3', {});
    });

    it('passes the registry option to npmInstall when provided', async () => {
        const plan: InstallPlan = {
            name: 'echo',
            npmPackage: '@focusmcp/brick-echo',
            version: '1.2.3',
            registry: 'https://my.registry',
            catalogUrl: 'https://marketplace.focusmcp.dev/catalog.json',
        };
        await executeInstall(io, plan, validCenterJson(), validCenterLock(), now);
        expect(io.npmInstall).toHaveBeenCalledWith('@focusmcp/brick-echo', '1.2.3', {
            registry: 'https://my.registry',
        });
    });

    it('writes the updated center.json with the new brick entry', async () => {
        const plan: InstallPlan = {
            name: 'indexer',
            npmPackage: '@focusmcp/brick-indexer',
            version: '2.0.0',
            catalogUrl: 'https://marketplace.focusmcp.dev/catalog.json',
        };
        const centerJson: CenterJson = { bricks: {} };
        const centerLock: CenterLock = { bricks: {} };
        await executeInstall(io, plan, centerJson, centerLock, now);

        const written = firstCallArg<CenterJson>(io.writeCenterJson);
        expect(written.bricks['indexer']).toEqual({ version: '2.0.0', enabled: true });
    });

    it('writes the updated center.lock with the new lock entry', async () => {
        const plan: InstallPlan = {
            name: 'indexer',
            npmPackage: '@focusmcp/brick-indexer',
            version: '2.0.0',
            catalogUrl: 'https://marketplace.focusmcp.dev/catalog.json',
        };
        const centerJson: CenterJson = { bricks: {} };
        const centerLock: CenterLock = { bricks: {} };
        await executeInstall(io, plan, centerJson, centerLock, now);

        const written = firstCallArg<CenterLock>(io.writeCenterLock);
        expect(written.bricks['indexer']).toEqual({
            version: '2.0.0',
            catalogUrl: 'https://marketplace.focusmcp.dev/catalog.json',
            npmPackage: '@focusmcp/brick-indexer',
            installedAt: now,
        });
    });

    it('preserves existing entries when adding a new brick', async () => {
        const plan: InstallPlan = {
            name: 'indexer',
            npmPackage: '@focusmcp/brick-indexer',
            version: '2.0.0',
            catalogUrl: 'https://marketplace.focusmcp.dev/catalog.json',
        };
        await executeInstall(io, plan, validCenterJson(), validCenterLock(), now);

        const writtenJson = firstCallArg<CenterJson>(io.writeCenterJson);
        expect(writtenJson.bricks['echo']).toBeDefined();
        expect(writtenJson.bricks['indexer']).toBeDefined();
    });

    it('calls writeCenterJson before writeCenterLock', async () => {
        const callOrder: string[] = [];
        io = makeIO({
            writeCenterJson: vi.fn().mockImplementation(() => {
                callOrder.push('json');
                return Promise.resolve();
            }),
            writeCenterLock: vi.fn().mockImplementation(() => {
                callOrder.push('lock');
                return Promise.resolve();
            }),
        });
        const plan: InstallPlan = {
            name: 'echo',
            npmPackage: '@focusmcp/brick-echo',
            version: '1.0.0',
            catalogUrl: 'https://marketplace.focusmcp.dev/catalog.json',
        };
        await executeInstall(io, plan, { bricks: {} }, { bricks: {} }, now);
        expect(callOrder).toEqual(['json', 'lock']);
    });

    it('uses the current timestamp when now is not provided', async () => {
        const before = new Date().toISOString();
        const plan: InstallPlan = {
            name: 'echo',
            npmPackage: '@focusmcp/brick-echo',
            version: '1.0.0',
            catalogUrl: 'https://marketplace.focusmcp.dev/catalog.json',
        };
        await executeInstall(io, plan, { bricks: {} }, { bricks: {} });
        const after = new Date().toISOString();

        const written = firstCallArg<CenterLock>(io.writeCenterLock);
        const installedAt = (written.bricks['echo'] as { installedAt: string }).installedAt;
        expect(installedAt >= before).toBe(true);
        expect(installedAt <= after).toBe(true);
    });
});

// ---------- executeRemove ----------

describe('executeRemove', () => {
    let io: InstallerIO;

    beforeEach(() => {
        io = makeIO();
    });

    it('calls npmUninstall with the correct package name', async () => {
        await executeRemove(
            io,
            'echo',
            '@focusmcp/brick-echo',
            validCenterJson(),
            validCenterLock(),
        );
        expect(io.npmUninstall).toHaveBeenCalledWith('@focusmcp/brick-echo');
    });

    it('removes the brick entry from center.json', async () => {
        await executeRemove(
            io,
            'echo',
            '@focusmcp/brick-echo',
            validCenterJson(),
            validCenterLock(),
        );

        const written = firstCallArg<CenterJson>(io.writeCenterJson);
        expect(written.bricks['echo']).toBeUndefined();
    });

    it('removes the brick entry from center.lock', async () => {
        await executeRemove(
            io,
            'echo',
            '@focusmcp/brick-echo',
            validCenterJson(),
            validCenterLock(),
        );

        const written = firstCallArg<CenterLock>(io.writeCenterLock);
        expect(written.bricks['echo']).toBeUndefined();
    });

    it('preserves other bricks when removing one', async () => {
        const centerJson: CenterJson = {
            bricks: {
                echo: { version: '1.0.0', enabled: true },
                indexer: { version: '2.0.0', enabled: true },
            },
        };
        const centerLock: CenterLock = {
            bricks: {
                echo: {
                    version: '1.0.0',
                    catalogUrl: 'https://marketplace.focusmcp.dev/catalog.json',
                    npmPackage: '@focusmcp/brick-echo',
                    installedAt: '2026-04-01T00:00:00.000Z',
                },
                indexer: {
                    version: '2.0.0',
                    catalogUrl: 'https://marketplace.focusmcp.dev/catalog.json',
                    npmPackage: '@focusmcp/brick-indexer',
                    installedAt: '2026-04-02T00:00:00.000Z',
                },
            },
        };
        await executeRemove(io, 'echo', '@focusmcp/brick-echo', centerJson, centerLock);

        const writtenJson = firstCallArg<CenterJson>(io.writeCenterJson);
        expect(writtenJson.bricks['echo']).toBeUndefined();
        expect(writtenJson.bricks['indexer']).toBeDefined();

        const writtenLock = firstCallArg<CenterLock>(io.writeCenterLock);
        expect(writtenLock.bricks['echo']).toBeUndefined();
        expect(writtenLock.bricks['indexer']).toBeDefined();
    });

    it('writes center.json and center.lock exactly once each', async () => {
        await executeRemove(
            io,
            'echo',
            '@focusmcp/brick-echo',
            validCenterJson(),
            validCenterLock(),
        );
        expect(io.writeCenterJson).toHaveBeenCalledTimes(1);
        expect(io.writeCenterLock).toHaveBeenCalledTimes(1);
    });
});

// ---------- satisfiesRange ----------

describe('satisfiesRange', () => {
    describe('wildcard (*)', () => {
        it('matches any version', () => {
            expect(satisfiesRange('1.0.0', '*')).toBe(true);
            expect(satisfiesRange('0.0.1', '*')).toBe(true);
            expect(satisfiesRange('99.99.99', '*')).toBe(true);
            expect(satisfiesRange('1.0.0-alpha', '*')).toBe(true);
        });
    });

    describe('exact match', () => {
        it('returns true for the exact same version', () => {
            expect(satisfiesRange('1.2.3', '1.2.3')).toBe(true);
        });

        it('returns false for different versions', () => {
            expect(satisfiesRange('1.2.3', '1.2.4')).toBe(false);
            expect(satisfiesRange('1.2.3', '1.3.0')).toBe(false);
            expect(satisfiesRange('2.0.0', '1.0.0')).toBe(false);
        });

        it('returns true for equal pre-release versions', () => {
            expect(satisfiesRange('1.0.0-alpha', '1.0.0-alpha')).toBe(true);
        });

        it('returns false for mismatched pre-release identifiers', () => {
            expect(satisfiesRange('1.0.0-alpha', '1.0.0-beta')).toBe(false);
        });
    });

    describe('caret range (^)', () => {
        it('accepts the exact target version', () => {
            expect(satisfiesRange('1.2.3', '^1.2.3')).toBe(true);
        });

        it('accepts a newer patch within the same major', () => {
            expect(satisfiesRange('1.2.4', '^1.2.3')).toBe(true);
            expect(satisfiesRange('1.9.0', '^1.2.3')).toBe(true);
        });

        it('accepts a newer minor within the same major', () => {
            expect(satisfiesRange('1.3.0', '^1.2.3')).toBe(true);
        });

        it('rejects a version older than the target', () => {
            expect(satisfiesRange('1.2.2', '^1.2.3')).toBe(false);
            expect(satisfiesRange('1.1.9', '^1.2.3')).toBe(false);
        });

        it('rejects a version with a different major', () => {
            expect(satisfiesRange('2.0.0', '^1.2.3')).toBe(false);
            expect(satisfiesRange('0.9.0', '^1.0.0')).toBe(false);
        });
    });

    describe('tilde range (~)', () => {
        it('accepts the exact target version', () => {
            expect(satisfiesRange('1.2.3', '~1.2.3')).toBe(true);
        });

        it('accepts a newer patch within the same major.minor', () => {
            expect(satisfiesRange('1.2.4', '~1.2.3')).toBe(true);
            expect(satisfiesRange('1.2.9', '~1.2.3')).toBe(true);
        });

        it('rejects a version with a different minor', () => {
            expect(satisfiesRange('1.3.0', '~1.2.3')).toBe(false);
            expect(satisfiesRange('1.1.9', '~1.2.3')).toBe(false);
        });

        it('rejects a version with a different major', () => {
            expect(satisfiesRange('2.2.3', '~1.2.3')).toBe(false);
        });

        it('rejects a version older than the target', () => {
            expect(satisfiesRange('1.2.2', '~1.2.3')).toBe(false);
        });
    });

    describe('malformed input', () => {
        it('throws on a malformed version', () => {
            expect(() => satisfiesRange('not-semver', '1.0.0')).toThrow(/semver/i);
        });

        it('throws on a malformed caret range target', () => {
            expect(() => satisfiesRange('1.0.0', '^not-semver')).toThrow(/semver/i);
        });

        it('throws on a malformed tilde range target', () => {
            expect(() => satisfiesRange('1.0.0', '~not-semver')).toThrow(/semver/i);
        });
    });
});
