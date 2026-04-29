// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

export {
    type CreateFocusMcpOptions,
    createFocusMcp,
    type FocusMcp,
} from './bootstrap/create-focus-mcp.ts';
export {
    clearToolsConfig,
    hideTool,
    isToolHidden,
    listToolsConfig,
    matchesToolPattern,
    parseToolConfig,
    pinTool,
    shouldAlwaysLoad,
    showTool,
    type ToolConfigData,
    type ToolConfigIO,
    unpinTool,
} from './config/tool-config.ts';
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
    type AggregatedBrick,
    type AggregatedCatalog,
    aggregateCatalogs,
    type FetchIO,
    type FetchResult,
    fetchAllCatalogs,
    fetchCatalog,
    findBrickAcrossCatalogs,
    searchBricks,
} from './marketplace/catalog-fetcher.ts';
export {
    addSource,
    type CatalogSource,
    type CatalogStoreData,
    type CatalogStoreIO,
    createDefaultStore,
    DEFAULT_CATALOG_URL,
    disableSource,
    enableSource,
    getEnabledSources,
    listSources,
    parseCatalogStore,
    type RemoveSourceOptions,
    removeSource,
} from './marketplace/catalog-store.ts';
export {
    type CenterEntry,
    type CenterJson,
    type CenterLock,
    type CenterLockEntry,
    executeInstall,
    executeRemove,
    type InstallerIO,
    type InstallPlan,
    parseCenterJson,
    parseCenterLock,
    planInstall,
    planRemove,
    satisfiesRange,
    serializeCenterJson,
    serializeCenterLock,
} from './marketplace/installer.ts';
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
export {
    type ExecuteUpgradeInput,
    executeUpgrade,
    type PlanUpgradeInput,
    planUpgrade,
    type UpgradeIO,
    type UpgradeItem,
    type UpgradeResult,
} from './marketplace/upgrader.ts';
export {
    type BrickUpdateInfo,
    checkForUpdates,
    type CliUpdateInfo,
    type UpdateCheckIO,
    type UpdateCheckOptions,
    type UpdateCheckResult,
} from './marketplace/update-checker.ts';
export { createLogger, rootLogger } from './observability/logger.ts';
export { getTracer, trace } from './observability/tracing.ts';
export { permissionProviderFromRegistry } from './registry/permission-provider.ts';
export { InMemoryRegistry } from './registry/registry.ts';
export { McpRouter, type McpRouterOptions } from './router/router.ts';
export * from './types/index.ts';
