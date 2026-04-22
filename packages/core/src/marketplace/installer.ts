// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * Installer — pure, browser-compatible.
 *
 * Plans and executes install/remove operations for catalog bricks.
 * Does no direct I/O: the host injects an InstallerIO implementation
 * that calls npm and reads/writes the center JSON and lock files.
 */

import { requireBoolean, requireObject, requireString } from './helpers.ts';
import { type CatalogBrick, compareSemver } from './resolver.ts';

export { compareSemver };

export interface InstallerIO {
    npmInstall(pkg: string, version: string, opts?: { registry?: string }): Promise<void>;
    npmUninstall(pkg: string, opts?: { registry?: string }): Promise<void>;
    writeCenterJson(data: CenterJson): Promise<void>;
    writeCenterLock(data: CenterLock): Promise<void>;
    readCenterJson(): Promise<unknown>;
    readCenterLock(): Promise<unknown>;
}

export interface CenterEntry {
    readonly version: string;
    readonly enabled: boolean;
    readonly config?: Record<string, unknown>;
}

export interface CenterLockEntry {
    readonly version: string;
    readonly catalogUrl: string;
    readonly npmPackage: string;
    readonly installedAt: string;
}

export interface CenterJson {
    readonly bricks: Record<string, CenterEntry>;
}

export interface CenterLock {
    readonly bricks: Record<string, CenterLockEntry>;
}

export interface InstallPlan {
    readonly name: string;
    readonly npmPackage: string;
    readonly version: string;
    readonly registry?: string;
    readonly catalogUrl: string;
}

// ---------- parseCenterJson ----------

export function parseCenterJson(raw: unknown): CenterJson {
    const obj = requireObject(raw, 'center.json');
    const bricksRaw = obj['bricks'];
    const bricksObj = requireObject(bricksRaw, 'center.json.bricks');
    const bricks: Record<string, CenterEntry> = {};
    for (const [key, value] of Object.entries(bricksObj)) {
        bricks[key] = parseCenterEntry(value, `center.json.bricks.${key}`);
    }
    return { bricks };
}

function parseCenterEntry(raw: unknown, loc: string): CenterEntry {
    const obj = requireObject(raw, loc);
    const version = requireString(obj, 'version', loc);
    const enabled = requireBoolean(obj, 'enabled', loc);
    const config = optionalRecord(obj, 'config', loc);
    return { version, enabled, ...(config !== undefined ? { config } : {}) };
}

// ---------- parseCenterLock ----------

export function parseCenterLock(raw: unknown): CenterLock {
    const obj = requireObject(raw, 'center.lock');
    const bricksRaw = obj['bricks'];
    const bricksObj = requireObject(bricksRaw, 'center.lock.bricks');
    const bricks: Record<string, CenterLockEntry> = {};
    for (const [key, value] of Object.entries(bricksObj)) {
        bricks[key] = parseLockEntry(value, `center.lock.bricks.${key}`);
    }
    return { bricks };
}

function parseLockEntry(raw: unknown, loc: string): CenterLockEntry {
    const obj = requireObject(raw, loc);
    const version = requireString(obj, 'version', loc);
    const catalogUrl = requireString(obj, 'catalogUrl', loc);
    const npmPackage = requireString(obj, 'npmPackage', loc);
    const installedAt = requireString(obj, 'installedAt', loc);
    return { version, catalogUrl, npmPackage, installedAt };
}

// ---------- serializeCenterJson ----------

export function serializeCenterJson(data: CenterJson): unknown {
    return { bricks: data.bricks };
}

// ---------- serializeCenterLock ----------

export function serializeCenterLock(data: CenterLock): unknown {
    return { bricks: data.bricks };
}

// ---------- planInstall ----------

export function planInstall(brick: CatalogBrick, catalogUrl: string): InstallPlan {
    const source = brick.source;
    if (source.type !== 'npm') {
        throw new Error(
            `Cannot plan npm install for brick "${brick.name}": source type is "${source.type}", expected "npm"`,
        );
    }
    return {
        name: brick.name,
        npmPackage: source.package,
        version: brick.version,
        ...(source.registry !== undefined ? { registry: source.registry } : {}),
        catalogUrl,
    };
}

// ---------- planRemove ----------

export function planRemove(
    name: string,
    centerJson: CenterJson,
    centerLock: CenterLock,
): { readonly npmPackage: string } {
    if (!(name in centerJson.bricks)) {
        throw new Error(`Brick "${name}" is not installed`);
    }
    const lock = centerLock.bricks[name];
    if (lock === undefined) {
        throw new Error(`Lock entry not found for brick "${name}"`);
    }
    return { npmPackage: lock.npmPackage };
}

// ---------- executeInstall ----------

export async function executeInstall(
    io: InstallerIO,
    plan: InstallPlan,
    centerJson: CenterJson,
    centerLock: CenterLock,
    now: string = new Date().toISOString(),
): Promise<void> {
    await io.npmInstall(plan.npmPackage, plan.version, {
        ...(plan.registry !== undefined ? { registry: plan.registry } : {}),
    });

    const newEntry: CenterEntry = { version: plan.version, enabled: true };
    const newLockEntry: CenterLockEntry = {
        version: plan.version,
        catalogUrl: plan.catalogUrl,
        npmPackage: plan.npmPackage,
        installedAt: now,
    };

    const updatedJson: CenterJson = {
        bricks: { ...centerJson.bricks, [plan.name]: newEntry },
    };
    const updatedLock: CenterLock = {
        bricks: { ...centerLock.bricks, [plan.name]: newLockEntry },
    };

    await io.writeCenterJson(updatedJson);
    await io.writeCenterLock(updatedLock);
}

// ---------- executeRemove ----------

export async function executeRemove(
    io: InstallerIO,
    name: string,
    npmPackage: string,
    centerJson: CenterJson,
    centerLock: CenterLock,
): Promise<void> {
    await io.npmUninstall(npmPackage);

    const updatedBricksJson = { ...centerJson.bricks };
    delete updatedBricksJson[name];
    const updatedJson: CenterJson = { bricks: updatedBricksJson };

    const updatedBricksLock = { ...centerLock.bricks };
    delete updatedBricksLock[name];
    const updatedLock: CenterLock = { bricks: updatedBricksLock };

    await io.writeCenterJson(updatedJson);
    await io.writeCenterLock(updatedLock);
}

// ---------- satisfiesRange ----------

/**
 * Checks whether `version` satisfies `range`.
 * Supports: `*` (any), `^` (same major), `~` (same major.minor), exact match.
 * Throws on malformed semver input (delegated to compareSemver).
 */
export function satisfiesRange(version: string, range: string): boolean {
    if (range === '*') return true;

    if (range.startsWith('^')) {
        const target = range.slice(1);
        const cmp = compareSemver(version, target);
        if (cmp === -1) return false;
        const [vMaj] = version.split('.');
        const [tMaj] = target.split('.');
        return vMaj === tMaj;
    }

    if (range.startsWith('~')) {
        const target = range.slice(1);
        const cmp = compareSemver(version, target);
        if (cmp === -1) return false;
        const [vMaj, vMin] = version.split('.');
        const [tMaj, tMin] = target.split('.');
        return vMaj === tMaj && vMin === tMin;
    }

    return compareSemver(version, range) === 0;
}

// ---------- helpers ----------

function optionalRecord(
    obj: Record<string, unknown>,
    key: string,
    parentLoc: string,
): Record<string, unknown> | undefined {
    const value = obj[key];
    if (value === undefined) return undefined;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${parentLoc}.${key} must be an object when provided`);
    }
    return value as Record<string, unknown>;
}
