// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { randomUUID } from 'node:crypto';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import type { Server as McpSdkServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport as McpTransport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { createLogger } from '../observability/logger.ts';
import { createMcpServer } from './mcp-adapter.ts';
import type { HttpTransportOptions, ListeningAddress, TransportListening } from './types.ts';

const logger = createLogger('http-transport');
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_ENDPOINT = '/mcp';

/**
 * Transport HTTP + HTTPS pour FocusMCP.
 *
 * Expose l'endpoint MCP Streamable HTTP sur deux serveurs en parallèle :
 * - HTTP (config `http`)
 * - HTTPS (config `https`)
 *
 * Les deux partagent le même `StreamableHTTPServerTransport` du SDK officiel,
 * garantissant la conformité à la spec MCP 2025-03-26.
 */
export class HttpTransport {
  readonly #options: HttpTransportOptions;
  readonly #endpointPath: string;
  readonly #mcpServer: McpSdkServer;
  readonly #mcpTransport: StreamableHTTPServerTransport;

  #httpServer: http.Server | undefined;
  #httpsServer: https.Server | undefined;
  #started = false;

  constructor(options: HttpTransportOptions) {
    this.#options = options;
    this.#endpointPath = options.endpointPath ?? DEFAULT_ENDPOINT;
    this.#mcpServer = createMcpServer(options.router, options.info);
    this.#mcpTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
  }

  async start(): Promise<TransportListening> {
    if (this.#started) {
      throw new Error('HttpTransport already started');
    }
    // SDK's Transport type is strict; our transport has optional callbacks — safe to cast.
    await this.#mcpServer.connect(this.#mcpTransport as unknown as McpTransport);

    const handler = this.#buildHandler();

    this.#httpServer = http.createServer(handler);
    const httpAddr = await this.#listen(
      this.#httpServer,
      this.#options.http.port,
      this.#options.http.host ?? DEFAULT_HOST,
    );

    this.#httpsServer = https.createServer(
      { cert: this.#options.https.cert, key: this.#options.https.key },
      handler,
    );
    const httpsAddr = await this.#listen(
      this.#httpsServer,
      this.#options.https.port,
      this.#options.https.host ?? DEFAULT_HOST,
    );

    this.#started = true;
    logger.info({ http: httpAddr, https: httpsAddr }, 'HttpTransport listening');
    return { http: httpAddr, https: httpsAddr };
  }

  async stop(): Promise<void> {
    if (!this.#started) return;
    await Promise.all([this.#closeServer(this.#httpServer), this.#closeServer(this.#httpsServer)]);
    await this.#mcpTransport.close();
    await this.#mcpServer.close();
    this.#httpServer = undefined;
    this.#httpsServer = undefined;
    this.#started = false;
  }

  #buildHandler(): (req: IncomingMessage, res: ServerResponse) => void {
    return (req, res): void => {
      const url = req.url ?? '/';
      if (!url.startsWith(this.#endpointPath)) {
        res.statusCode = 404;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'Not Found', path: url }));
        return;
      }
      this.#mcpTransport.handleRequest(req, res).catch((err: unknown) => {
        logger.error({ err, url }, 'handleRequest error');
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end();
        }
      });
    };
  }

  async #listen(
    server: http.Server | https.Server,
    port: number,
    host: string,
  ): Promise<ListeningAddress> {
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error): void => {
        server.off('listening', onListening);
        reject(err);
      };
      const onListening = (): void => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    });
    const addr = server.address() as AddressInfo;
    return { host: addr.address, port: addr.port };
  }

  async #closeServer(server: http.Server | https.Server | undefined): Promise<void> {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
