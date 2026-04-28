// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from 'vitest';
import {
    clearToolsConfig,
    hideTool,
    isToolHidden,
    listToolsConfig,
    matchesToolPattern,
    parseToolConfig,
    pinTool,
    shouldAlwaysLoad,
    showTool,
    type ToolConfigIO,
    unpinTool,
} from './tool-config.ts';

// ---------- helpers ----------

function makeIO(initial: unknown = {}): {
    io: ToolConfigIO;
    written: ReturnType<typeof vi.fn>;
} {
    const written = vi.fn();
    const io: ToolConfigIO = {
        readConfig: vi.fn().mockResolvedValue(initial),
        writeConfig: written.mockResolvedValue(undefined),
    };
    return { io, written };
}

// ---------- parseToolConfig ----------

describe('parseToolConfig', () => {
    it('returns empty lists for null input', () => {
        expect(parseToolConfig(null)).toEqual({ tools: { hidden: [], alwaysLoad: [] } });
    });

    it('returns empty lists for non-object input', () => {
        expect(parseToolConfig('string')).toEqual({ tools: { hidden: [], alwaysLoad: [] } });
        expect(parseToolConfig(42)).toEqual({ tools: { hidden: [], alwaysLoad: [] } });
    });

    it('returns empty lists when tools key is absent', () => {
        expect(parseToolConfig({})).toEqual({ tools: { hidden: [], alwaysLoad: [] } });
    });

    it('parses hidden and alwaysLoad arrays', () => {
        const raw = { tools: { hidden: ['sym_get'], alwaysLoad: ['focus_list'] } };
        expect(parseToolConfig(raw)).toEqual({
            tools: { hidden: ['sym_get'], alwaysLoad: ['focus_list'] },
        });
    });

    it('filters out non-string values from arrays', () => {
        const raw = { tools: { hidden: ['sym_get', 42, null, ''], alwaysLoad: [] } };
        const result = parseToolConfig(raw);
        expect(result.tools.hidden).toEqual(['sym_get']);
    });

    it('handles missing arrays gracefully', () => {
        const raw = { tools: { hidden: ['sym_get'] } };
        const result = parseToolConfig(raw);
        expect(result.tools.alwaysLoad).toEqual([]);
    });
});

// ---------- matchesToolPattern ----------

describe('matchesToolPattern', () => {
    it('matches exact tool names', () => {
        expect(matchesToolPattern('sym_get', 'sym_get')).toBe(true);
        expect(matchesToolPattern('sym_get', 'sym_find')).toBe(false);
    });

    it('supports trailing wildcard', () => {
        expect(matchesToolPattern('focus_install', 'focus_*')).toBe(true);
        expect(matchesToolPattern('focus_list', 'focus_*')).toBe(true);
        expect(matchesToolPattern('sym_find', 'focus_*')).toBe(false);
        expect(matchesToolPattern('sym_find', 'sym_*')).toBe(true);
    });

    it('does not treat * in the middle as wildcard', () => {
        expect(matchesToolPattern('fo_x_bar', 'fo_*_bar')).toBe(false);
    });
});

// ---------- isToolHidden ----------

describe('isToolHidden', () => {
    const config = parseToolConfig({ tools: { hidden: ['sym_get', 'focus_*'] } });

    it('returns false when no patterns match', () => {
        expect(isToolHidden('sym_find', config)).toBe(false);
    });

    it('returns true for exact match', () => {
        expect(isToolHidden('sym_get', config)).toBe(true);
    });

    it('returns true for glob match', () => {
        expect(isToolHidden('focus_install', config)).toBe(true);
        expect(isToolHidden('focus_list', config)).toBe(true);
    });

    it('focus_tools is immune by default', () => {
        const configWithAll = parseToolConfig({
            tools: { hidden: ['focus_*', 'focus_tools'] },
        });
        expect(isToolHidden('focus_tools', configWithAll)).toBe(false);
    });

    it('custom alwaysVisible list overrides', () => {
        const configHideAll = parseToolConfig({ tools: { hidden: ['*'] } });
        // With custom always-visible list
        expect(isToolHidden('my_immune_tool', configHideAll, ['my_immune_tool'])).toBe(false);
        // Regular tool is still hidden
        expect(isToolHidden('other_tool', configHideAll, ['my_immune_tool'])).toBe(true);
    });
});

// ---------- shouldAlwaysLoad ----------

describe('shouldAlwaysLoad', () => {
    const config = parseToolConfig({ tools: { alwaysLoad: ['ts_index'] } });
    const serverDefaults = new Set(['focus_search', 'focus_list', 'focus_install']);

    it('returns false when not in user pin list and not a server default', () => {
        expect(shouldAlwaysLoad('sym_find', config, serverDefaults)).toBe(false);
    });

    it('returns true for user-pinned tool', () => {
        expect(shouldAlwaysLoad('ts_index', config, serverDefaults)).toBe(true);
    });

    it('returns true for server-default tool', () => {
        expect(shouldAlwaysLoad('focus_search', config, serverDefaults)).toBe(true);
        expect(shouldAlwaysLoad('focus_list', config, serverDefaults)).toBe(true);
    });

    it('supports glob pattern in user pin list', () => {
        const configGlob = parseToolConfig({ tools: { alwaysLoad: ['ts_*'] } });
        expect(shouldAlwaysLoad('ts_index', configGlob, serverDefaults)).toBe(true);
        expect(shouldAlwaysLoad('ts_cleanup', configGlob, serverDefaults)).toBe(true);
        expect(shouldAlwaysLoad('sym_find', configGlob, serverDefaults)).toBe(false);
    });

    it('works with no server defaults', () => {
        const emptyDefaults = new Set<string>();
        expect(shouldAlwaysLoad('ts_index', config, emptyDefaults)).toBe(true);
        expect(shouldAlwaysLoad('focus_search', config, emptyDefaults)).toBe(false);
    });
});

