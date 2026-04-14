// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import type { Brick, BrickStatus } from './brick.ts';
import type { ToolDefinition } from './tool.ts';

/**
 * Annuaire central. Connaît toutes les briques, leurs manifestes,
 * leurs dépendances et leur état.
 */
export interface Registry {
  /** Enregistre une brique. Erreur si le nom est déjà pris. */
  register(brick: Brick): void;

  /** Désenregistre une brique. Erreur si d'autres briques en dépendent. */
  unregister(name: string): void;

  /**
   * Résout l'arbre de dépendances dans l'ordre de démarrage.
   * Détecte les cycles (lance RegistryError CYCLE_DETECTED).
   */
  resolve(name: string): readonly Brick[];

  /** État d'une brique enregistrée. */
  getStatus(name: string): BrickStatus;

  /** Met à jour l'état d'une brique. */
  setStatus(name: string, status: BrickStatus): void;

  /** Liste toutes les briques enregistrées. */
  getBricks(): readonly Brick[];

  /** Brique par son nom (undefined si non enregistrée). */
  getBrick(name: string): Brick | undefined;

  /** Tools agrégés de toutes les briques running. */
  getTools(): readonly ToolDefinition[];

  /** Retourne le nom de la brique qui expose le tool (running ou non). */
  getBrickForTool(toolName: string): string | undefined;
}

export class RegistryError extends Error {
  constructor(
    message: string,
    public readonly code: RegistryErrorCode,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RegistryError';
  }
}

export type RegistryErrorCode =
  | 'BRICK_NOT_FOUND'
  | 'BRICK_ALREADY_REGISTERED'
  | 'CYCLE_DETECTED'
  | 'MISSING_DEPENDENCY'
  | 'DEPENDENT_BRICKS_RUNNING';
