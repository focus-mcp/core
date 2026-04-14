// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

export { DEFAULT_GUARDS, InProcessEventBus } from './event-bus/event-bus.ts';
export { createLogger, rootLogger } from './observability/logger.ts';
export { getTracer, trace } from './observability/tracing.ts';
export { InMemoryRegistry } from './registry/registry.ts';
export { McpRouter, type McpRouterOptions } from './router/router.ts';
export { HttpTransport } from './transport/http-transport.ts';
export { createMcpServer } from './transport/mcp-adapter.ts';
export type {
  HttpListenerOptions,
  HttpsListenerOptions,
  HttpTransportOptions,
  ListeningAddress,
  McpInfo,
  TransportListening,
} from './transport/types.ts';
export * from './types/index.ts';
