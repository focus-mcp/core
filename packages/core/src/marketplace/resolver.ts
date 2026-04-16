// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * Marketplace resolver — pure, browser-compatible.
 *
 * Parses and queries a `catalog.json` as published by the FocusMCP
 * marketplace. Does no I/O: the host injects raw JSON (fetched from
 * `https://marketplace.focusmcp.dev/catalog.json` or a tiers mirror)
 * and this module validates, normalizes and queries it.
 *
 * Aligned with the published JSON Schema `schemas/catalog/v1.json`.
 */

export interface CatalogOwner {
  readonly name: string;
  readonly url?: string;
  readonly email?: string;
}

export interface CatalogTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema?: unknown;
}

export type CatalogBrickSource =
  | { readonly type: 'local'; readonly path: string }
  | { readonly type: 'url'; readonly url: string; readonly sha?: string }
  | {
      readonly type: 'git-subdir';
      readonly url: string;
      readonly path: string;
      readonly ref: string;
      readonly sha?: string;
    };

export interface CatalogBrick {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly tags?: readonly string[];
  readonly dependencies: readonly string[];
  readonly tools: readonly CatalogTool[];
  readonly source: CatalogBrickSource;
  readonly tarballUrl?: string;
  readonly integrity?: string;
  readonly publishedAt?: string;
  readonly license?: string;
  readonly homepage?: string;
  readonly publisher?: string;
}

export interface Catalog {
  readonly $schema?: string;
  readonly name: string;
  readonly description?: string;
  readonly owner: CatalogOwner;
  readonly updated: string;
  readonly bricks: readonly CatalogBrick[];
}

export interface InstalledBrick {
  readonly name: string;
  readonly version: string;
}

export interface UpdateInfo {
  readonly name: string;
  readonly installed: string;
  readonly available: string;
}

// ---------- Constants ----------

const KEBAB_NAME = /^[a-z][a-z0-9-]*$/;
// SemVer 2.0 — strict pre-release (no leading-zero numeric identifiers) + optional build metadata.
// Groups: 1=major, 2=minor, 3=patch, 4=pre-release (without the leading dash).
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

// ---------- parseCatalog ----------

export function parseCatalog(raw: unknown): Catalog {
  const obj = requireObject(raw, 'catalog');
  const name = requireString(obj, 'name', 'catalog');
  const owner = requireObject(obj['owner'], 'catalog.owner');
  const ownerName = requireString(owner, 'name', 'catalog.owner');
  const updated = requireString(obj, 'updated', 'catalog');
  const bricksRaw = obj['bricks'];
  if (!Array.isArray(bricksRaw)) {
    throw new Error('catalog.bricks must be an array');
  }
  const bricks = bricksRaw.map((b, i) => parseBrick(b, i));

  const schema = optionalString(obj, '$schema', 'catalog');
  const description = optionalString(obj, 'description', 'catalog');
  const ownerUrl = optionalString(owner, 'url', 'catalog.owner');
  const ownerEmail = optionalString(owner, 'email', 'catalog.owner');

  return {
    name,
    owner: {
      name: ownerName,
      ...(ownerUrl !== undefined ? { url: ownerUrl } : {}),
      ...(ownerEmail !== undefined ? { email: ownerEmail } : {}),
    },
    updated,
    bricks,
    ...(schema !== undefined ? { $schema: schema } : {}),
    ...(description !== undefined ? { description } : {}),
  };
}

function parseBrick(raw: unknown, index: number): CatalogBrick {
  const loc = `bricks[${index}]`;
  const obj = requireObject(raw, loc);
  const name = requireString(obj, 'name', loc);
  if (!KEBAB_NAME.test(name)) {
    throw new Error(`${loc}.name "${name}" is not kebab-case`);
  }
  const version = requireString(obj, 'version', loc);
  if (!SEMVER.test(version)) {
    throw new Error(`${loc}.version "${version}" is not a valid semver`);
  }
  const description = requireString(obj, 'description', loc);
  const dependencies = requireStringArray(obj, 'dependencies', loc);
  const tools = requireArray(obj, 'tools', loc).map((t, ti) => parseTool(t, loc, ti));
  const source = parseSource(obj['source'], loc);
  const tags = optionalStringArray(obj, 'tags', loc);
  const tarballUrl = optionalString(obj, 'tarballUrl', loc);
  const integrity = optionalString(obj, 'integrity', loc);
  const publishedAt = optionalString(obj, 'publishedAt', loc);
  const license = optionalString(obj, 'license', loc);
  const homepage = optionalString(obj, 'homepage', loc);
  const publisher = optionalString(obj, 'publisher', loc);

  return {
    name,
    version,
    description,
    dependencies,
    tools,
    source,
    ...(tags !== undefined ? { tags } : {}),
    ...(tarballUrl !== undefined ? { tarballUrl } : {}),
    ...(integrity !== undefined ? { integrity } : {}),
    ...(publishedAt !== undefined ? { publishedAt } : {}),
    ...(license !== undefined ? { license } : {}),
    ...(homepage !== undefined ? { homepage } : {}),
    ...(publisher !== undefined ? { publisher } : {}),
  };
}

