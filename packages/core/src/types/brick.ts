// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import type { EventBus } from './event-bus.ts';
import type { BrickManifest } from './manifest.ts';

/**
 * Contrat qu'une brique doit implémenter pour être chargée par FocusMCP.
 */
export interface Brick {
    readonly manifest: BrickManifest;

    /**
     * Cycle de vie : démarrage de la brique. Reçoit l'EventBus filtré
     * (n'expose que les permissions déclarées dans le manifeste).
     */
    start(ctx: BrickContext): Promise<void> | void;

    /** Cycle de vie : arrêt propre de la brique. */
    stop(): Promise<void> | void;
}

export interface BrickContext {
    /** EventBus filtré selon les permissions du manifeste. */
    readonly bus: EventBus;
    /** Configuration résolue de la brique (depuis center.json). */
    readonly config: Readonly<Record<string, unknown>>;
    /** Logger spécifique à la brique. */
    readonly logger: BrickLogger;
}

export interface BrickLogger {
    trace(msg: string, meta?: Record<string, unknown>): void;
    debug(msg: string, meta?: Record<string, unknown>): void;
    info(msg: string, meta?: Record<string, unknown>): void;
    warn(msg: string, meta?: Record<string, unknown>): void;
    error(msg: string, meta?: Record<string, unknown>): void;
}

export type BrickStatus = 'stopped' | 'starting' | 'running' | 'error';
