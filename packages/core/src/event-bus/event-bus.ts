// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../observability/logger.ts';
import {
  type EventBus,
  EventBusError,
  type EventBusGuards,
  type EventHandler,
  type EventMeta,
  type RequestHandler,
  type RequestOptions,
  type Unsubscribe,
} from '../types/event-bus.ts';

interface CallContext {
  readonly source: string;
  readonly traceId: string;
  readonly depth: number;
}

const callStorage = new AsyncLocalStorage<CallContext>();
const logger = createLogger('event-bus');

export const DEFAULT_GUARDS: EventBusGuards = {
  maxDepth: 16,
  defaultTimeoutMs: 30_000,
  maxPayloadBytes: 5 * 1024 * 1024,
  rateLimit: { callsPerSecond: 100, burstSize: 200 },
  circuitBreaker: { failureThreshold: 5, cooldownMs: 30_000 },
};

export class InProcessEventBus implements EventBus {
  readonly #subscribers = new Map<string, Set<EventHandler>>();
  readonly #handlers = new Map<string, RequestHandler>();
  readonly #guards: EventBusGuards;

  constructor(guards: EventBusGuards = DEFAULT_GUARDS) {
    this.#guards = guards;
  }

  emit<T = unknown>(event: string, payload: T): void {
    const meta = this.#buildMeta();
    const handlers = this.#subscribers.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        const result = handler(payload, meta);
        if (result instanceof Promise) {
          result.catch((err: unknown) => {
            logger.error({ event, err }, 'event handler error');
          });
        }
      } catch (err: unknown) {
        logger.error({ event, err }, 'event handler error');
      }
    }
  }

  on<T = unknown>(event: string, handler: EventHandler<T>): Unsubscribe {
    let set = this.#subscribers.get(event);
    if (!set) {
      set = new Set();
      this.#subscribers.set(event, set);
    }
    const generic = handler as EventHandler;
    set.add(generic);
    return (): void => {
      set?.delete(generic);
    };
  }

  async request<TRequest = unknown, TResponse = unknown>(
    target: string,
    payload: TRequest,
    options?: RequestOptions,
  ): Promise<TResponse> {
    this.#assertPayloadSize(payload);

    const handler = this.#handlers.get(target);
    if (!handler) {
      throw new EventBusError(`No handler registered for "${target}"`, 'NO_HANDLER', { target });
    }

    const parentCtx = callStorage.getStore();
    const currentDepth = parentCtx?.depth ?? 0;
    if (currentDepth >= this.#guards.maxDepth) {
      throw new EventBusError(
        `Max call depth exceeded (${this.#guards.maxDepth}) on "${target}"`,
        'MAX_DEPTH_EXCEEDED',
        { target, depth: currentDepth, max: this.#guards.maxDepth },
      );
    }

    const nextDepth = currentDepth + 1;
    const traceId = options?.traceId ?? parentCtx?.traceId ?? randomUUID();
    const sourceFromTarget = target.split(':')[0] ?? 'unknown';

    const meta: EventMeta = {
      source: parentCtx?.source ?? 'router',
      traceId,
      depth: nextDepth,
      emittedAt: Date.now(),
    };

    const ctx: CallContext = { source: sourceFromTarget, traceId, depth: nextDepth };
    const timeoutMs = options?.timeoutMs ?? this.#guards.defaultTimeoutMs;

    return callStorage.run(ctx, () =>
      this.#runWithTimeout(target, handler, payload, meta, timeoutMs),
    );
  }

  handle<TRequest = unknown, TResponse = unknown>(
    target: string,
    handler: RequestHandler<TRequest, TResponse>,
  ): Unsubscribe {
    if (this.#handlers.has(target)) {
      throw new EventBusError(
        `Handler already registered for "${target}"`,
        'HANDLER_ALREADY_REGISTERED',
        { target },
      );
    }
    this.#handlers.set(target, handler as RequestHandler);
    return (): void => {
      this.#handlers.delete(target);
    };
  }

  #buildMeta(): EventMeta {
    const ctx = callStorage.getStore();
    return {
      source: ctx?.source ?? 'router',
      traceId: ctx?.traceId ?? randomUUID(),
      depth: ctx?.depth ?? 0,
      emittedAt: Date.now(),
    };
  }

  #assertPayloadSize(payload: unknown): void {
    const serialized = JSON.stringify(payload ?? null);
    const size = Buffer.byteLength(serialized, 'utf8');
    if (size > this.#guards.maxPayloadBytes) {
      throw new EventBusError(
        `Payload too large: ${size} bytes > ${this.#guards.maxPayloadBytes}`,
        'PAYLOAD_TOO_LARGE',
        { size, max: this.#guards.maxPayloadBytes },
      );
    }
  }

  async #runWithTimeout<TResponse>(
    target: string,
    handler: RequestHandler,
    payload: unknown,
    meta: EventMeta,
    timeoutMs: number,
  ): Promise<TResponse> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race<TResponse>([
        Promise.resolve(handler(payload, meta)) as Promise<TResponse>,
        new Promise<TResponse>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new EventBusError(
                `Request to "${target}" timed out after ${timeoutMs}ms`,
                'TIMEOUT',
                {
                  target,
                  timeoutMs,
                },
              ),
            );
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