// ---------- hideTool ----------

describe('hideTool', () => {
    it('adds pattern to hidden list and returns success message', async () => {
        const { io, written } = makeIO({ tools: { hidden: [], alwaysLoad: [] } });
        const result = await hideTool('sym_get', io);
        expect(result).toContain('added to hidden list');
        expect(written).toHaveBeenCalledWith(
            expect.objectContaining({
                tools: expect.objectContaining({ hidden: ['sym_get'] }),
            }),
        );
    });

    it('returns message if pattern already present', async () => {
        const { io, written } = makeIO({ tools: { hidden: ['sym_get'], alwaysLoad: [] } });
        const result = await hideTool('sym_get', io);
        expect(result).toContain('already in the hidden list');
        expect(written).not.toHaveBeenCalled();
    });

    it('preserves existing hidden entries', async () => {
        const { io, written } = makeIO({ tools: { hidden: ['existing_tool'], alwaysLoad: [] } });
        await hideTool('new_tool', io);
        expect(written).toHaveBeenCalledWith(
            expect.objectContaining({
                tools: expect.objectContaining({ hidden: ['existing_tool', 'new_tool'] }),
            }),
        );
    });
});

// ---------- showTool ----------

describe('showTool', () => {
    it('removes pattern from hidden list and returns success message', async () => {
        const { io, written } = makeIO({ tools: { hidden: ['sym_get'], alwaysLoad: [] } });
        const result = await showTool('sym_get', io);
        expect(result).toContain('removed from hidden list');
        expect(written).toHaveBeenCalledWith(
            expect.objectContaining({
                tools: expect.objectContaining({ hidden: [] }),
            }),
        );
    });

    it('returns message if pattern not in list', async () => {
        const { io, written } = makeIO({ tools: { hidden: [], alwaysLoad: [] } });
        const result = await showTool('sym_get', io);
        expect(result).toContain('was not in the hidden list');
        expect(written).not.toHaveBeenCalled();
    });
});

// ---------- pinTool ----------

describe('pinTool', () => {
    it('adds pattern to alwaysLoad list', async () => {
        const { io, written } = makeIO({ tools: { hidden: [], alwaysLoad: [] } });
        const result = await pinTool('ts_index', io);
        expect(result).toContain('added to alwaysLoad list');
        expect(written).toHaveBeenCalledWith(
            expect.objectContaining({
                tools: expect.objectContaining({ alwaysLoad: ['ts_index'] }),
            }),
        );
    });

    it('returns message if pattern already pinned', async () => {
        const { io, written } = makeIO({ tools: { hidden: [], alwaysLoad: ['ts_index'] } });
        const result = await pinTool('ts_index', io);
        expect(result).toContain('already in the alwaysLoad list');
        expect(written).not.toHaveBeenCalled();
    });
});

// ---------- unpinTool ----------

describe('unpinTool', () => {
    it('removes pattern from alwaysLoad list', async () => {
        const { io, written } = makeIO({ tools: { hidden: [], alwaysLoad: ['ts_index'] } });
        const result = await unpinTool('ts_index', io);
        expect(result).toContain('removed from alwaysLoad list');
        expect(written).toHaveBeenCalledWith(
            expect.objectContaining({
                tools: expect.objectContaining({ alwaysLoad: [] }),
            }),
        );
    });

    it('returns message if pattern not in list', async () => {
        const { io, written } = makeIO({ tools: { hidden: [], alwaysLoad: [] } });
        const result = await unpinTool('ts_index', io);
        expect(result).toContain('was not in the alwaysLoad list');
        expect(written).not.toHaveBeenCalled();
    });
});

// ---------- listToolsConfig ----------

describe('listToolsConfig', () => {
    it('returns (none) for empty lists', async () => {
        const { io } = makeIO({ tools: { hidden: [], alwaysLoad: [] } });
        const result = await listToolsConfig(io);
        expect(result).toContain('hidden:     (none)');
        expect(result).toContain('alwaysLoad: (none)');
    });

    it('lists hidden and alwaysLoad patterns', async () => {
        const { io } = makeIO({
            tools: { hidden: ['sym_get', 'fo_delete'], alwaysLoad: ['ts_index'] },
        });
        const result = await listToolsConfig(io);
        expect(result).toContain('hidden (2):');
        expect(result).toContain('  - sym_get');
        expect(result).toContain('  - fo_delete');
        expect(result).toContain('alwaysLoad (1):');
        expect(result).toContain('  - ts_index');
    });
});

// ---------- clearToolsConfig ----------

describe('clearToolsConfig', () => {
    it('resets both lists and returns success message', async () => {
        const { io, written } = makeIO({
            tools: { hidden: ['sym_get'], alwaysLoad: ['ts_index'] },
        });
        const result = await clearToolsConfig(io);
        expect(result).toContain('cleared');
        expect(written).toHaveBeenCalledWith(
            expect.objectContaining({
                tools: { hidden: [], alwaysLoad: [] },
            }),
        );
    });

    it('works on already-empty config', async () => {
        const { io, written } = makeIO({});
        const result = await clearToolsConfig(io);
        expect(result).toContain('cleared');
        expect(written).toHaveBeenCalled();
    });
});