function parseTool(raw: unknown, parentLoc: string, toolIndex: number): CatalogTool {
  const loc = `${parentLoc}.tools[${toolIndex}]`;
  const obj = requireObject(raw, loc);
  const inputSchema = obj['inputSchema'];
  return {
    name: requireString(obj, 'name', loc),
    description: requireString(obj, 'description', loc),
    ...(inputSchema !== undefined ? { inputSchema } : {}),
  };
}

function parseSource(raw: unknown, parentLoc: string): CatalogBrickSource {
  const loc = `${parentLoc}.source`;
  const obj = requireObject(raw, loc);
  const type = obj['type'];
  if (type === 'local') {
    return { type: 'local', path: requireString(obj, 'path', loc) };
  }
  if (type === 'url') {
    const sha = optionalString(obj, 'sha', loc);
    return {
      type: 'url',
      url: requireString(obj, 'url', loc),
      ...(sha !== undefined ? { sha } : {}),
    };
  }
  if (type === 'git-subdir') {
    const sha = optionalString(obj, 'sha', loc);
    return {
      type: 'git-subdir',
      url: requireString(obj, 'url', loc),
      path: requireString(obj, 'path', loc),
      ref: requireString(obj, 'ref', loc),
      ...(sha !== undefined ? { sha } : {}),
    };
  }
  throw new Error(
    `${loc}.type must be "local", "url" or "git-subdir", got ${JSON.stringify(type)}`,
  );
}

// ---------- findBrick ----------

export function findBrick(catalog: Catalog, name: string): CatalogBrick | undefined {
  return catalog.bricks.find((b) => b.name === name);
}

// ---------- compareSemver ----------

/** -1 if a < b, 0 if equal, 1 if a > b. Throws on malformed input. Build metadata is ignored per SemVer 2.0 §10. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSemver(a);
  const pb = parseSemver(b);

  for (let i = 0; i < 3; i++) {
    const av = pa.core[i] as number;
    const bv = pb.core[i] as number;
    if (av !== bv) return av < bv ? -1 : 1;
  }

  // Core equal — compare pre-release per semver §11.
  if (pa.pre === undefined && pb.pre === undefined) return 0;
  if (pa.pre === undefined) return 1; // non-pre > pre
  if (pb.pre === undefined) return -1;
  return comparePreRelease(pa.pre, pb.pre);
}

function parseSemver(version: string): {
  readonly core: readonly [number, number, number];
  readonly pre: string | undefined;
} {
  const match = SEMVER.exec(version);
  if (!match) throw new Error(`"${version}" is not a valid semver`);
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])] as const,
    pre: match[4],
  };
}

function comparePreRelease(a: string, b: string): -1 | 0 | 1 {
  const as = a.split('.');
  const bs = b.split('.');
  const maxLen = Math.max(as.length, bs.length);
  for (let i = 0; i < maxLen; i++) {
    const cmp = comparePreReleaseId(as[i], bs[i]);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

function comparePreReleaseId(a: string | undefined, b: string | undefined): -1 | 0 | 1 {
  // Per semver §11.4.4: shorter set of identifiers is lower.
  if (a === undefined) return -1;
  if (b === undefined) return 1;
  const an = /^\d+$/.test(a);
  const bn = /^\d+$/.test(b);
  if (an && bn) {
    const ai = Number(a);
    const bi = Number(b);
    if (ai === bi) return 0;
    return ai < bi ? -1 : 1;
  }
  if (an) return -1; // numeric < non-numeric
  if (bn) return 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// ---------- listUpdates ----------

export function listUpdates(
  installed: readonly InstalledBrick[],
  catalog: Catalog,
): readonly UpdateInfo[] {
  const updates: UpdateInfo[] = [];
  for (const inst of installed) {
    const entry = findBrick(catalog, inst.name);
    if (!entry) continue;
    if (compareSemver(entry.version, inst.version) === 1) {
      updates.push({ name: inst.name, installed: inst.version, available: entry.version });
    }
  }
  return updates;
}

// ---------- helpers ----------

function requireObject(raw: unknown, loc: string): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${loc} must be an object`);
  }
  return raw as Record<string, unknown>;
}

function requireString(obj: Record<string, unknown>, key: string, parentLoc: string): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${parentLoc}.${key} must be a non-empty string`);
  }
  return value;
}

function optionalString(
  obj: Record<string, unknown>,
  key: string,
  parentLoc: string,
): string | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new Error(`${parentLoc}.${key} must be a string when provided`);
  }
  return value;
}

function requireArray(
  obj: Record<string, unknown>,
  key: string,
  parentLoc: string,
): readonly unknown[] {
  const value = obj[key];
  if (!Array.isArray(value)) throw new Error(`${parentLoc}.${key} must be an array`);
  return value;
}

function requireStringArray(
  obj: Record<string, unknown>,
  key: string,
  parentLoc: string,
): readonly string[] {
  const arr = requireArray(obj, key, parentLoc);
  for (const item of arr) {
    if (typeof item !== 'string') {
      throw new Error(`${parentLoc}.${key} must contain only strings`);
    }
  }
  return arr as readonly string[];
}

function optionalStringArray(
  obj: Record<string, unknown>,
  key: string,
  parentLoc: string,
): readonly string[] | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  return requireStringArray(obj, key, parentLoc);
}
