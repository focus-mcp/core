// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * Shared validation helpers for marketplace parsers.
 * Pure, browser-compatible — no I/O.
 */

export function requireObject(raw: unknown, loc: string): Record<string, unknown> {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`${loc} must be an object`);
    }
    return raw as Record<string, unknown>;
}

export function requireString(
    obj: Record<string, unknown>,
    key: string,
    parentLoc: string,
): string {
    const value = obj[key];
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${parentLoc}.${key} must be a non-empty string`);
    }
    return value;
}

export function optionalString(
    obj: Record<string, unknown>,
    key: string,
    parentLoc: string,
): string | undefined {
    const value = obj[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'string') {
        throw new Error(`${parentLoc}.${key} must be a string when provided`);
    }
    return value;
}

export function requireArray(
    obj: Record<string, unknown>,
    key: string,
    parentLoc: string,
): readonly unknown[] {
    const value = obj[key];
    if (!Array.isArray(value)) throw new Error(`${parentLoc}.${key} must be an array`);
    return value;
}

export function requireStringArray(
    obj: Record<string, unknown>,
    key: string,
    parentLoc: string,
): readonly string[] {
    const arr = requireArray(obj, key, parentLoc);
    for (const item of arr) {
        if (typeof item !== 'string') {
            throw new Error(`${parentLoc}.${key} must contain only strings`);
        }
    }
    return arr as readonly string[];
}

export function optionalStringArray(
    obj: Record<string, unknown>,
    key: string,
    parentLoc: string,
): readonly string[] | undefined {
    const value = obj[key];
    if (value === undefined) return undefined;
    return requireStringArray(obj, key, parentLoc);
}

export function requireBoolean(
    obj: Record<string, unknown>,
    key: string,
    parentLoc: string,
): boolean {
    const value = obj[key];
    if (typeof value !== 'boolean') {
        throw new Error(`${parentLoc}.${key} must be a boolean`);
    }
    return value;
}
