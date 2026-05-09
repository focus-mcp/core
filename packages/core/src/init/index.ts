// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * init/ — public façade for project bootstrap detection.
 *
 * Used by `@focus-mcp/cli`'s `focus_init` MCP tool. The CLI implements the
 * ProjectFiles interface against `node:fs`; the core stays browser-compatible.
 */

import { type DetectedStack, detectStack, type ProjectFiles } from './detect-stack.ts';
import { type BrickRecommendation, recommendBricks } from './recommend-bricks.ts';

export type {
    DetectedStack,
    MonorepoType,
    ProjectFiles,
    StackPrimary,
} from './detect-stack.ts';
export { detectStack } from './detect-stack.ts';
export type { BrickRecommendation } from './recommend-bricks.ts';
export { recommendBricks } from './recommend-bricks.ts';

export interface InitResult {
    readonly stack: DetectedStack;
    readonly recommendations: readonly BrickRecommendation[];
}

export function initProject(files: ProjectFiles): InitResult {
    const stack = detectStack(files);
    const recommendations = recommendBricks(stack);
    return { stack, recommendations };
}
