// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import type { Options } from 'tsup';

/**
 * Preset tsup partagé par tous les packages.
 * Build ESM-only, types, sourcemaps, target Node 22.
 */
export function focusTsupPreset(overrides: Partial<Options> = {}): Options {
  return {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'node22',
    platform: 'node',
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    minify: false,
    outDir: 'dist',
    ...overrides,
  };
}
