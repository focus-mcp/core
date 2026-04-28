// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * Upgrader — pure, browser-compatible.
 *
 * Plans and executes upgrade operations for catalog bricks.
 * An upgrade is equivalent to remove + install in a single atomic
 * operation per brick, preserving the `enabled` state.
 *
 * Does no direct I/O: the host injects UpgradeIO implementations.
 * All catalog loading dependencies are also injected via UpgradeIO.
 */

import { type AggregatedCatalog, findBrickAcrossCatalogs } from './catalog-fetcher.ts';
import {
    type CenterJson,
    type CenterLock,
    executeInstall,
    executeRemove,
    type InstallerIO,
    parseCenterJson,
    parseCenterLock,
    planInstall,
    planRemove,
} from './installer.ts';
import { compareSemver } from './resolver.ts';

// ---------- interfaces ----------

export interface UpgradeIO {
    readonly installer: InstallerIO;
}

export interface UpgradeItem {
    /** Brick name. */
    readonly brick: string;
    /** Installed version. */
    readonly fromVersion: string;
    /** Available catalog version. */
    readonly toVersion: string;
    /** Action to perform. */
    readonly action: 'upgrade' | 'up-to-date' | 'missing-catalog' | 'not-installed';
}

export interface PlanUpgradeInput {
    /** Aggregated catalog from all enabled sources. */
    readonly catalog: AggregatedCatalog;
    /** Parsed center.json. */
    readonly centerJson: CenterJson;
    /** Parsed center.lock (unused here but kept for symmetry with other planX functions). */
    readonly centerLock: CenterLock;
    /**
     * Brick to check, or undefined / empty string to check all installed bricks.
     * When `all` is true, brickName is ignored.
     */
    readonly brickName?: string;
    /** Check all installed bricks. */
    readonly all?: boolean;
}

export interface ExecuteUpgradeInput {
    /** Brick name to upgrade, or undefined / empty for --all mode. */
    readonly brickName?: string;
    /** Upgrade every brick in center.json. */
    readonly all?: boolean;
    /** Dry-run: list what would be upgraded without acting. */
    readonly check?: boolean;
    /** Aggregated catalog from all enabled sources. */
    readonly catalog: AggregatedCatalog;
    readonly io: UpgradeIO;
}

export interface UpgradeResult {
    readonly upgraded: number;
    readonly upToDate: number;
    readonly failed: number;
    readonly output: string;
}

// ---------- planUpgrade ----------

/**
 * Pure function — no I/O.
 *
 * Computes the upgrade plan for one or all bricks by comparing
 * installed versions (from center.json) against the aggregated catalog.
 *
 * Returns one UpgradeItem per target brick.
 */
export function planUpgrade(input: PlanUpgradeInput): readonly UpgradeItem[] {
    const { catalog, centerJson, brickName, all = false } = input;

    // Determine target brick names
    const targets: readonly string[] =
        all || brickName === undefined || brickName.trim().length === 0
            ? Object.keys(centerJson.bricks)
            : [brickName.trim()];

    return targets.map((name): UpgradeItem => {
        const installed = centerJson.bricks[name];
        if (installed === undefined) {
            return {
                brick: name,
                fromVersion: '',
                toVersion: '',
                action: 'not-installed',
            };
        }

        const catalogBrick = findBrickAcrossCatalogs(catalog, name);
        if (catalogBrick === undefined) {
            return {
                brick: name,
                fromVersion: installed.version,
                toVersion: '',
                action: 'missing-catalog',
            };
        }

        const cmp = compareSemver(catalogBrick.version, installed.version);
        return {
            brick: name,
            fromVersion: installed.version,
            toVersion: catalogBrick.version,
            action: cmp > 0 ? 'upgrade' : 'up-to-date',
        };
    });
}

// ---------- executeUpgrade (single brick) ----------

interface UpgradeOneResult {
    status: 'upgraded' | 'up-to-date' | 'failed' | 'would-upgrade';
    message: string;
}

