// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * C1 — explicit call context (focus-mcp v2).
 *
 * Bug pinned by this file: the call context (source, depth) lives in an
 * AsyncLocalStorage polyfill that does not survive an `await`. Once a brick
 * handler has awaited anything, a nested `bus.request()` sees no context:
 *   - the source falls back to 'router', and #assertPermission returns early
 *     for 'router' → a brick can call a brick it did NOT declare as a dependency;
 *   - the depth restarts at 0 → recursion between handlers is no longer bounded
 *     by maxDepth.
 *
 * Each red test has a synchronous twin that passes today: it proves the guard
 * itself works, and that the `await` alone is what defeats it.
 */

import { describe, expect, it } from 'vitest';
import { createFocusMcp } from '../bootstrap/create-focus-mcp.ts';
import type { Brick, EventBus, Unsubscribe } from '../types/index.ts';
import { DEFAULT_GUARDS, InProcessEventBus } from './event-bus.ts';

type Handler = (bus: EventBus) => (payload: unknown) => unknown;

/** Brick exposing one tool, whose handler gets the bus handed to the brick at start(). */
function brick(name: string, deps: readonly string[], tool: string, handler: Handler): Brick {
    let unsubs: Unsubscribe[] = [];
    return {
        manifest: {
            name,
            version: '1.0.0',
            prefix: name,
            description: name,
            dependencies: deps,
            tools: [{ name: tool, description: 'x', inputSchema: { type: 'object' } }],
        },
        start(ctx): void {
            unsubs.push(ctx.bus.handle(`${name}:${tool}`, handler(ctx.bus)));
        },
        stop(): void {
            for (const u of unsubs) u();
            unsubs = [];
        },
    };
}

/**
 * alpha declares NO dependency; bravo exposes a "secret" tool.
 * alpha's tool tries to call bravo:secret, with or without awaiting first.
 */
async function setupUndeclaredCall(awaitFirst: boolean) {
    let secretCalls = 0;
    const alpha = brick('alpha', [], 'probe', (bus) => async () => {
        if (awaitFirst) await Promise.resolve();
        return bus.request('bravo:secret', {});
    });
    const bravo = brick('bravo', [], 'secret', () => () => {
        secretCalls += 1;
        return 'leaked';
    });
    const app = createFocusMcp({ bricks: [alpha, bravo] });
    await app.start();
    return { app, secretCalls: () => secretCalls };
}

describe('C1 — permissions survive an await in the calling handler', () => {
    it('denies a call to an undeclared brick made synchronously (control, green today)', async () => {
        const { app, secretCalls } = await setupUndeclaredCall(false);

        await expect(app.router.callTool('alpha_probe', {})).rejects.toMatchObject({
            code: 'PERMISSION_DENIED',
        });
        expect(secretCalls()).toBe(0);
        await app.stop();
    });

    it('denies a call to an undeclared brick made after an await (RED: permission bypass)', async () => {
        const { app, secretCalls } = await setupUndeclaredCall(true);

        await expect(app.router.callTool('alpha_probe', {})).rejects.toMatchObject({
            code: 'PERMISSION_DENIED',
        });
        expect(secretCalls()).toBe(0);
        await app.stop();
    });
});

/**
 * A handler that calls itself again. maxDepth = 3 must stop the chain after
 * 3 handler runs, whether or not the handler awaits before recursing.
 * A safety stop at 20 runs keeps the buggy case from looping forever.
 */
async function runSelfRecursion(awaitFirst: boolean) {
    const bus = new InProcessEventBus({ ...DEFAULT_GUARDS, maxDepth: 3 });
    let runs = 0;
    bus.handle('loop:again', async () => {
        runs += 1;
        if (runs > 20) return 'escaped maxDepth';
        if (awaitFirst) await Promise.resolve();
        return bus.request('loop:again', {});
    });
    const outcome = await bus.request('loop:again', {}).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
    );
    return { outcome, runs };
}

describe('C1 — call depth survives an await in the calling handler', () => {
    it('stops a synchronous self-recursion at maxDepth (control, green today)', async () => {
        const { outcome, runs } = await runSelfRecursion(false);

        expect(outcome).toMatchObject({ error: { code: 'MAX_DEPTH_EXCEEDED' } });
        expect(runs).toBe(3);
    });

    it('stops a self-recursion that awaits before recursing at maxDepth (RED: depth reset)', async () => {
        const { outcome, runs } = await runSelfRecursion(true);

        expect(outcome).toMatchObject({ error: { code: 'MAX_DEPTH_EXCEEDED' } });
        expect(runs).toBe(3);
    });
});
