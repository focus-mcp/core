// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from 'vitest';
import type { AggregatedCatalog } from './catalog-fetcher.ts';
import type { CenterJson, CenterLock, InstallerIO } from './installer.ts';
import {
    type ExecuteUpgradeInput,
    executeUpgrade,
    type PlanUpgradeInput,
    planUpgrade,
    type UpgradeIO,
} from './upgrader.ts';

// ---------- helpers ----------

function makeInstallerIO(overrides: Partial<InstallerIO> = {}): InstallerIO {
    return {
        npmInstall: vi.fn().mockResolvedValue(undefined),
        npmUninstall: vi.fn().mockResolvedValue(undefined),
        writeCenterJson: vi.fn().mockResolvedValue(undefined),
        writeCenterLock: vi.fn().mockResolvedValue(undefined),
        readCenterJson: vi.fn().mockResolvedValue({ bricks: {} }),
        readCenterLock: vi.fn().mockResolvedValue({ bricks: {} }),
        ...overrides,
    };
}

function makeIO(installerOverrides: Partial<InstallerIO> = {}): UpgradeIO {
    return { installer: makeInstallerIO(installerOverrides) };
}

function makeCenterJson(
    bricks: Record<string, { version: string; enabled: boolean }> = {},
): CenterJson {
    return { bricks };
}

function makeCenterLock(
    bricks: Record<
        string,
        { version: string; catalogUrl: string; npmPackage: string; installedAt: string }
    > = {},
): CenterLock {
    return { bricks };
}

function makeAggregatedCatalog(
    bricks: Array<{ name: string; version: string; npmPackage?: string }> = [],
): AggregatedCatalog {
    return {
        bricks: bricks.map((b) => ({
            name: b.name,
            version: b.version,
            description: `${b.name} brick`,
            dependencies: [],
            tools: [],
            source: { type: 'npm' as const, package: b.npmPackage ?? `@focus-mcp/brick-${b.name}` },
            catalogUrl: 'https://marketplace.focusmcp.dev/catalog.json',
            catalogName: 'FocusMCP Marketplace',
        })),
        errors: [],
    };
}

// ---------- planUpgrade ----------

describe('planUpgrade', () => {
    it('returns up-to-date for a brick already at latest version', () => {
        const input: PlanUpgradeInput = {
            catalog: makeAggregatedCatalog([{ name: 'echo', version: '1.0.0' }]),
            centerJson: makeCenterJson({ echo: { version: '1.0.0', enabled: true } }),
            centerLock: makeCenterLock(),
            brickName: 'echo',
        };

        const result = planUpgrade(input);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            brick: 'echo',
            fromVersion: '1.0.0',
            toVersion: '1.0.0',
            action: 'up-to-date',
        });
    });

    it('returns upgrade for a brick with a newer catalog version', () => {
        const input: PlanUpgradeInput = {
            catalog: makeAggregatedCatalog([{ name: 'echo', version: '2.0.0' }]),
            centerJson: makeCenterJson({ echo: { version: '1.0.0', enabled: true } }),
            centerLock: makeCenterLock(),
            brickName: 'echo',
        };

        const result = planUpgrade(input);

        expect(result[0]).toMatchObject({
            brick: 'echo',
            fromVersion: '1.0.0',
            toVersion: '2.0.0',
            action: 'upgrade',
        });
    });

    it('returns missing-catalog when brick is not in catalog', () => {
        const input: PlanUpgradeInput = {
            catalog: makeAggregatedCatalog([]),
            centerJson: makeCenterJson({ echo: { version: '1.0.0', enabled: true } }),
            centerLock: makeCenterLock(),
            brickName: 'echo',
        };

        const result = planUpgrade(input);

        expect(result[0]).toMatchObject({
            brick: 'echo',
            fromVersion: '1.0.0',
            action: 'missing-catalog',
        });
    });

    it('returns not-installed when brick is not in center.json', () => {
        const input: PlanUpgradeInput = {
            catalog: makeAggregatedCatalog([{ name: 'echo', version: '1.0.0' }]),
            centerJson: makeCenterJson({}),
            centerLock: makeCenterLock(),
            brickName: 'echo',
        };

        const result = planUpgrade(input);

        expect(result[0]).toMatchObject({
            brick: 'echo',
            fromVersion: '',
            action: 'not-installed',
        });
    });

    it('checks all installed bricks in --all mode', () => {
        const input: PlanUpgradeInput = {
            catalog: makeAggregatedCatalog([
                { name: 'echo', version: '2.0.0' },
                { name: 'git', version: '1.0.0' },
            ]),
            centerJson: makeCenterJson({
                echo: { version: '1.0.0', enabled: true },
                git: { version: '1.0.0', enabled: false },
            }),
            centerLock: makeCenterLock(),
            all: true,
        };

        const result = planUpgrade(input);

        expect(result).toHaveLength(2);
        expect(result.find((r) => r.brick === 'echo')?.action).toBe('upgrade');
        expect(result.find((r) => r.brick === 'git')?.action).toBe('up-to-date');
    });

    it('treats undefined brickName as --all mode', () => {
        const input: PlanUpgradeInput = {
            catalog: makeAggregatedCatalog([{ name: 'echo', version: '1.5.0' }]),
            centerJson: makeCenterJson({ echo: { version: '1.0.0', enabled: true } }),
            centerLock: makeCenterLock(),
        };

        const result = planUpgrade(input);

        expect(result).toHaveLength(1);
        expect(result[0]?.action).toBe('upgrade');
    });

    it('returns empty array when no bricks are installed in --all mode', () => {
        const input: PlanUpgradeInput = {
            catalog: makeAggregatedCatalog([]),
            centerJson: makeCenterJson({}),
            centerLock: makeCenterLock(),
            all: true,
        };

        const result = planUpgrade(input);

        expect(result).toHaveLength(0);
    });
});

