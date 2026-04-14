// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import type { BrickManifest, ConfigField } from '../types/manifest.ts';
import type { JsonSchema, ToolDefinition } from '../types/tool.ts';

export type ManifestErrorCode =
  | 'INVALID_JSON'
  | 'INVALID_SHAPE'
  | 'INVALID_NAME'
  | 'INVALID_VERSION'
  | 'INVALID_DESCRIPTION'
  | 'INVALID_TOOL'
  | 'DUPLICATE_TOOL'
  | 'INVALID_DEPENDENCY'
  | 'INVALID_CONFIG'
  | 'INVALID_TAGS';

export class ManifestError extends Error {
  constructor(
    message: string,
    public readonly code: ManifestErrorCode,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ManifestError';
  }
}

const KEBAB_NAME = /^[a-z][a-z0-9-]*$/;
// SemVer 2.0 (core) + optional pre-release / build metadata
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const CONFIG_TYPES: ReadonlySet<string> = new Set([
  'string',
  'number',
  'boolean',
  'array',
  'object',
]);

const SCHEMA_PROP_TYPES: ReadonlySet<string> = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'array',
  'object',
]);

export function parseManifest(raw: unknown): BrickManifest {
  const obj = coerceToObject(raw);

  const name = validateName(obj['name']);
  const version = validateVersion(obj['version']);
  const description = validateDescription(obj['description']);
  const dependencies = validateDependencies(obj['dependencies']);
  const tools = validateTools(obj['tools']);

  const manifest: Mutable<BrickManifest> = {
    name,
    version,
    description,
    dependencies,
    tools,
  };

  if (obj['config'] !== undefined) {
    manifest.config = validateConfig(obj['config']);
  }
  if (obj['tags'] !== undefined) {
    manifest.tags = validateTags(obj['tags']);
  }

  return manifest as BrickManifest;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function coerceToObject(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      return coerceToObject(parsed);
    } catch (err) {
      throw new ManifestError('Invalid JSON', 'INVALID_JSON', {
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ManifestError('Manifest must be a JSON object', 'INVALID_SHAPE', {
      type: Array.isArray(raw) ? 'array' : raw === null ? 'null' : typeof raw,
    });
  }
  return raw as Record<string, unknown>;
}

function validateName(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ManifestError('Manifest.name must be a non-empty string', 'INVALID_NAME');
  }
  if (!KEBAB_NAME.test(value)) {
    throw new ManifestError(
      `Manifest.name "${value}" must be kebab-case starting with a letter (e.g. "focus-indexer")`,
      'INVALID_NAME',
      { value },
    );
  }
  return value;
}

function validateVersion(value: unknown): string {
  if (typeof value !== 'string' || !SEMVER.test(value)) {
    throw new ManifestError(
      'Manifest.version must follow SemVer 2.0 (e.g. "1.2.3", "1.0.0-beta.1")',
      'INVALID_VERSION',
      { value },
    );
  }
  return value;
}

function validateDescription(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ManifestError(
      'Manifest.description must be a non-empty string',
      'INVALID_DESCRIPTION',
    );
  }
  return value;
}

function validateDependencies(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new ManifestError(
      'Manifest.dependencies must be an array of brick names',
      'INVALID_DEPENDENCY',
      { value },
    );
  }
  for (const dep of value) {
    if (typeof dep !== 'string' || !KEBAB_NAME.test(dep)) {
      throw new ManifestError(
        `Invalid dependency "${String(dep)}": must be a kebab-case brick name`,
        'INVALID_DEPENDENCY',
        { dep },
      );
    }
  }
  return [...(value as string[])];
}

function validateTools(value: unknown): readonly ToolDefinition[] {
  if (!Array.isArray(value)) {
    throw new ManifestError('Manifest.tools must be an array', 'INVALID_TOOL', { value });
  }
  const seen = new Set<string>();
  const tools: ToolDefinition[] = [];
  for (const rawTool of value) {
    const tool = validateTool(rawTool);
    if (seen.has(tool.name)) {
      throw new ManifestError(`Duplicate tool name "${tool.name}"`, 'DUPLICATE_TOOL', {
        name: tool.name,
      });
    }
    seen.add(tool.name);
    tools.push(tool);
  }
  return tools;
}