async function upgradeOne(
    brickName: string,
    catalog: AggregatedCatalog,
    io: UpgradeIO,
    check: boolean,
): Promise<UpgradeOneResult> {
    const rawCenter = await io.installer.readCenterJson();
    const rawLock = await io.installer.readCenterLock();
    const centerJson = parseCenterJson(rawCenter);
    const centerLock = parseCenterLock(rawLock);

    const installed = centerJson.bricks[brickName];
    if (installed === undefined) {
        return {
            status: 'failed',
            message: `"${brickName}" is not installed — use \`focus add ${brickName}\` first.`,
        };
    }

    const catalogBrick = findBrickAcrossCatalogs(catalog, brickName);
    if (catalogBrick === undefined) {
        return {
            status: 'failed',
            message: `"${brickName}": not found in any catalog.`,
        };
    }

    const currentVersion = installed.version;
    const latestVersion = catalogBrick.version;

    const cmp = compareSemver(latestVersion, currentVersion);
    if (cmp <= 0) {
        return {
            status: 'up-to-date',
            message: `${brickName} — already at latest (${currentVersion})`,
        };
    }

    if (check) {
        return {
            status: 'would-upgrade',
            message: `${brickName}: ${currentVersion} → ${latestVersion}`,
        };
    }

    // Preserve `enabled` state before remove
    const wasEnabled = installed.enabled;

    try {
        // Remove old version
        const { npmPackage } = planRemove(brickName, centerJson, centerLock);
        await executeRemove(io.installer, brickName, npmPackage, centerJson, centerLock);

        // Re-read state after remove, then install new version
        const rawCenter2 = await io.installer.readCenterJson();
        const rawLock2 = await io.installer.readCenterLock();
        const centerJson2 = parseCenterJson(rawCenter2);
        const centerLock2 = parseCenterLock(rawLock2);

        const plan = planInstall(catalogBrick, catalogBrick.catalogUrl);
        await executeInstall(io.installer, plan, centerJson2, centerLock2);

        // If brick was disabled, restore disabled state
        if (!wasEnabled) {
            const rawCenter3 = await io.installer.readCenterJson();
            const centerJson3 = parseCenterJson(rawCenter3) as {
                bricks: Record<
                    string,
                    { version: string; enabled: boolean; config?: Record<string, unknown> }
                >;
            };
            const entry3 = centerJson3.bricks[brickName];
            if (entry3 !== undefined) {
                entry3.enabled = false;
                await io.installer.writeCenterJson(
                    centerJson3 as Parameters<InstallerIO['writeCenterJson']>[0],
                );
            }
        }

        return {
            status: 'upgraded',
            message: `${brickName}: ${currentVersion} → ${latestVersion}`,
        };
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return {
            status: 'failed',
            message: `"${brickName}": ${errMsg}`,
        };
    }
}

// ---------- executeUpgrade ----------

/**
 * Upgrade one or all bricks to their latest catalog version.
 *
 * Reuses executeInstall + executeRemove from installer.ts.
 * Preserves the `enabled` state from center.json.
 *
 * Returns a summary with counts and human-readable output.
 */
export async function executeUpgrade({
    brickName,
    all = false,
    check = false,
    catalog,
    io,
}: ExecuteUpgradeInput): Promise<UpgradeResult> {
    // Determine target brick list
    let targets: string[];

    if (all || brickName === undefined || brickName.trim().length === 0) {
        const rawCenter = await io.installer.readCenterJson();
        const centerJson = parseCenterJson(rawCenter);
        targets = Object.keys(centerJson.bricks);
        if (targets.length === 0) {
            return {
                upgraded: 0,
                upToDate: 0,
                failed: 0,
                output: 'No bricks installed.',
            };
        }
    } else {
        targets = [brickName.trim()];
    }

    let upgraded = 0;
    let upToDate = 0;
    let failed = 0;
    const lines: string[] = [];

    for (const target of targets) {
        const result = await upgradeOne(target, catalog, io, check);
        lines.push(result.message);
        if (result.status === 'upgraded') upgraded++;
        else if (result.status === 'up-to-date') upToDate++;
        else if (result.status === 'would-upgrade')
            upgraded++; // counts as "would upgrade"
        else failed++;
    }

    const summary = check
        ? `${upgraded} would upgrade, ${upToDate} up-to-date, ${failed} failed`
        : `${upgraded} upgraded, ${upToDate} up-to-date, ${failed} failed`;

    lines.push('');
    lines.push(summary);

    return { upgraded, upToDate, failed, output: lines.join('\n') };
}
