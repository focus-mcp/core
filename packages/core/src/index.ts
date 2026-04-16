// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

export {
    type CreateFocusMcpOptions,
    createFocusMcp,
    type FocusMcp,
} from './bootstrap/create-focus-mcp.ts';
export {
    DEFAULT_GUARDS,
    type EventBusOptions,
    InProcessEventBus,
} from './event-bus/event-bus.ts';
export {
    type BrickLoaderOptions,
    type BrickLoadFailure,
    type BrickLoadResult,
    type BrickSource,
    loadBricks,
} from './loader/brick-loader.ts';
export {
    ManifestError,
    type ManifestErrorCode,
    parseManifest,
} from './manifest/manifest.ts';
export {
    type Catalog,
    type CatalogBrick,
    type CatalogBrickSource,
    type CatalogOwner,
    type CatalogTool,
    compareSemver,
    findBrick,
    type InstalledBrick,
    listUpdates,
    parseCatalog,
    type UpdateInfo,
} from './marketplace/resolver.ts';
export { createLogger, rootLogger } from './observability/logger.ts';
export { getTracer, trace } from './observability/tracing.ts';
export { permissionProviderFromRegistry } from './registry/permission-provider.ts';
export { InMemoryRegistry } from './registry/registry.ts';
export { McpRouter, type McpRouterOptions } from './router/router.ts';
export * from './types/index.ts';
