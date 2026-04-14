// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from 'vitest';
import { EventBusError } from '../types/event-bus.ts';
import { InProcessEventBus } from './event-bus.ts';

describe('InProcessEventBus — pub/sub', () => {
  it('appelle tous les handlers abonnés à un événement', () => {
    const bus = new InProcessEventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.on('files:indexed', handler1);
    bus.on('files:indexed', handler2);
    bus.emit('files:indexed', { count: 42 });

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
    expect(handler1).toHaveBeenCalledWith({ count: 42 }, expect.any(Object));
  });

  it("n'appelle pas les handlers d'autres événements", () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();

    bus.on('files:indexed', handler);
    bus.emit('php:analyzed', { file: 'x.php' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('permet de se désabonner via le retour de on()', () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();

    const unsubscribe = bus.on('test', handler);
    unsubscribe();
    bus.emit('test', null);

    expect(handler).not.toHaveBeenCalled();
  });

  it('passe un EventMeta avec source, traceId, depth, emittedAt', () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();

    bus.on('test', handler);
    bus.emit('test', null);

    expect(handler).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        source: expect.any(String),
        traceId: expect.any(String),
        depth: expect.any(Number),
        emittedAt: expect.any(Number),
      }),
    );
  });

  it('swallow les erreurs synchrones des handlers (fire-and-forget)', () => {
    const bus = new InProcessEventBus();
    const throwing = vi.fn(() => {
      throw new Error('boom');
    });
    const ok = vi.fn();

    bus.on('test', throwing);
    bus.on('test', ok);

    expect(() => bus.emit('test', null)).not.toThrow();
    expect(throwing).toHaveBeenCalledOnce();
    expect(ok).toHaveBeenCalledOnce();
  });

  it('swallow les erreurs async des handlers', async () => {
    const bus = new InProcessEventBus();
    const asyncFail = vi.fn(async () => {
      await Promise.resolve();
      throw new Error('async boom');
    });

    bus.on('test', asyncFail);
    expect(() => bus.emit('test', null)).not.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(asyncFail).toHaveBeenCalledOnce();
  });
});

describe('InProcessEventBus — request/response', () => {
  it("résout avec la valeur retournée par le handler enregistré sur 'brick:action'", async () => {
    const bus = new InProcessEventBus();
    bus.handle('indexer:search', async (payload: { pattern: string }) => ({
      files: [`match-${payload.pattern}`],
    }));

    const result = await bus.request('indexer:search', { pattern: '*.ts' });

    expect(result).toEqual({ files: ['match-*.ts'] });
  });

  it("rejette avec NO_HANDLER si aucune brique n'est enregistrée pour la cible", async () => {
    const bus = new InProcessEventBus();

    await expect(bus.request('unknown:target', {})).rejects.toMatchObject({
      name: 'EventBusError',
      code: 'NO_HANDLER',
    });
  });

  it('refuse un second handler pour la même cible (HANDLER_ALREADY_REGISTERED)', () => {
    const bus = new InProcessEventBus();
    bus.handle('php:analyze', () => 'first');

    expect(() => bus.handle('php:analyze', () => 'second')).toThrow(EventBusError);
  });

  it('propage le traceId fourni dans options vers le handler', async () => {
    const bus = new InProcessEventBus();
    let capturedTraceId: string | undefined;
    bus.handle('echo', (_, meta) => {
      capturedTraceId = meta.traceId;
      return 'ok';
    });

    await bus.request('echo', null, { traceId: 'trace-123' });

    expect(capturedTraceId).toBe('trace-123');
  });

  it('propage le traceId parent dans les requêtes imbriquées', async () => {
    const bus = new InProcessEventBus();
    const captured: string[] = [];
    bus.handle('parent', async (_, meta) => {
      captured.push(meta.traceId);
      return bus.request('child', null);
    });
    bus.handle('child', (_, meta) => {
      captured.push(meta.traceId);
      return 'done';
    });

    await bus.request('parent', null, { traceId: 'shared-trace' });

    expect(captured).toEqual(['shared-trace', 'shared-trace']);
  });

  it('respecte options.timeoutMs (override du default)', async () => {
    const bus = new InProcessEventBus();
    bus.handle('slow', () => new Promise((resolve) => setTimeout(resolve, 200)));

    await expect(bus.request('slow', null, { timeoutMs: 30 })).rejects.toMatchObject({
      name: 'EventBusError',
      code: 'TIMEOUT',
    });
  });
});

describe('InProcessEventBus — garde-fous', () => {
  it('TIMEOUT : rejette si le handler ne répond pas dans le délai', async () => {
    const bus = new InProcessEventBus({
      ...{
        maxDepth: 16,
        defaultTimeoutMs: 50,
        maxPayloadBytes: 1024,
        rateLimit: { callsPerSecond: 100, burstSize: 200 },
        circuitBreaker: { failureThreshold: 5, cooldownMs: 30_000 },
      },
    });
    bus.handle('slow:op', () => new Promise((resolve) => setTimeout(resolve, 200)));

    await expect(bus.request('slow:op', null)).rejects.toMatchObject({
      name: 'EventBusError',
      code: 'TIMEOUT',
    });
  });

  it('MAX_DEPTH_EXCEEDED : bloque les boucles infinies inter-briques', async () => {
    const bus = new InProcessEventBus({
      maxDepth: 3,
      defaultTimeoutMs: 1000,
      maxPayloadBytes: 1024,
      rateLimit: { callsPerSecond: 1000, burstSize: 2000 },
      circuitBreaker: { failureThreshold: 100, cooldownMs: 1000 },
    });

    bus.handle('a:call', () => bus.request('b:call', null));
    bus.handle('b:call', () => bus.request('a:call', null));

    await expect(bus.request('a:call', null)).rejects.toMatchObject({
      name: 'EventBusError',
      code: 'MAX_DEPTH_EXCEEDED',
    });
  });

  it('PAYLOAD_TOO_LARGE : rejette les payloads dépassant maxPayloadBytes', async () => {
    const bus = new InProcessEventBus({
      maxDepth: 16,
      defaultTimeoutMs: 1000,
      maxPayloadBytes: 100,
      rateLimit: { callsPerSecond: 1000, burstSize: 2000 },
      circuitBreaker: { failureThreshold: 100, cooldownMs: 1000 },
    });
    bus.handle('echo', (payload) => payload);

    const tooBig = 'x'.repeat(1000);

    await expect(bus.request('echo', tooBig)).rejects.toMatchObject({
      name: 'EventBusError',
      code: 'PAYLOAD_TOO_LARGE',
    });
  });
});
