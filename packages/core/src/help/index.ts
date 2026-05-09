// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * help/ — public façade for the `focus_help` MCP tool.
 *
 * Returns a small, browser-compatible help index plus per-concept lookup.
 * No file IO — all content lives in concepts.ts.
 */

import { CONCEPTS, type Concept } from './concepts.ts';

export type { Concept } from './concepts.ts';
export { CONCEPTS } from './concepts.ts';

export interface HelpIndex {
    readonly concepts: readonly { readonly key: string; readonly title: string }[];
    readonly agent_guide_url: string;
    readonly readme_url: string;
}

export function getHelpIndex(): HelpIndex {
    return {
        concepts: Object.entries(CONCEPTS).map(([key, c]) => ({ key, title: c.title })),
        agent_guide_url: 'https://github.com/focus-mcp/cli/blob/main/docs/AGENT_GUIDE.md',
        readme_url: 'https://github.com/focus-mcp/cli/blob/main/README.md',
    };
}

export function getConcept(key: string): Concept | null {
    return CONCEPTS[key] ?? null;
}
