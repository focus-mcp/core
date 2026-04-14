// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { InProcessEventBus } from '../event-bus/event-bus.ts';
import { createLogger } from '../observability/logger.ts';
import { permissionProviderFromRegistry } from '../registry/permission-provider.ts';
import { InMemoryRegistry } from '../registry/registry.ts';
import { McpRouter } from '../router/router.ts';
import type { EventBus } from '../types/event-bus.ts';
import type { Brick, BrickContext, BrickLogger, EventBusGuards } from '../types/index.ts';
import type { Registry } from '../types/registry.ts';
import type { Router } from '../types/router.ts';

export interface CreateFocusMcpOptions {
  /** Briques à enregistrer au démarrage (l'ordre de démarrage suit les dépendances). */
  readonly bricks?: readonly Brick[];
  /** Garde-fous EventBus. Par défaut : `DEFAULT_GUARDS`. */
  readonly guards?: EventBusGuards;
}

export interface FocusMcp {
  readonly registry: Registry;
  readonly bus: EventBus;
  readonly router: Router;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Assemble les composants du core FocusMCP :
 * Registry + EventBus (permissions branchées sur le manifeste) + Router.
 *
 * Le core ne fait **pas** de transport — il est importé dans Tauri qui s'occupe
 * de l'HTTP (MCP public, UI, admin) via `router.callTool()`.
 *
 * `start()` démarre les briques dans l'ordre des dépendances.
 * `stop()` les arrête dans l'ordre inverse.
 */
export function createFocusMcp(options: CreateFocusMcpOptions = {}): FocusMcp {
  const registry = new InMemoryRegistry();
  for (const brick of options.bricks ?? []) {
    registry.register(brick);
  }

  const permissionProvider = permissionProviderFromRegistry(registry);
  const bus = options.guards
    ? new InProcessEventBus(options.guards, { permissionProvider })
    : new InProcessEventBus(undefined, { permissionProvider });

  const router = new McpRouter({ registry, bus });

  let startedBricks: Brick[] = [];
  let started = false;

  return {
    registry,
    bus,
    router,

    async start(): Promise<void> {
      if (started) throw new Error('FocusMcp already started');
      started = true;

      startedBricks = [];
      const order = resolveStartOrder(registry);
      for (const brick of order) {
        const ctx = buildCtx(bus, brick.manifest.name);
        registry.setStatus(brick.manifest.name, 'starting');
        try {
          await brick.start(ctx);
          registry.setStatus(brick.manifest.name, 'running');
          startedBricks.push(brick);
        } catch (err) {
          registry.setStatus(brick.manifest.name, 'error');
          await rollbackStartedBricks(startedBricks, registry);
          started = false;
          throw err;
        }
      }
    },

    async stop(): Promise<void> {
      if (!started) return;
      for (const brick of [...startedBricks].reverse()) {
        try {
          await brick.stop();
        } catch (err) {
          createLogger('bootstrap').error('brick stop failed', {
            brick: brick.manifest.name,
            err: err instanceof Error ? err.message : String(err),
          });
        }
        registry.setStatus(brick.manifest.name, 'stopped');
      }
      startedBricks = [];
      started = false;
    },
  };
}

function resolveStartOrder(registry: Registry): readonly Brick[] {
  const order: Brick[] = [];
  const seen = new Set<string>();
  for (const brick of registry.getBricks()) {
    for (const dep of registry.resolve(brick.manifest.name)) {
      if (seen.has(dep.manifest.name)) continue;
      seen.add(dep.manifest.name);
      order.push(dep);
    }
  }
  return order;
}

async function rollbackStartedBricks(startedBricks: Brick[], registry: Registry): Promise<void> {
  for (const brick of [...startedBricks].reverse()) {
    try {
      await brick.stop();
    } catch {
      /* ignore rollback errors */
    }
    registry.setStatus(brick.manifest.name, 'stopped');
  }
  startedBricks.length = 0;
}

function buildCtx(bus: EventBus, brickName: string): BrickContext {
  const logger: BrickLogger = createLogger('brick', { brick: brickName });
  return { bus, config: {}, logger };
}
