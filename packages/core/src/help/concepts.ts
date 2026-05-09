// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * FocusMCP concepts dictionary — pure constants, source-of-truth for `focus_help`.
 *
 * Concepts are hardcoded here (no file IO) so the help module stays
 * runtime-agnostic and trivial to test. Update this file when a concept
 * changes; tests snapshot it to catch unintended drift.
 */

export interface Concept {
    readonly title: string;
    readonly description: string;
}

export const CONCEPTS: Record<string, Concept> = {
    brick: {
        title: 'Brick',
        description:
            "An atomic MCP module covering one domain (git, files, code-intel, etc.). FocusMCP composes bricks on demand to keep the agent's context lean. Each brick exposes its own MCP tools via a manifest.",
    },
    catalog: {
        title: 'Catalog',
        description:
            'A JSON document listing available bricks with metadata (name, version, keywords, recommendedFor). Default catalog is hosted at https://focus-mcp.github.io/marketplace/catalog.json. Multi-source: users can add private/team catalogs in ~/.focus/catalogs.json.',
    },
    center: {
        title: 'Center',
        description:
            "The user's brick manifest at ~/.focus/center.json. Lists installed bricks with version + enabled flag. FocusMCP reads this on start to know which bricks to load.",
    },
    namespace: {
        title: 'Namespace',
        description:
            'Tools follow <brick>_<action> naming (e.g. git_log, files_read). Plus the orchestrator hub: focus_bricks_*, focus_catalog_*, focus_tools_*, focus_init, focus_help.',
    },
    filtering: {
        title: 'Tool filtering',
        description:
            'Hide/show/pin/unpin individual tools or globs. Persisted in ~/.focus/config.json. Tools: focus_tools_hide, focus_tools_show, focus_tools_pin, focus_tools_unpin, focus_tools_list.',
    },
    bootstrap: {
        title: 'Bootstrap',
        description:
            'First-time setup of FocusMCP for a project. Use focus_init to detect the stack and get brick recommendations. Then focus_bricks_install for each recommended brick.',
    },
    benchmarks: {
        title: 'Benchmarks',
        description:
            'Every brick is benchmarked deterministically (Math.ceil(JSON.stringify(output).length / 4)) against a stable test fixture. Results: https://github.com/focus-mcp/marketplace/blob/main/benchmarks/equivalence-report.md',
    },
};
