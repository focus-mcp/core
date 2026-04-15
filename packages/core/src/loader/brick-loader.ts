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
      const manifest = parseManifest(await source.readManifest(name));
      const brick = extractBrick(await source.loadModule(name));

      if (brick.manifest.name !== manifest.name) {
        throw new Error(
          `manifest name mismatch: source declared "${manifest.name}" but module brick is "${brick.manifest.name}"`,
        );
      }

      bricks.push(brick);
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
  const candidate = (module as { default?: unknown }).default;
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('module has no default export');
  }
  const brick = candidate as Partial<Brick>;
  if (!brick.manifest || typeof brick.start !== 'function' || typeof brick.stop !== 'function') {
    throw new Error('default export does not implement the Brick contract');
  }
  return brick as Brick;
}

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
