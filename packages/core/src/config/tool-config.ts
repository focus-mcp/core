// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * Tool visibility configuration — pure, browser-compatible.
 *
 * Manages the tool filter lists stored in ~/.focus/config.json:
 *   - tools.hidden     : blacklist (tools hidden from the AI client)
 *   - tools.alwaysLoad : pin list (tools always exposed with _meta.anthropic/alwaysLoad: true)
 *
 * Does no I/O: the host injects a ToolConfigIO implementation.
 * This module validates, normalises and mutates in-memory state only.
 *
 * Pattern matching:
 *   - Exact name: `sym_get` matches only `sym_get`
 *   - Trailing glob: `focus_*` matches any tool starting with `focus_`
 */

// ---------- Types ----------

export interface ToolConfigData {
    readonly tools: {
        readonly hidden: readonly string[];
        readonly alwaysLoad: readonly string[];
    };
}

export interface ToolConfigIO {
    readConfig(): Promise<unknown>;
    writeConfig(data: ToolConfigData): Promise<void>;
}

// ---------- parseToolConfig ----------

export function parseToolConfig(raw: unknown): ToolConfigData {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return { tools: { hidden: [], alwaysLoad: [] } };
    }
    const obj = raw as Record<string, unknown>;
    const tools = obj['tools'];
    if (tools === null || typeof tools !== 'object' || Array.isArray(tools)) {
        return { tools: { hidden: [], alwaysLoad: [] } };
    }
    const toolsObj = tools as Record<string, unknown>;
    const parseArr = (key: string): readonly string[] => {
        const val = toolsObj[key];
        if (!Array.isArray(val)) return [];
        return val.filter((s): s is string => typeof s === 'string' && s.length > 0);
    };
    return {
        tools: {
            hidden: parseArr('hidden'),
            alwaysLoad: parseArr('alwaysLoad'),
        },
    };
}

// ---------- Pattern matching ----------

/**
 * Returns true if `toolName` matches the given pattern.
 * Supports a single trailing `*` wildcard (`focus_*` matches `focus_install`, etc.).
 */
export function matchesToolPattern(toolName: string, pattern: string): boolean {
    if (pattern.endsWith('*')) {
        return toolName.startsWith(pattern.slice(0, -1));
    }
    return toolName === pattern;
}

/**
 * Returns true when `toolName` matches any of the given patterns.
 */
function matchesAny(toolName: string, patterns: readonly string[]): boolean {
    return patterns.some((p) => matchesToolPattern(toolName, p));
}

// ---------- Query helpers ----------

/**
 * Returns true when `toolName` is in the hidden list.
 *
 * `alwaysVisible`: tool names that are always exposed regardless of the hidden list
 * (e.g. the management tool itself). Defaults to `['focus_tools']`.
 */
export function isToolHidden(
    toolName: string,
    config: ToolConfigData,
    alwaysVisible: readonly string[] = ['focus_tools'],
): boolean {
    if (alwaysVisible.includes(toolName)) return false;
    return matchesAny(toolName, config.tools.hidden);
}

/**
 * Returns true when `toolName` should be annotated with `_meta.anthropic/alwaysLoad: true`.
 *
 * Precedence:
 *   1. User-level pin (tools.alwaysLoad in config)
 *   2. Server-level defaults (serverDefaults set)
 *
 * The hidden check is NOT applied here — callers should check `isToolHidden` separately.
 */
export function shouldAlwaysLoad(
    toolName: string,
    config: ToolConfigData,
    serverDefaults: ReadonlySet<string> = new Set(),
): boolean {
    if (matchesAny(toolName, config.tools.alwaysLoad)) return true;
    return serverDefaults.has(toolName);
}

// ---------- Mutations ----------

export async function hideTool(pattern: string, io: ToolConfigIO): Promise<string> {
    const raw = await io.readConfig();
    const config = parseToolConfig(raw);
    if (config.tools.hidden.includes(pattern)) {
        return `Pattern "${pattern}" is already in the hidden list.`;
    }
    const updated: ToolConfigData = {
        tools: {
            hidden: [...config.tools.hidden, pattern],
            alwaysLoad: config.tools.alwaysLoad,
        },
    };
    await io.writeConfig(updated);
    return `Pattern "${pattern}" added to hidden list.\nRestart \`focus start\` to apply.`;
}

export async function showTool(pattern: string, io: ToolConfigIO): Promise<string> {
    const raw = await io.readConfig();
    const config = parseToolConfig(raw);
    const newHidden = config.tools.hidden.filter((p) => p !== pattern);
    if (newHidden.length === config.tools.hidden.length) {
        return `Pattern "${pattern}" was not in the hidden list.`;
    }
    const updated: ToolConfigData = {
        tools: { hidden: newHidden, alwaysLoad: config.tools.alwaysLoad },
    };
    await io.writeConfig(updated);
    return `Pattern "${pattern}" removed from hidden list.\nRestart \`focus start\` to apply.`;
}

export async function pinTool(pattern: string, io: ToolConfigIO): Promise<string> {
    const raw = await io.readConfig();
    const config = parseToolConfig(raw);
    if (config.tools.alwaysLoad.includes(pattern)) {
        return `Pattern "${pattern}" is already in the alwaysLoad list.`;
    }
    const updated: ToolConfigData = {
        tools: {
            hidden: config.tools.hidden,
            alwaysLoad: [...config.tools.alwaysLoad, pattern],
        },
    };
    await io.writeConfig(updated);
    return `Pattern "${pattern}" added to alwaysLoad list.\nRestart \`focus start\` to apply.`;
}

export async function unpinTool(pattern: string, io: ToolConfigIO): Promise<string> {
    const raw = await io.readConfig();
    const config = parseToolConfig(raw);
    const newAlwaysLoad = config.tools.alwaysLoad.filter((p) => p !== pattern);
    if (newAlwaysLoad.length === config.tools.alwaysLoad.length) {
        return `Pattern "${pattern}" was not in the alwaysLoad list.`;
    }
    const updated: ToolConfigData = {
        tools: { hidden: config.tools.hidden, alwaysLoad: newAlwaysLoad },
    };
    await io.writeConfig(updated);
    return `Pattern "${pattern}" removed from alwaysLoad list.\nRestart \`focus start\` to apply.`;
}

export async function listToolsConfig(io: ToolConfigIO): Promise<string> {
    const raw = await io.readConfig();
    const config = parseToolConfig(raw);
    const lines: string[] = [];
    if (config.tools.hidden.length === 0) {
        lines.push('hidden:     (none)');
    } else {
        lines.push(`hidden (${config.tools.hidden.length}):`);
        for (const p of config.tools.hidden) lines.push(`  - ${p}`);
    }
    if (config.tools.alwaysLoad.length === 0) {
        lines.push('alwaysLoad: (none)');
    } else {
        lines.push(`alwaysLoad (${config.tools.alwaysLoad.length}):`);
        for (const p of config.tools.alwaysLoad) lines.push(`  - ${p}`);
    }
    return lines.join('\n');
}

export async function clearToolsConfig(io: ToolConfigIO): Promise<string> {
    const raw = await io.readConfig();
    const config = parseToolConfig(raw);
    const updated: ToolConfigData = {
        tools: {
            hidden: [],
            alwaysLoad: [],
        },
    };
    // Preserve any other keys by merging with existing config
    void config; // config.tools replaced, other fields preserved via io contract
    await io.writeConfig(updated);
    return 'tools.hidden and tools.alwaysLoad cleared.\nRestart `focus start` to apply.';
}
