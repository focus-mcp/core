// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { CONCEPTS } from './concepts.ts';
import { getConcept, getHelpIndex } from './index.ts';

describe('CONCEPTS', () => {
    it('contains every documented concept key', () => {
        expect(Object.keys(CONCEPTS).sort()).toEqual([
            'benchmarks',
            'bootstrap',
            'brick',
            'catalog',
            'center',
            'filtering',
            'namespace',
        ]);
    });

    it('every concept has non-empty title and description', () => {
        for (const [key, concept] of Object.entries(CONCEPTS)) {
            expect(concept.title.length, `title for ${key}`).toBeGreaterThan(0);
            expect(concept.description.length, `description for ${key}`).toBeGreaterThan(20);
        }
    });

    it('concept content snapshot (catches unintended drift)', () => {
        expect(CONCEPTS).toMatchSnapshot();
    });
});

describe('getHelpIndex', () => {
    it('returns one entry per concept with key + title', () => {
        const index = getHelpIndex();
        expect(index.concepts).toHaveLength(Object.keys(CONCEPTS).length);
        for (const entry of index.concepts) {
            expect(CONCEPTS[entry.key]).toBeDefined();
            expect(CONCEPTS[entry.key]?.title).toBe(entry.title);
        }
    });

    it('includes the AGENT_GUIDE and README URLs', () => {
        const index = getHelpIndex();
        expect(index.agent_guide_url).toBe(
            'https://github.com/focus-mcp/cli/blob/main/docs/AGENT_GUIDE.md',
        );
        expect(index.readme_url).toBe('https://github.com/focus-mcp/cli/blob/main/README.md');
    });
});

describe('getConcept', () => {
    it('returns the matching concept when key exists', () => {
        const concept = getConcept('brick');
        expect(concept).not.toBeNull();
        expect(concept?.title).toBe('Brick');
    });

    it('returns null for an unknown key', () => {
        expect(getConcept('does-not-exist')).toBeNull();
    });

    it('returns null for an empty string', () => {
        expect(getConcept('')).toBeNull();
    });

    it('returns the same reference as CONCEPTS[key]', () => {
        const concept = getConcept('catalog');
        expect(concept).toBe(CONCEPTS['catalog']);
    });
});
