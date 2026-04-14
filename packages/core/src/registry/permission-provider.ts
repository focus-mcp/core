// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import type { Registry } from '../types/registry.ts';

/**
 * Construit un `permissionProvider` pour l'EventBus à partir du Registry.
 * Lit les dépendances déclarées dans le manifeste de chaque brique, en live.
 */
export function permissionProviderFromRegistry(
  registry: Registry,
): (source: string) => readonly string[] {
  return (source) => registry.getBrick(source)?.manifest.dependencies ?? [];
}
