// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { Brick } from '../types/brick.ts';
import { permissionProviderFromRegistry } from './permission-provider.ts';
import { InMemoryRegistry } from './registry.ts';

function makeBrick(name: string, dependencies: readonly string[]): Brick {
    return {
        manifest: {
            name,
            version: '1.0.0',
            prefix: name.slice(0, 4),
            description: `${name}`,
            dependencies,
            tools: [],
        },
        start: () => {},
        stop: () => {},
    };
}

describe('permissionProviderFromRegistry', () => {
    it('retourne les dépendances déclarées dans le manifeste', () => {
        const registry = new InMemoryRegistry();
        registry.register(makeBrick('php', ['indexer', 'cache']));
        const provider = permissionProviderFromRegistry(registry);

        expect(provider('php')).toEqual(['indexer', 'cache']);
    });

    it('retourne un tableau vide si la brique est inconnue', () => {
        const registry = new InMemoryRegistry();
        const provider = permissionProviderFromRegistry(registry);

        expect(provider('ghost')).toEqual([]);
    });

    it('reflète les changements live du registry (lecture paresseuse)', () => {
        const registry = new InMemoryRegistry();
        const provider = permissionProviderFromRegistry(registry);

        expect(provider('php')).toEqual([]);
        registry.register(makeBrick('php', ['indexer']));
        expect(provider('php')).toEqual(['indexer']);
        registry.unregister('php');
        expect(provider('php')).toEqual([]);
    });
});
