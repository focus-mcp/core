// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { AsyncLocalStorage } from '../observability/async-storage.ts';
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

function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}

interface CallContext {
  readonly source: string;
  readonly traceId: string;
  readonly depth: number;
}

const callStorage = new AsyncLocalStorage<CallContext>();
const logger = createLogger('event-bus');

function toRecord(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  if (typeof err === 'object' && err !== null) return err as Record<string, unknown>;
  return { value: String(err) };
}

export const DEFAULT_GUARDS: EventBusGuards = {
  maxDepth: 16,
  defaultTimeoutMs: 30_000,
  maxPayloadBytes: 5 * 1024 * 1024,
  rateLimit: { callsPerSecond: 100, burstSize: 200 },
  circuitBreaker: { failureThreshold: 5, cooldownMs: 30_000 },
};

export interface EventBusOptions {
  /**
   * Retourne la whitelist des briques qu'une source est autorisée à appeler,
   * typiquement alimenté par le Registry à partir du manifeste.
   * Si omis, aucune vérification de permission n'est appliquée.
   */
  readonly permissionProvider?: (source: string) => readonly string[];
}

interface TokenBucket {
  tokens: number;
  lastRefillAt: number;
}

interface CircuitState {
  failures: number;
  openedAt: number | null;
}

export class InProcessEventBus implements EventBus {
  readonly #subscribers = new Map<string, Set<EventHandler>>();
  readonly #handlers = new Map<string, RequestHandler>();
  readonly #guards: EventBusGuards;
  readonly #permissionProvider?: (source: string) => readonly string[];
  readonly #buckets = new Map<string, TokenBucket>();
  readonly #circuits = new Map<string, CircuitState>();

  constructor(guards: EventBusGuards = DEFAULT_GUARDS, options: EventBusOptions = {}) {
    this.#guards = guards;
    if (options.permissionProvider) {
      this.#permissionProvider = options.permissionProvider;
    }
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
            logger.error('event handler error', { event, err: toRecord(err) });
          });
        }
      } catch (err: unknown) {
        logger.error('event handler error', { event, err: toRecord(err) });
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

    const parentCtx = callStorage.getStore();
    const source = parentCtx?.source ?? 'router';
    const targetBrick = target.split(':')[0] ?? 'unknown';

    this.#assertPermission(source, targetBrick);
    this.#assertRateLimit(source);
    this.#assertCircuitClosed(target);

    const handler = this.#handlers.get(target);
    if (!handler) {
      throw new EventBusError(`No handler registered for "${target}"`, 'NO_HANDLER', { target });
    }

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

    const meta: EventMeta = {
      source,
      traceId,
      depth: nextDepth,
      emittedAt: Date.now(),
    };

    const ctx: CallContext = { source: targetBrick, traceId, depth: nextDepth };
    const timeoutMs = options?.timeoutMs ?? this.#guards.defaultTimeoutMs;

    try {
      const result = await callStorage.run(ctx, () =>
        this.#runWithTimeout<TResponse>(target, handler, payload, meta, timeoutMs),
      );
      this.#recordSuccess(target);
      return result;
    } catch (err) {
      this.#recordFailure(target);
      throw err;
    }
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

  #assertPermission(source: string, targetBrick: string): void {
    if (!this.#permissionProvider) return;
    if (source === 'router') return;
    const allowed = this.#permissionProvider(source);
    if (!allowed.includes(targetBrick)) {
      throw new EventBusError(
        `"${source}" is not allowed to call "${targetBrick}" (not in declared dependencies)`,
        'PERMISSION_DENIED',
        { source, target: targetBrick, allowed },
      );
    }
  }

  #assertRateLimit(source: string): void {
    const { callsPerSecond, burstSize } = this.#guards.rateLimit;
    const now = Date.now();
    let bucket = this.#buckets.get(source);
    if (!bucket) {
      bucket = { tokens: burstSize, lastRefillAt: now };
      this.#buckets.set(source, bucket);
    } else {
      const elapsed = now - bucket.lastRefillAt;
      if (elapsed > 0) {
        const refill = (elapsed * callsPerSecond) / 1000;
        bucket.tokens = Math.min(burstSize, bucket.tokens + refill);
        bucket.lastRefillAt = now;
      }
    }
    if (bucket.tokens < 1) {
      throw new EventBusError(
        `Rate limit exceeded for "${source}" (${callsPerSecond}/s, burst ${burstSize})`,
        'RATE_LIMIT_EXCEEDED',
        { source, callsPerSecond, burstSize },
      );
    }
    bucket.tokens -= 1;
  }

  #assertCircuitClosed(target: string): void {
    const circuit = this.#circuits.get(target);
    if (!circuit || circuit.openedAt === null) return;
    const { cooldownMs } = this.#guards.circuitBreaker;
    const elapsed = Date.now() - circuit.openedAt;
    if (elapsed < cooldownMs) {
      throw new EventBusError(
        `Circuit open for "${target}" (cooldown ${cooldownMs}ms)`,
        'CIRCUIT_OPEN',
        { target, cooldownMs, remainingMs: cooldownMs - elapsed },
      );
    }
    // Cooldown écoulé : half-open → on laisse passer cet appel.
    // Un succès réinitialise le circuit, un échec le ré-ouvre immédiatement.
    circuit.openedAt = null;
  }

  #recordSuccess(target: string): void {
    const circuit = this.#circuits.get(target);
    if (circuit) {
      circuit.failures = 0;
      circuit.openedAt = null;
    }
  }

  #recordFailure(target: string): void {
    let circuit = this.#circuits.get(target);
    if (!circuit) {
      circuit = { failures: 0, openedAt: null };
      this.#circuits.set(target, circuit);
    }
    circuit.failures += 1;
    const { failureThreshold } = this.#guards.circuitBreaker;
    if (circuit.failures >= failureThreshold && circuit.openedAt === null) {
      circuit.openedAt = Date.now();
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
