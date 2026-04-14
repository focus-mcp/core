// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import type { Router } from '../types/router.ts';

export interface McpInfo {
  readonly name: string;
  readonly version: string;
}

export interface HttpListenerOptions {
  /** Port d'écoute. 0 = port aléatoire assigné par l'OS. */
  readonly port: number;
  /** Host d'écoute (défaut : 127.0.0.1). */
  readonly host?: string;
}

export interface HttpsListenerOptions extends HttpListenerOptions {
  /** Certificat TLS (PEM). */
  readonly cert: string | Buffer;
  /** Clé privée TLS (PEM). */
  readonly key: string | Buffer;
}

export interface HttpTransportOptions {
  readonly router: Router;
  readonly info: McpInfo;
  /** Configuration HTTP (obligatoire). */
  readonly http: HttpListenerOptions;
  /** Configuration HTTPS (obligatoire). */
  readonly https: HttpsListenerOptions;
  /** Path de l'endpoint MCP (défaut : `/mcp`). */
  readonly endpointPath?: string;
}

export interface ListeningAddress {
  readonly host: string;
  readonly port: number;
}

export interface TransportListening {
  readonly http: ListeningAddress;
  readonly https: ListeningAddress;
}