function validateTool(raw: unknown): ToolDefinition {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ManifestError('Tool entry must be an object', 'INVALID_TOOL');
  }
  const rec = raw as Record<string, unknown>;
  const name = rec['name'];
  const description = rec['description'];
  const inputSchema = rec['inputSchema'];

  if (typeof name !== 'string' || name.length === 0) {
    throw new ManifestError('Tool.name must be a non-empty string', 'INVALID_TOOL', { tool: rec });
  }
  if (typeof description !== 'string' || description.length === 0) {
    throw new ManifestError(`Tool "${name}" must have a non-empty description`, 'INVALID_TOOL', {
      tool: name,
    });
  }
  const schema = validateInputSchema(inputSchema, name);

  return { name, description, inputSchema: schema };
}

function validateInputSchema(raw: unknown, toolName: string): JsonSchema {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ManifestError(
      `Tool "${toolName}" inputSchema must be a JSON Schema object`,
      'INVALID_TOOL',
      { tool: toolName },
    );
  }
  const rec = raw as Record<string, unknown>;
  if (rec['type'] !== 'object') {
    throw new ManifestError(
      `Tool "${toolName}" inputSchema.type must be "object"`,
      'INVALID_TOOL',
      { tool: toolName, got: rec['type'] },
    );
  }
  validateSchemaProperties(rec['properties'], toolName);
  return raw as JsonSchema;
}

function validateSchemaProperties(raw: unknown, toolName: string): void {
  if (raw === undefined) return;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ManifestError(
      `Tool "${toolName}" inputSchema.properties must be an object`,
      'INVALID_TOOL',
      { tool: toolName },
    );
  }
  for (const [propName, propDef] of Object.entries(raw as Record<string, unknown>)) {
    if (propDef === null || typeof propDef !== 'object') {
      throw new ManifestError(
        `Tool "${toolName}" property "${propName}" must be an object`,
        'INVALID_TOOL',
        { tool: toolName, property: propName },
      );
    }
    const t = (propDef as Record<string, unknown>)['type'];
    if (typeof t !== 'string' || !SCHEMA_PROP_TYPES.has(t)) {
      throw new ManifestError(
        `Tool "${toolName}" property "${propName}" has invalid type "${String(t)}"`,
        'INVALID_TOOL',
        { tool: toolName, property: propName, type: t },
      );
    }
  }
}

function validateConfig(raw: unknown): Readonly<Record<string, ConfigField>> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ManifestError('Manifest.config must be an object', 'INVALID_CONFIG');
  }
  const result: Record<string, ConfigField> = {};
  for (const [key, def] of Object.entries(raw as Record<string, unknown>)) {
    result[key] = validateConfigField(key, def);
  }
  return result;
}

function validateConfigField(key: string, raw: unknown): ConfigField {
  if (raw === null || typeof raw !== 'object') {
    throw new ManifestError(`Config field "${key}" must be an object`, 'INVALID_CONFIG', {
      field: key,
    });
  }
  const rec = raw as Record<string, unknown>;
  const type = rec['type'];
  const description = rec['description'];
  if (typeof type !== 'string' || !CONFIG_TYPES.has(type)) {
    throw new ManifestError(
      `Config field "${key}" has invalid type "${String(type)}"`,
      'INVALID_CONFIG',
      { field: key, type },
    );
  }
  if (typeof description !== 'string' || description.length === 0) {
    throw new ManifestError(
      `Config field "${key}" must have a non-empty description`,
      'INVALID_CONFIG',
      { field: key },
    );
  }
  const field: Mutable<ConfigField> = { type: type as ConfigField['type'], description };
  if (rec['default'] !== undefined) field.default = rec['default'];
  if (rec['required'] !== undefined) {
    if (typeof rec['required'] !== 'boolean') {
      throw new ManifestError(`Config field "${key}".required must be boolean`, 'INVALID_CONFIG', {
        field: key,
      });
    }
    field.required = rec['required'];
  }
  return field as ConfigField;
}

function validateTags(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) {
    throw new ManifestError('Manifest.tags must be an array of strings', 'INVALID_TAGS');
  }
  for (const tag of raw) {
    if (typeof tag !== 'string' || tag.length === 0) {
      throw new ManifestError('Each manifest tag must be a non-empty string', 'INVALID_TAGS', {
        tag,
      });
    }
  }
  return [...(raw as string[])];
}
