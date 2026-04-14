// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import {
  type Brick,
  type BrickContext,
  type BrickManifest,
  parseManifest,
  type Unsubscribe,
} from '@focusmcp/core';

export type BrickDefinitionErrorCode = 'MISSING_HANDLER' | 'UNKNOWN_HANDLER' | 'ALREADY_STARTED';

export class BrickDefinitionError extends Error {
  constructor(
    message: string,
    public readonly code: BrickDefinitionErrorCode,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BrickDefinitionError';
  }
}

export type BrickToolHandler<TPayload = unknown, TResult = unknown> = (
  payload: TPayload,
  ctx: BrickContext,
) => TResult | Promise<TResult>;

export interface DefineBrickOptions {
  /** Manifeste déclaratif de la brique (validé via parseManifest). */
  readonly manifest: unknown;
  /** Map tool → handler. La clé doit correspondre à un tool.name du manifeste. */
  readonly handlers: Readonly<Record<string, BrickToolHandler>>;
}

/**
 * Crée une brique FocusMCP à partir d'un manifeste et d'une map de handlers.
 *
 * - Valide le manifeste (parseManifest)
 * - Vérifie la correspondance 1-pour-1 entre tools déclarés et handlers fournis
 * - À `start()`, enregistre chaque handler sur le bus via la convention `<brick>:<tool>`
 * - À `stop()`, désenregistre tous les handlers
 */
export function defineBrick(options: DefineBrickOptions): Brick {
  const manifest = parseManifest(options.manifest);
  assertHandlersMatchTools(manifest, options.handlers);

  let currentCtx: BrickContext | undefined;
  let unsubscribes: Unsubscribe[] = [];

  return {
    manifest,

    start(ctx: BrickContext): void {
      if (currentCtx !== undefined) {
        throw new BrickDefinitionError(
          `Brick "${manifest.name}" is already started`,
          'ALREADY_STARTED',
          { brick: manifest.name },
        );
      }
      currentCtx = ctx;
      unsubscribes = [];
      for (const tool of manifest.tools) {
        const handler = options.handlers[tool.name];
        // Déjà vérifié par assertHandlersMatchTools — cast sûr.
        const bound = handler as BrickToolHandler;
        const unsub = ctx.bus.handle(`${manifest.name}:${tool.name}`, (payload) =>
          bound(payload, ctx),
        );
        unsubscribes.push(unsub);
      }
    },

    stop(): void {
      for (const unsub of unsubscribes) unsub();
      unsubscribes = [];
      currentCtx = undefined;
    },
  };
}

function assertHandlersMatchTools(
  manifest: BrickManifest,
  handlers: Readonly<Record<string, BrickToolHandler>>,
): void {
  const toolNames = new Set(manifest.tools.map((t) => t.name));
  for (const tool of manifest.tools) {
    if (!(tool.name in handlers)) {
      throw new BrickDefinitionError(
        `Brick "${manifest.name}" declares tool "${tool.name}" but no handler is provided`,
        'MISSING_HANDLER',
        { brick: manifest.name, tool: tool.name },
      );
    }
  }
  for (const handlerName of Object.keys(handlers)) {
    if (!toolNames.has(handlerName)) {
      throw new BrickDefinitionError(
        `Brick "${manifest.name}" provides handler "${handlerName}" but no such tool is declared in the manifest`,
        'UNKNOWN_HANDLER',
        { brick: manifest.name, handler: handlerName },
      );
    }
  }
}
