// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * Système nerveux de FocusMCP. Toutes les communications inter-briques
 * passent par cet EventBus. Garde-fous appliqués automatiquement.
 */
export interface EventBus {
    /**
     * Pub/sub fire-and-forget. Notifie tous les handlers abonnés à `event`.
     * Retourne quand tous les handlers ont été appelés (sans attendre leur résolution).
     */
    emit<T = unknown>(event: string, payload: T): void;

    /**
     * Abonne un handler à un événement. Retourne une fonction de désabonnement.
     */
    on<T = unknown>(event: string, handler: EventHandler<T>): Unsubscribe;

    /**
     * Request/response synchrone. La cible (`brick:action`) doit avoir
     * enregistré un handler via `handle()`. Soumis aux garde-fous.
     */
    request<TRequest = unknown, TResponse = unknown>(
        target: string,
        payload: TRequest,
        options?: RequestOptions,
    ): Promise<TResponse>;

    /**
     * Enregistre un handler pour les requêtes ciblant `target`.
     * Une seule brique peut enregistrer un target donné (rejet si déjà pris).
     */
    handle<TRequest = unknown, TResponse = unknown>(
        target: string,
        handler: RequestHandler<TRequest, TResponse>,
    ): Unsubscribe;
}

export type EventHandler<T = unknown> = (payload: T, meta: EventMeta) => void | Promise<void>;

export type RequestHandler<TRequest = unknown, TResponse = unknown> = (
    payload: TRequest,
    meta: EventMeta,
) => TResponse | Promise<TResponse>;

export type Unsubscribe = () => void;

export interface RequestOptions {
    /** Timeout en ms (override de la valeur des garde-fous). */
    readonly timeoutMs?: number;
    /** Trace ID pour suivre une chaîne de requêtes. */
    readonly traceId?: string;
}

export interface EventMeta {
    /** Brique qui a émis l'événement / la requête. Vide pour le Router. */
    readonly source: string;
    /** Trace ID pour traçabilité distribuée. */
    readonly traceId: string;
    /** Profondeur d'appel (pour max-depth guard). */
    readonly depth: number;
    /** Timestamp d'émission (ms epoch). */
    readonly emittedAt: number;
}

/**
 * Configuration des garde-fous appliqués par l'EventBus.
 */
export interface EventBusGuards {
    readonly maxDepth: number;
    readonly defaultTimeoutMs: number;
    readonly maxPayloadBytes: number;
    readonly rateLimit: {
        readonly callsPerSecond: number;
        readonly burstSize: number;
    };
    readonly circuitBreaker: {
        readonly failureThreshold: number;
        readonly cooldownMs: number;
    };
}

export class EventBusError extends Error {
    constructor(
        message: string,
        public readonly code: EventBusErrorCode,
        public readonly meta?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'EventBusError';
    }
}

export type EventBusErrorCode =
    | 'TIMEOUT'
    | 'MAX_DEPTH_EXCEEDED'
    | 'RATE_LIMIT_EXCEEDED'
    | 'PERMISSION_DENIED'
    | 'PAYLOAD_TOO_LARGE'
    | 'CIRCUIT_OPEN'
    | 'NO_HANDLER'
    | 'HANDLER_ALREADY_REGISTERED'
    | 'HANDLER_ERROR';
