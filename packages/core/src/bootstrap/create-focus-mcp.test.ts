// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { Brick, Unsubscribe } from '../types/index.ts';
import { createFocusMcp } from './create-focus-mcp.ts';

function brick(
  name: string,
  deps: readonly string[],
  toolName: string,
  handler: (payload: unknown) => unknown,
): Brick {
  let unsubs: Unsubscribe[] = [];
  return {
    manifest: {
      name,
      version: '1.0.0',
      description: name,
      dependencies: deps,
      tools: [{ name: toolName, description: 'x', inputSchema: { type: 'object' } }],
    },
    start(ctx): void {
      unsubs.push(ctx.bus.handle(`${name}:${toolName}`, handler));
    },
    stop(): void {
      for (const u of unsubs) u();
      unsubs = [];
    },
  };
}

describe('createFocusMcp — assembly', () => {
  it('expose registry, bus, router immédiatement', () => {
    const app = createFocusMcp();
    expect(app.registry).toBeDefined();
    expect(app.bus).toBeDefined();
    expect(app.router).toBeDefined();
  });

  it('enregistre les briques passées dans options.bricks', () => {
    const app = createFocusMcp({
      bricks: [brick('indexer', [], 'indexer_search', () => 'ok')],
    });
    expect(app.registry.getBrick('indexer')).toBeDefined();
  });
});

describe('createFocusMcp — lifecycle', () => {
  it('start() passe les briques en running', async () => {
    const app = createFocusMcp({
      bricks: [brick('maths', [], 'maths_add', () => ({ ok: true }))],
    });
    await app.start();
    expect(app.registry.getStatus('maths')).toBe('running');
    await app.stop();
  });

  it('start() démarre les briques dans l’ordre des dépendances', async () => {
    const starts: string[] = [];
    const recording = (name: string, deps: readonly string[]): Brick => ({
      manifest: { name, version: '1.0.0', description: name, dependencies: deps, tools: [] },
      start(): void {
        starts.push(name);
      },
      stop(): void {},
    });

    const app = createFocusMcp({
      bricks: [
        recording('php', ['indexer']),
        recording('indexer', []),
        recording('symfony', ['php']),
      ],
    });

    await app.start();
    expect(starts).toEqual(['indexer', 'php', 'symfony']);
    await app.stop();
  });

  it('expose les tools des briques running via le Router', async () => {
    const app = createFocusMcp({
      bricks: [
        brick('maths', [], 'maths_add', () => ({ content: [{ type: 'text', text: '42' }] })),
      ],
    });
    await app.start();

    const names = app.router.listTools().map((t) => t.name);
    expect(names).toEqual(['maths_add']);

    const result = await app.router.callTool('maths_add', {});
    expect(result.content[0]).toEqual({ type: 'text', text: '42' });

    await app.stop();
  });

  it('stop() passe les briques en stopped', async () => {
    const app = createFocusMcp({
      bricks: [brick('maths', [], 'maths_add', () => 'ok')],
    });
    await app.start();
    await app.stop();
    expect(app.registry.getStatus('maths')).toBe('stopped');
  });
});

describe('createFocusMcp — permissions', () => {
  it('applique les permissions manifeste : appel hors deps → PERMISSION_DENIED', async () => {
    let unsubs: Unsubscribe[] = [];
    const indexer: Brick = {
      manifest: {
        name: 'indexer',
        version: '1.0.0',
        description: 'indexer',
        dependencies: [],
        tools: [{ name: 'indexer_search', description: 'x', inputSchema: { type: 'object' } }],
      },
      start(ctx): void {
        unsubs.push(ctx.bus.handle('indexer:indexer_search', () => ({ files: [] })));
      },
      stop(): void {
        for (const u of unsubs) u();
        unsubs = [];
      },
    };

    // php déclare UNIQUEMENT 'indexer' comme dépendance
    let phpUnsubs: Unsubscribe[] = [];
    const php: Brick = {
      manifest: {
        name: 'php',
        version: '1.0.0',
        description: 'php',
        dependencies: ['indexer'],
        tools: [
          { name: 'php_ok', description: 'allowed', inputSchema: { type: 'object' } },
          { name: 'php_ko', description: 'denied', inputSchema: { type: 'object' } },
        ],
      },
      start(ctx): void {
        phpUnsubs.push(
          ctx.bus.handle('php:php_ok', () => ctx.bus.request('indexer:indexer_search', {})),
        );
        phpUnsubs.push(ctx.bus.handle('php:php_ko', () => ctx.bus.request('cache:cache_get', {})));
      },
      stop(): void {
        for (const u of phpUnsubs) u();
        phpUnsubs = [];
      },
    };

    const app = createFocusMcp({ bricks: [indexer, php] });
    await app.start();

    await expect(app.bus.request('php:php_ok', {})).resolves.toEqual({ files: [] });
    await expect(app.bus.request('php:php_ko', {})).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });

    await app.stop();
  });
});
