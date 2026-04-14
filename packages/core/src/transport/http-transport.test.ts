// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport as McpTransport } from '@modelcontextprotocol/sdk/shared/transport.js';
import selfsigned from 'selfsigned';
import { Agent, fetch as undiciFetch } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InProcessEventBus } from '../event-bus/event-bus.ts';
import { InMemoryRegistry } from '../registry/registry.ts';
import { McpRouter } from '../router/router.ts';
import type { Brick } from '../types/brick.ts';
import { HttpTransport } from './http-transport.ts';
import type { TransportListening } from './types.ts';

function makeEchoBrick(): Brick {
  return {
    manifest: {
      name: 'echo',
      version: '1.0.0',
      description: 'Echo test brick',
      dependencies: [],
      tools: [{ name: 'echo_ping', description: 'ping', inputSchema: { type: 'object' } }],
    },
    start: () => {},
    stop: () => {},
  };
}

function generateSelfSignedPair(): { cert: string; key: string } {
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = selfsigned.generate(attrs, { days: 1, keySize: 2048 });
  return { cert: pems.cert, key: pems.private };
}

describe('HttpTransport', () => {
  let transport: HttpTransport;
  let listening: TransportListening;

  beforeEach(async () => {
    const registry = new InMemoryRegistry();
    const bus = new InProcessEventBus();
    const router = new McpRouter({ registry, bus });

    registry.register(makeEchoBrick());
    registry.setStatus('echo', 'running');
    bus.handle('echo:echo_ping', () => ({ content: [{ type: 'text', text: 'pong' }] }));

    const tls = generateSelfSignedPair();
    transport = new HttpTransport({
      router,
      info: { name: 'focusmcp-test', version: '0.0.0' },
      http: { port: 0 },
      https: { port: 0, cert: tls.cert, key: tls.key },
    });
    listening = await transport.start();
  });

  afterEach(async () => {
    await transport.stop();
  });

  it("démarre HTTP et HTTPS sur des ports distincts attribués par l'OS", () => {
    expect(listening.http.port).toBeGreaterThan(0);
    expect(listening.https.port).toBeGreaterThan(0);
    expect(listening.http.port).not.toBe(listening.https.port);
  });

  it('retourne 404 sur un path non-MCP', async () => {
    const res = await undiciFetch(`http://127.0.0.1:${listening.http.port}/unknown`);
    expect(res.status).toBe(404);
  });

  it('expose tools/list via le SDK client MCP sur HTTP', async () => {
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const clientTransport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${listening.http.port}/mcp`),
    );
    await client.connect(clientTransport as unknown as McpTransport);

    const result = await client.listTools();

    expect(result.tools.map((t) => t.name)).toContain('echo_ping');
    await client.close();
  });

  it('exécute tools/call via le SDK client MCP sur HTTP', async () => {
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const clientTransport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${listening.http.port}/mcp`),
    );
    await client.connect(clientTransport as unknown as McpTransport);

    const result = await client.callTool({ name: 'echo_ping', arguments: {} });

    expect(result.content).toEqual([{ type: 'text', text: 'pong' }]);
    await client.close();
  });

  it('expose tools/list via HTTPS (self-signed cert)', async () => {
    const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });
    const insecureFetch: typeof fetch = ((url: string | URL | Request, init?: RequestInit) =>
      undiciFetch(url as string, { ...init, dispatcher: insecureAgent } as never)) as typeof fetch;

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const clientTransport = new StreamableHTTPClientTransport(
      new URL(`https://127.0.0.1:${listening.https.port}/mcp`),
      { fetch: insecureFetch },
    );
    await client.connect(clientTransport as unknown as McpTransport);

    const result = await client.listTools();

    expect(result.tools.map((t) => t.name)).toContain('echo_ping');
    await client.close();
    await insecureAgent.close();
  });

  it('rejette un second start()', async () => {
    await expect(transport.start()).rejects.toThrow(/already started/i);
  });
});
