// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { parseManifest } from '../manifest/manifest.ts';
import type { Brick } from '../types/index.ts';

/**
 * Source abstraite des briques installées. Implémentations possibles :
 * - filesystem (côté Tauri, via commands FS sandboxed)
 * - in-memory / virtual FS (tests, dev)
 * - HTTP (récupération directe depuis le marketplace)
 *
 * Le loader est browser-compatible — c'est l'implémentation de la source
 * qui décide comment accéder au disque/réseau.
 */
export interface BrickSource {
    /** Liste des briques à charger (typiquement issue de center.json). */
    list(): Promise<readonly string[]>;
    /** Manifeste brut (objet JSON), prêt pour `parseManifest`. */
    readManifest(name: string): Promise<unknown>;
    /** Module ESM de la brique. Doit exposer un `default` conforme à `Brick`. */
    loadModule(name: string): Promise<unknown>;
    /**
     * Optional fallback for the manifest `version` field. Bricks published
     * to npm don't embed their version in `mcp-brick.json` — it lives in
     * `package.json` instead. When a source can provide that value here,
     * the loader injects it into both the disk and module manifests
     * before validation, avoiding spurious INVALID_VERSION errors.
     * Returning `undefined` is fine; the loader then falls through to its
     * existing behaviour (which throws INVALID_VERSION).
     */
    readPackageVersion?(name: string): Promise<string | undefined>;
}

export interface BrickLoaderOptions {
    readonly source: BrickSource;
}

export interface BrickLoadFailure {
    readonly name: string;
    readonly error: Error;
}

export interface BrickLoadResult {
    readonly bricks: readonly Brick[];
    readonly failures: readonly BrickLoadFailure[];
}

/**
 * Charge toutes les briques listées par la source. Les échecs n'interrompent
 * pas le chargement : ils sont collectés dans `failures` et le reste continue.
 */
export async function loadBricks(options: BrickLoaderOptions): Promise<BrickLoadResult> {
    const { source } = options;
    const names = await source.list();

    const bricks: Brick[] = [];
    const failures: BrickLoadFailure[] = [];

    for (const name of names) {
        try {
            // If the source provides readPackageVersion() but it throws (e.g.
            // package.json missing), don't fail the brick — fall back to the
            // manifest's own version field if any. The manifest validator
            // will surface INVALID_VERSION later if neither is available.
            let pkgVersion: string | undefined;
            if (source.readPackageVersion) {
                try {
                    pkgVersion = await source.readPackageVersion(name);
                } catch {
                    pkgVersion = undefined;
                }
            }
            const rawSource = await source.readManifest(name);
            const sourceManifest = parseManifest(injectVersion(rawSource, pkgVersion));
            const brick = extractBrick(await source.loadModule(name));
            const moduleManifest = parseManifest(injectVersion(brick.manifest, pkgVersion));

            if (canonicalize(sourceManifest) !== canonicalize(moduleManifest)) {
                throw new Error(
                    `manifest mismatch between source and module for "${sourceManifest.name}"`,
                );
            }

            // Surface the injected version on the returned brick so consumers
            // (e.g. CLI doctor, dashboard, registry) see the resolved version
            // instead of the raw manifest export that may lack it.
            bricks.push({ ...brick, manifest: moduleManifest });
        } catch (cause) {
            failures.push({ name, error: toError(cause) });
        }
    }

    return { bricks, failures };
}

function extractBrick(module: unknown): Brick {
    if (!module || typeof module !== 'object') {
        throw new Error('module is not an object');
    }
    if (!('default' in module)) {
        throw new Error('module has no default export');
    }
    const candidate = (module as { default: unknown }).default;
    if (!candidate || typeof candidate !== 'object') {
        throw new Error('module default export is not an object');
    }
    const brick = candidate as Partial<Brick>;
    if (typeof brick.start !== 'function' || typeof brick.stop !== 'function') {
        throw new Error('default export does not implement the Brick contract');
    }
    return brick as Brick;
}

/** Canonicalize a JSON-shaped value (sort object keys) for stable comparison. */
function canonicalize(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
        return `[${value.map(canonicalize).join(',')}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
        a.localeCompare(b),
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
}

function toError(cause: unknown): Error {
    return cause instanceof Error ? cause : new Error(String(cause));
}

/**
 * If the raw manifest doesn't carry a `version` field, inject `pkgVersion`
 * from the source's package.json. Existing version values are preserved
 * unchanged. Non-object raw values are passed through untouched.
 */
function injectVersion(raw: unknown, pkgVersion: string | undefined): unknown {
    if (pkgVersion === undefined) return raw;
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const obj = raw as Record<string, unknown>;
    if (obj['version'] !== undefined) return raw;
    return { ...obj, version: pkgVersion };
}
