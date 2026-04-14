// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { ManifestError, parseManifest } from './manifest.ts';

const validRaw = {
  name: 'indexer',
  version: '1.0.0',
  description: 'Indexation filesystem avec cache',
  dependencies: [],
  tools: [
    {
      name: 'indexer_search',
      description: 'Recherche fichiers par pattern',
      inputSchema: {
        type: 'object',
        properties: { pattern: { type: 'string' } },
        required: ['pattern'],
      },
    },
  ],
};

describe('parseManifest — cas valides', () => {
  it('parse un manifeste minimal valide (objet)', () => {
    const manifest = parseManifest(validRaw);
    expect(manifest.name).toBe('indexer');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.tools).toHaveLength(1);
  });

  it('accepte une string JSON', () => {
    const manifest = parseManifest(JSON.stringify(validRaw));
    expect(manifest.name).toBe('indexer');
  });

  it('accepte les champs optionnels config et tags', () => {
    const manifest = parseManifest({
      ...validRaw,
      config: {
        phpVersion: { type: 'string', description: 'Version PHP', default: '8.3' },
      },
      tags: ['language', 'filesystem'],
    });
    expect(manifest.config?.['phpVersion']?.default).toBe('8.3');
    expect(manifest.tags).toEqual(['language', 'filesystem']);
  });

  it('accepte une version SemVer avec pre-release', () => {
    const manifest = parseManifest({ ...validRaw, version: '1.2.3-beta.1' });
    expect(manifest.version).toBe('1.2.3-beta.1');
  });

  it('accepte un nom multi-segments (focus-sf-router)', () => {
    const manifest = parseManifest({ ...validRaw, name: 'focus-sf-router' });
    expect(manifest.name).toBe('focus-sf-router');
  });
});

describe('parseManifest — erreurs JSON et forme', () => {
  it('INVALID_JSON : string non-JSON', () => {
    expect(() => parseManifest('{not json')).toThrow(ManifestError);
    try {
      parseManifest('{not json');
    } catch (err) {
      expect((err as ManifestError).code).toBe('INVALID_JSON');
    }
  });

  it('INVALID_SHAPE : pas un objet', () => {
    expect(() => parseManifest(null)).toThrow(
      expect.objectContaining({ name: 'ManifestError', code: 'INVALID_SHAPE' }),
    );
    expect(() => parseManifest(42)).toThrow(expect.objectContaining({ code: 'INVALID_SHAPE' }));
    expect(() => parseManifest([])).toThrow(expect.objectContaining({ code: 'INVALID_SHAPE' }));
  });
});

describe('parseManifest — validation name', () => {
  it('INVALID_NAME : manquant', () => {
    const { name: _, ...rest } = validRaw;
    expect(() => parseManifest(rest)).toThrow(expect.objectContaining({ code: 'INVALID_NAME' }));
  });

  it('INVALID_NAME : pas kebab-case', () => {
    expect(() => parseManifest({ ...validRaw, name: 'Indexer' })).toThrow(
      expect.objectContaining({ code: 'INVALID_NAME' }),
    );
    expect(() => parseManifest({ ...validRaw, name: 'indexer_v2' })).toThrow(
      expect.objectContaining({ code: 'INVALID_NAME' }),
    );
    expect(() => parseManifest({ ...validRaw, name: '' })).toThrow(
      expect.objectContaining({ code: 'INVALID_NAME' }),
    );
    expect(() => parseManifest({ ...validRaw, name: '1indexer' })).toThrow(
      expect.objectContaining({ code: 'INVALID_NAME' }),
    );
  });
});

describe('parseManifest — validation version', () => {
  it('INVALID_VERSION : pas SemVer', () => {
    expect(() => parseManifest({ ...validRaw, version: '1.0' })).toThrow(
      expect.objectContaining({ code: 'INVALID_VERSION' }),
    );
    expect(() => parseManifest({ ...validRaw, version: 'v1.0.0' })).toThrow(
      expect.objectContaining({ code: 'INVALID_VERSION' }),
    );
    expect(() => parseManifest({ ...validRaw, version: '' })).toThrow(
      expect.objectContaining({ code: 'INVALID_VERSION' }),
    );
  });
});

describe('parseManifest — validation tools', () => {
  it('INVALID_TOOL : tool sans name', () => {
    expect(() =>
      parseManifest({
        ...validRaw,
        tools: [{ description: 'x', inputSchema: { type: 'object' } }],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_TOOL' }));
  });

  it("INVALID_TOOL : inputSchema dont le type n'est pas 'object'", () => {
    expect(() =>
      parseManifest({
        ...validRaw,
        tools: [{ name: 'x', description: 'y', inputSchema: { type: 'string' } }],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_TOOL' }));
  });

  it('DUPLICATE_TOOL : deux tools avec le même name', () => {
    expect(() =>
      parseManifest({
        ...validRaw,
        tools: [
          { name: 'dup', description: 'a', inputSchema: { type: 'object' } },
          { name: 'dup', description: 'b', inputSchema: { type: 'object' } },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'DUPLICATE_TOOL' }));
  });

  it('accepte une liste de tools vide', () => {
    const manifest = parseManifest({ ...validRaw, tools: [] });
    expect(manifest.tools).toEqual([]);
  });
});

describe('parseManifest — validation dependencies', () => {
  it('INVALID_DEPENDENCY : dep pas kebab-case', () => {
    expect(() => parseManifest({ ...validRaw, dependencies: ['Indexer'] })).toThrow(
      expect.objectContaining({ code: 'INVALID_DEPENDENCY' }),
    );
  });

  it('INVALID_DEPENDENCY : dependencies pas un array', () => {
    expect(() => parseManifest({ ...validRaw, dependencies: 'indexer' })).toThrow(
      expect.objectContaining({ code: 'INVALID_DEPENDENCY' }),
    );
  });

  it('accepte plusieurs dépendances valides', () => {
    const manifest = parseManifest({
      ...validRaw,
      dependencies: ['indexer', 'cache', 'focus-sf-router'],
    });
    expect(manifest.dependencies).toEqual(['indexer', 'cache', 'focus-sf-router']);
  });
});
