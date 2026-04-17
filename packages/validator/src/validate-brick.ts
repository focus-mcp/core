// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import type { Brick, BrickContext, BrickLogger, EventBus } from '@focusmcp/core';
import { InProcessEventBus, ManifestError, parseManifest } from '@focusmcp/core';

export type ValidationIssueCode =
    | 'INVALID_MANIFEST'
    | 'START_FAILED'
    | 'MISSING_HANDLER'
    | 'TOOL_CALL_FAILED'
    | 'HANDLER_LEAK'
    | 'STOP_FAILED';

export interface ValidationIssue {
    readonly code: ValidationIssueCode;
    readonly severity: 'error' | 'warning';
    readonly message: string;
    readonly meta?: Record<string, unknown>;
}

export interface ValidationReport {
    readonly ok: boolean;
    readonly issues: readonly ValidationIssue[];
}

export interface ValidateBrickOptions {
    /**
     * Contexte fourni à `brick.start(ctx)`. Si omis, un contexte par défaut
     * est instancié (EventBus neuf, config vide, logger silencieux).
     */
    readonly ctx?: BrickContext;
}

const silentLogger: BrickLogger = {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
};

/**
 * Valide une brique FocusMCP contre le contrat :
 * - manifeste conforme (via `parseManifest`)
 * - `start()` enregistre tous les tools déclarés
 * - chaque tool est appelable sans exception
 * - `stop()` désenregistre tous les handlers
 */
export async function validateBrick(
    brick: Brick,
    options: ValidateBrickOptions = {},
): Promise<ValidationReport> {
    const issues: ValidationIssue[] = [];

    const manifestIssue = validateManifest(brick);
    if (manifestIssue) {
        issues.push(manifestIssue);
        return { ok: false, issues };
    }

    const bus = options.ctx?.bus ?? new InProcessEventBus();
    const ctx: BrickContext = options.ctx ?? { bus, config: {}, logger: silentLogger };

    if (!(await runStart(brick, ctx, issues))) {
        return { ok: false, issues };
    }

    await assertToolsCallable(brick, bus, issues);

    await runStop(brick, bus, issues);

    return { ok: issues.length === 0, issues };
}

function validateManifest(brick: Brick): ValidationIssue | undefined {
    try {
        parseManifest(brick.manifest);
        return undefined;
    } catch (err) {
        const msg = err instanceof ManifestError ? err.message : String(err);
        const issue: Mutable<ValidationIssue> = {
            code: 'INVALID_MANIFEST',
            severity: 'error',
            message: `Invalid manifest: ${msg}`,
        };
        if (err instanceof ManifestError && err.meta) issue.meta = err.meta;
        return issue as ValidationIssue;
    }
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

async function runStart(
    brick: Brick,
    ctx: BrickContext,
    issues: ValidationIssue[],
): Promise<boolean> {
    try {
        await brick.start(ctx);
        return true;
    } catch (err) {
        issues.push({
            code: 'START_FAILED',
            severity: 'error',
            message: `start() threw: ${err instanceof Error ? err.message : String(err)}`,
        });
        return false;
    }
}

async function assertToolsCallable(
    brick: Brick,
    bus: EventBus,
    issues: ValidationIssue[],
): Promise<void> {
    for (const tool of brick.manifest.tools) {
        const target = `${brick.manifest.name}:${tool.name}`;
        try {
            await bus.request(target, {});
        } catch (err) {
            const code = extractEventBusCode(err);
            if (code === 'NO_HANDLER') {
                issues.push({
                    code: 'MISSING_HANDLER',
                    severity: 'error',
                    message: `Tool "${target}" declared but no handler registered after start()`,
                    meta: { target },
                });
            } else {
                issues.push({
                    code: 'TOOL_CALL_FAILED',
                    severity: 'error',
                    message: `Tool "${target}" threw: ${err instanceof Error ? err.message : String(err)}`,
                    meta: { target },
                });
            }
        }
    }
}

async function runStop(brick: Brick, bus: EventBus, issues: ValidationIssue[]): Promise<void> {
    try {
        await brick.stop();
    } catch (err) {
        issues.push({
            code: 'STOP_FAILED',
            severity: 'error',
            message: `stop() threw: ${err instanceof Error ? err.message : String(err)}`,
        });
        return;
    }
    // Après stop(), plus aucun handler déclaré ne doit répondre.
    for (const tool of brick.manifest.tools) {
        const target = `${brick.manifest.name}:${tool.name}`;
        try {
            await bus.request(target, {});
            // Si ça passe, c'est que le handler est encore enregistré → leak.
            issues.push({
                code: 'HANDLER_LEAK',
                severity: 'error',
                message: `Handler "${target}" still registered after stop()`,
                meta: { target },
            });
        } catch (err) {
            if (extractEventBusCode(err) !== 'NO_HANDLER') {
                // Le handler existe toujours et a répondu par une erreur → leak aussi.
                issues.push({
                    code: 'HANDLER_LEAK',
                    severity: 'error',
                    message: `Handler "${target}" still registered after stop()`,
                    meta: { target },
                });
            }
        }
    }
}

function extractEventBusCode(err: unknown): string | undefined {
    if (err !== null && typeof err === 'object' && 'code' in err) {
        const code = (err as { code: unknown }).code;
        if (typeof code === 'string') return code;
    }
    return undefined;
}
