// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig({
  resolve: {
    alias: {
      '@focusmcp/core': resolve(projectRoot, 'packages/core/src/index.ts'),
      '@focusmcp/sdk': resolve(projectRoot, 'packages/sdk/src/index.ts'),
      '@focusmcp/validator': resolve(projectRoot, 'packages/validator/src/index.ts'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    root: projectRoot,
    include: ['packages/**/*.{test,spec}.ts', 'packages/**/__tests__/**/*.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.stryker-tmp/**'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: resolve(projectRoot, 'coverage'),
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.d.ts',
        '**/index.ts',
        '**/types/**',
        '**/__tests__/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        'packages/core/src/event-bus/**': {
          lines: 95,
          functions: 95,
          branches: 90,
          statements: 95,
        },
        'packages/core/src/registry/**': {
          lines: 95,
          functions: 95,
          branches: 95,
          statements: 95,
        },
      },
    },
  },
});
