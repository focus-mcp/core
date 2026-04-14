// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Router } from '../types/router.ts';
import type { McpInfo } from './types.ts';

/**
 * Adapte notre `Router` interne en `McpServer` du SDK officiel.
 * Expose `tools/list` et `tools/call` conformes à la spec MCP.
 */
export function createMcpServer(router: Router, info: McpInfo): Server {
  const server = new Server(
    { name: info.name, version: info.version },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () =>
    Promise.resolve({
      tools: router.listTools().map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    }),
  );

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await router.callTool(request.params.name, request.params.arguments);
    return {
      content: result.content.map((item) => {
        if (item.type === 'text') return { type: 'text' as const, text: item.text };
        return { type: 'text' as const, text: JSON.stringify(item.data) };
      }),
      isError: result.isError ?? false,
    };
  });

  return server;
}
