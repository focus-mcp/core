// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * Logger minimal browser+node compatible.
 *
 * Le core ne faisant plus de web et tournant principalement dans la WebView Tauri,
 * on remplace pino (Node-only) par un wrapper console avec filtrage par niveau
 * et redaction simple des champs sensibles dans le meta.
 *
 * Signature alignée sur `BrickLogger` (msg: string, meta?: Record<string, unknown>).
 */

const LEVELS = ['trace', 'debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LEVELS)[number];

const LEVEL_RANK: Readonly<Record<LogLevel, number>> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
};

const SECRET_KEYS = new Set(['password', 'token', 'secret', 'apikey', 'authorization', 'cookie']);

export interface Logger {
    trace(msg: string, meta?: Record<string, unknown>): void;
    debug(msg: string, meta?: Record<string, unknown>): void;
    info(msg: string, meta?: Record<string, unknown>): void;
    warn(msg: string, meta?: Record<string, unknown>): void;
    error(msg: string, meta?: Record<string, unknown>): void;
    child(bindings: Record<string, unknown>): Logger;
}

interface LoggerState {
    readonly minLevel: LogLevel;
    readonly bindings: Readonly<Record<string, unknown>>;
}

function getMinLevel(): LogLevel {
    const envLevel = getEnvVar('FOCUS_LOG_LEVEL')?.toLowerCase();
    if (envLevel && LEVELS.includes(envLevel as LogLevel)) return envLevel as LogLevel;
    return 'info';
}

function getEnvVar(name: string): string | undefined {
    if (typeof process !== 'undefined' && process.env) return process.env[name];
    return undefined;
}

function redact(value: unknown): unknown {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(redact);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = SECRET_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : redact(v);
    }
    return out;
}

function emit(
    state: LoggerState,
    level: LogLevel,
    msg: string,
    meta?: Record<string, unknown>,
): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[state.minLevel]) return;
    const payload = {
        time: new Date().toISOString(),
        level,
        ...state.bindings,
        ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
        msg,
    };
    const line = JSON.stringify(payload);
    const sink = level === 'error' || level === 'warn' ? console.error : console.log;
    sink(line);
}

function make(state: LoggerState): Logger {
    return {
        trace: (msg, meta) => emit(state, 'trace', msg, meta),
        debug: (msg, meta) => emit(state, 'debug', msg, meta),
        info: (msg, meta) => emit(state, 'info', msg, meta),
        warn: (msg, meta) => emit(state, 'warn', msg, meta),
        error: (msg, meta) => emit(state, 'error', msg, meta),
        child: (bindings) => make({ ...state, bindings: { ...state.bindings, ...bindings } }),
    };
}

export const rootLogger: Logger = make({
    minLevel: getMinLevel(),
    bindings: { service: 'focusmcp' },
});

export function createLogger(component: string, bindings: Record<string, unknown> = {}): Logger {
    return rootLogger.child({ component, ...bindings });
}
