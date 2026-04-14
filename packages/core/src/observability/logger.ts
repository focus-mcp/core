// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import pino, { type Logger, type LoggerOptions } from 'pino';

const SECRET_PATHS = [
  'password',
  'token',
  'secret',
  'apiKey',
  'authorization',
  '*.password',
  '*.token',
  '*.secret',
  '*.apiKey',
  'headers.authorization',
  'headers.cookie',
];

const baseOptions: LoggerOptions = {
  level: process.env['FOCUS_LOG_LEVEL'] ?? 'info',
  redact: {
    paths: SECRET_PATHS,
    censor: '[REDACTED]',
  },
  base: {
    service: 'focusmcp',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

export const rootLogger: Logger = pino(baseOptions);

export function createLogger(component: string, bindings: Record<string, unknown> = {}): Logger {
  return rootLogger.child({ component, ...bindings });
}