// ---------- executeUpgrade ----------

describe('executeUpgrade', () => {
    const echoLockEntry = {
        version: '1.0.0',
        catalogUrl: 'https://marketplace.focusmcp.dev/catalog.json',
        npmPackage: '@focus-mcp/brick-echo',
        installedAt: '2026-04-01T00:00:00.000Z',
    };

    it('happy path: upgrades a single brick', async () => {
        let callCount = 0;
        const centerJsonStates = [
            { bricks: { echo: { version: '1.0.0', enabled: true } } },
            { bricks: {} }, // after remove
            { bricks: { echo: { version: '2.0.0', enabled: true } } }, // after install
        ];
        const centerLockStates = [
            { bricks: { echo: echoLockEntry } },
            { bricks: {} }, // after remove
        ];

        const io = makeIO({
            readCenterJson: vi.fn().mockImplementation(async () => {
                const idx = Math.min(callCount, centerJsonStates.length - 1);
                callCount++;
                return centerJsonStates[idx];
            }),
            readCenterLock: vi.fn().mockImplementation(async () => {
                const idx = Math.min(
                    centerLockStates.length > 0 ? callCount - 1 : 0,
                    centerLockStates.length - 1,
                );
                return centerLockStates[idx];
            }),
        });

        const input: ExecuteUpgradeInput = {
            brickName: 'echo',
            catalog: makeAggregatedCatalog([{ name: 'echo', version: '2.0.0' }]),
            io,
        };

        const result = await executeUpgrade(input);

        expect(result.upgraded).toBe(1);
        expect(result.upToDate).toBe(0);
        expect(result.failed).toBe(0);
        expect(result.output).toContain('1.0.0 → 2.0.0');
        expect(io.installer.npmUninstall).toHaveBeenCalledWith('@focus-mcp/brick-echo');
        expect(io.installer.npmInstall).toHaveBeenCalledWith(
            '@focus-mcp/brick-echo',
            '2.0.0',
            expect.objectContaining({}),
        );
    });

    it('--check dry-run: reports would-upgrade without making changes', async () => {
        const io = makeIO({
            readCenterJson: vi.fn().mockResolvedValue({
                bricks: { echo: { version: '1.0.0', enabled: true } },
            }),
            readCenterLock: vi.fn().mockResolvedValue({
                bricks: { echo: echoLockEntry },
            }),
        });

        const input: ExecuteUpgradeInput = {
            brickName: 'echo',
            check: true,
            catalog: makeAggregatedCatalog([{ name: 'echo', version: '2.0.0' }]),
            io,
        };

        const result = await executeUpgrade(input);

        expect(result.upgraded).toBe(1); // counts as would-upgrade
        expect(result.failed).toBe(0);
        expect(result.output).toContain('1.0.0 → 2.0.0');
        expect(io.installer.npmUninstall).not.toHaveBeenCalled();
        expect(io.installer.npmInstall).not.toHaveBeenCalled();
    });

    it('reports failure when brick is not installed', async () => {
        const io = makeIO({
            readCenterJson: vi.fn().mockResolvedValue({ bricks: {} }),
            readCenterLock: vi.fn().mockResolvedValue({ bricks: {} }),
        });

        const input: ExecuteUpgradeInput = {
            brickName: 'echo',
            catalog: makeAggregatedCatalog([{ name: 'echo', version: '2.0.0' }]),
            io,
        };

        const result = await executeUpgrade(input);

        expect(result.failed).toBe(1);
        expect(result.upgraded).toBe(0);
        expect(result.output).toContain('not installed');
    });

    it('returns early when no bricks installed in --all mode', async () => {
        const io = makeIO({
            readCenterJson: vi.fn().mockResolvedValue({ bricks: {} }),
        });

        const input: ExecuteUpgradeInput = {
            all: true,
            catalog: makeAggregatedCatalog([]),
            io,
        };

        const result = await executeUpgrade(input);

        expect(result.output).toBe('No bricks installed.');
        expect(result.upgraded).toBe(0);
        expect(io.installer.npmInstall).not.toHaveBeenCalled();
    });

    it('preserves disabled state after upgrade', async () => {
        let readJsonCall = 0;
        const centerJsonStates = [
            { bricks: { echo: { version: '1.0.0', enabled: false } } }, // initial check
            { bricks: {} }, // after remove
            { bricks: { echo: { version: '2.0.0', enabled: true } } }, // after install
            { bricks: { echo: { version: '2.0.0', enabled: true } } }, // before restore disabled
        ];

        const io = makeIO({
            readCenterJson: vi.fn().mockImplementation(async () => {
                return centerJsonStates[Math.min(readJsonCall++, centerJsonStates.length - 1)];
            }),
            readCenterLock: vi.fn().mockResolvedValue({
                bricks: { echo: echoLockEntry },
            }),
        });

        const input: ExecuteUpgradeInput = {
            brickName: 'echo',
            catalog: makeAggregatedCatalog([{ name: 'echo', version: '2.0.0' }]),
            io,
        };

        await executeUpgrade(input);

        // writeCenterJson should be called to restore enabled: false
        const writeCalls = (io.installer.writeCenterJson as ReturnType<typeof vi.fn>).mock.calls;
        const lastWrite = writeCalls[writeCalls.length - 1]?.[0] as CenterJson | undefined;
        expect(lastWrite?.bricks['echo']?.enabled).toBe(false);
    });
});
