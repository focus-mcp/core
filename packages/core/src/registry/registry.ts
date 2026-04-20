// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import type { Brick, BrickStatus } from '../types/brick.ts';
import { type Registry, RegistryError } from '../types/registry.ts';
import type { ToolDefinition } from '../types/tool.ts';

interface RegistryEntry {
    readonly brick: Brick;
    status: BrickStatus;
}

export class InMemoryRegistry implements Registry {
    readonly #entries = new Map<string, RegistryEntry>();
    /** prefix → brickName */
    readonly #prefixes = new Map<string, string>();

    register(brick: Brick): void {
        const { name, prefix } = brick.manifest;
        if (this.#entries.has(name)) {
            throw new RegistryError(
                `Brick "${name}" is already registered`,
                'BRICK_ALREADY_REGISTERED',
                {
                    name,
                },
            );
        }
        if (this.#prefixes.has(prefix)) {
            const owner = this.#prefixes.get(prefix);
            throw new RegistryError(
                `Prefix "${prefix}" is already used by brick "${owner}"`,
                'DUPLICATE_PREFIX',
                { prefix, owner },
            );
        }
        this.#entries.set(name, { brick, status: 'stopped' });
        this.#prefixes.set(prefix, name);
    }

    unregister(name: string): void {
        const entry = this.#entries.get(name);
        if (!entry) {
            throw new RegistryError(`Brick "${name}" not found`, 'BRICK_NOT_FOUND', { name });
        }
        for (const [otherName, otherEntry] of this.#entries) {
            if (otherName === name) continue;
            if (
                otherEntry.status === 'running' &&
                otherEntry.brick.manifest.dependencies.includes(name)
            ) {
                throw new RegistryError(
                    `Cannot unregister "${name}": "${otherName}" is running and depends on it`,
                    'DEPENDENT_BRICKS_RUNNING',
                    { name, dependent: otherName },
                );
            }
        }
        this.#prefixes.delete(entry.brick.manifest.prefix);
        this.#entries.delete(name);
    }

    resolve(name: string): readonly Brick[] {
        const visited = new Set<string>();
        const visiting = new Set<string>();
        const order: Brick[] = [];

        const visit = (target: string): void => {
            if (visited.has(target)) return;
            if (visiting.has(target)) {
                throw new RegistryError(`Cycle detected involving "${target}"`, 'CYCLE_DETECTED', {
                    name: target,
                });
            }
            const entry = this.#entries.get(target);
            if (!entry) {
                throw new RegistryError(`Missing dependency "${target}"`, 'MISSING_DEPENDENCY', {
                    name: target,
                });
            }
            visiting.add(target);
            for (const dep of entry.brick.manifest.dependencies) {
                visit(dep);
            }
            visiting.delete(target);
            visited.add(target);
            order.push(entry.brick);
        };

        visit(name);
        return order;
    }

    getStatus(name: string): BrickStatus {
        const entry = this.#entries.get(name);
        if (!entry) {
            throw new RegistryError(`Brick "${name}" not found`, 'BRICK_NOT_FOUND', { name });
        }
        return entry.status;
    }

    setStatus(name: string, status: BrickStatus): void {
        const entry = this.#entries.get(name);
        if (!entry) {
            throw new RegistryError(`Brick "${name}" not found`, 'BRICK_NOT_FOUND', { name });
        }
        entry.status = status;
    }

    getBricks(): readonly Brick[] {
        return [...this.#entries.values()].map((entry) => entry.brick);
    }

    getBrick(name: string): Brick | undefined {
        return this.#entries.get(name)?.brick;
    }

    getTools(): readonly ToolDefinition[] {
        const tools: ToolDefinition[] = [];
        for (const entry of this.#entries.values()) {
            if (entry.status === 'running') {
                const { prefix } = entry.brick.manifest;
                for (const tool of entry.brick.manifest.tools) {
                    tools.push({ ...tool, name: `${prefix}_${tool.name}` });
                }
            }
        }
        return tools;
    }

    getBrickForTool(prefixedName: string): string | undefined {
        const underscoreIndex = prefixedName.indexOf('_');
        if (underscoreIndex === -1) return undefined;
        const prefix = prefixedName.slice(0, underscoreIndex);
        const originalName = prefixedName.slice(underscoreIndex + 1);
        const brickName = this.#prefixes.get(prefix);
        if (brickName === undefined) return undefined;
        const entry = this.#entries.get(brickName);
        /* v8 ignore next */
        if (!entry) return undefined;
        const hasTool = entry.brick.manifest.tools.some((t) => t.name === originalName);
        return hasTool ? brickName : undefined;
    }

    getOriginalToolName(prefixedName: string): string | undefined {
        const underscoreIndex = prefixedName.indexOf('_');
        if (underscoreIndex === -1) return undefined;
        const prefix = prefixedName.slice(0, underscoreIndex);
        const originalName = prefixedName.slice(underscoreIndex + 1);
        const brickName = this.#prefixes.get(prefix);
        if (brickName === undefined) return undefined;
        const entry = this.#entries.get(brickName);
        /* v8 ignore next */
        if (!entry) return undefined;
        const hasTool = entry.brick.manifest.tools.some((t) => t.name === originalName);
        return hasTool ? originalName : undefined;
    }
}
