// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * Brick recommendation engine — pure, browser-compatible.
 *
 * Maps a DetectedStack to a list of recommended bricks, mirroring the
 * decision tree in https://github.com/focus-mcp/cli/blob/main/docs/AGENT_GUIDE.md.
 * Ordering is curated:
 *   - universal essentials first (filesystem-ish + search)
 *   - git next when version control is detected
 *   - then, depending on the primary stack:
 *     - monorepo: workspace extras (repos/impact/graphbuild/graphquery)
 *       followed by language-specific intel for each detected ecosystem
 *     - typescript/javascript/python/go/rust: language-specific intel
 *       followed by framework-specific extras (e.g. routes for next/fastapi/gin/axum)
 *
 * Brick names match the official marketplace catalog. When a composite
 * brick is available (e.g. `codebase` bundles treesitter/symbol/refs/…),
 * we recommend the composite — agents can install it directly.
 */

import type { DetectedStack } from './detect-stack.ts';

export interface BrickRecommendation {
    readonly name: string;
    readonly reason: string;
}

interface InternalRec {
    name: string;
    reason: string;
}

function pushUnique(list: InternalRec[], rec: InternalRec): void {
    if (!list.some((existing) => existing.name === rec.name)) {
        list.push(rec);
    }
}

function pushUniversal(list: InternalRec[]): void {
    pushUnique(list, {
        name: 'filesystem',
        reason: 'Read, write, list, search files (universal essentials).',
    });
    pushUnique(list, { name: 'textsearch', reason: 'Grep-like search across the project.' });
    pushUnique(list, { name: 'fts', reason: 'Full-text indexed search, TF-IDF ranked.' });
}

function pushTsJs(list: InternalRec[], stack: DetectedStack): void {
    pushUnique(list, {
        name: 'codebase',
        reason: 'Code intel bundle (treesitter, symbol, outline, callgraph, depgraph, refs).',
    });
    pushUnique(list, {
        name: 'codemod',
        reason: 'Refactoring bundle (symbol, rename, codeedit, inline, textsearch).',
    });
    pushUnique(list, {
        name: 'devtools',
        reason: 'Run scripts and shell commands (shell, sandbox, batch).',
    });
    pushUnique(list, { name: 'validate', reason: 'Type-check and lint validation.' });

    // Framework-specific extras
    const frameworks = new Set(stack.frameworks);
    const tsJsRouteFrameworks = ['next', 'nuxt', 'svelte'] as const;
    const matched = tsJsRouteFrameworks.filter((fw) => frameworks.has(fw));
    if (matched.length > 0) {
        pushUnique(list, {
            name: 'routes',
            reason: `Detect HTTP routes (${matched.join(', ')} app).`,
        });
    }
}

function pushPython(list: InternalRec[], stack: DetectedStack): void {
    pushUnique(list, { name: 'overview', reason: 'High-level project structure overview.' });
    pushUnique(list, { name: 'outline', reason: 'Outline of files and modules.' });
    pushUnique(list, {
        name: 'symbol',
        reason: 'Symbol metadata (Python supported via tree-sitter).',
    });
    pushUnique(list, { name: 'refs', reason: 'Find references across the codebase.' });
    pushUnique(list, { name: 'shell', reason: 'Run pytest, ruff, mypy and other tools.' });

    const frameworks = new Set(stack.frameworks);
    const pyRouteFrameworks = ['fastapi', 'flask', 'django'] as const;
    const matched = pyRouteFrameworks.filter((fw) => frameworks.has(fw));
    if (matched.length > 0) {
        pushUnique(list, {
            name: 'routes',
            reason: `Detect HTTP routes (${matched.join(', ')} app).`,
        });
    }
}

function pushGo(list: InternalRec[], stack: DetectedStack): void {
    pushUnique(list, { name: 'symbol', reason: 'Symbol metadata (Go supported via tree-sitter).' });
    pushUnique(list, { name: 'refs', reason: 'Find references across Go sources.' });
    pushUnique(list, { name: 'outline', reason: 'Outline of Go packages and files.' });
    pushUnique(list, { name: 'depgraph', reason: 'Module and package dependency graph.' });
    pushUnique(list, { name: 'shell', reason: 'Run go test, go build, go vet.' });

    const frameworks = new Set(stack.frameworks);
    const goRouteFrameworks = ['gin', 'echo', 'fiber'] as const;
    const matched = goRouteFrameworks.filter((fw) => frameworks.has(fw));
    if (matched.length > 0) {
        pushUnique(list, {
            name: 'routes',
            reason: `Detect HTTP routes (${matched.join(', ')} app).`,
        });
    }
}

function pushRust(list: InternalRec[], stack: DetectedStack): void {
    pushUnique(list, { name: 'outline', reason: 'Outline of crates and modules.' });
    pushUnique(list, {
        name: 'symbol',
        reason: 'Symbol metadata (Rust supported via tree-sitter).',
    });
    pushUnique(list, { name: 'refs', reason: 'Find references across Rust sources.' });
    pushUnique(list, { name: 'shell', reason: 'Run cargo build, cargo test, clippy.' });

    const frameworks = new Set(stack.frameworks);
    const rustRouteFrameworks = ['axum', 'rocket', 'actix-web'] as const;
    const matched = rustRouteFrameworks.filter((fw) => frameworks.has(fw));
    if (matched.length > 0) {
        pushUnique(list, {
            name: 'routes',
            reason: `Detect HTTP routes (${matched.join(', ')} app).`,
        });
    }
}

function pushMonorepo(list: InternalRec[]): void {
    pushUnique(list, {
        name: 'repos',
        reason: 'Register and navigate multiple packages in the workspace.',
    });
    pushUnique(list, {
        name: 'impact',
        reason: 'Analyse blast radius across packages on a change.',
    });
    pushUnique(list, {
        name: 'graphbuild',
        reason: 'Build dependency graph across the workspace.',
    });
    pushUnique(list, { name: 'graphquery', reason: 'Query the workspace dependency graph.' });
}

export function recommendBricks(stack: DetectedStack): readonly BrickRecommendation[] {
    const recs: InternalRec[] = [];

    // Always recommend the universal trio first (file ops + search).
    pushUniversal(recs);

    // git is recommended if the project is under version control.
    // detect-stack populates detected_files with '.git/HEAD' when present.
    if (stack.detected_files.includes('.git/HEAD')) {
        pushUnique(recs, { name: 'git', reason: 'Version control under .git/ detected.' });
    }

    if (stack.primary === 'monorepo') {
        pushMonorepo(recs);
        // After monorepo extras, infer language-specific intel from the markers present.
        if (stack.detected_files.includes('package.json')) {
            pushTsJs(recs, stack);
        }
        if (
            stack.detected_files.some(
                (f) => f === 'pyproject.toml' || f === 'requirements.txt' || f === 'setup.py',
            )
        ) {
            pushPython(recs, stack);
        }
        if (stack.detected_files.includes('go.mod')) {
            pushGo(recs, stack);
        }
        if (stack.detected_files.includes('Cargo.toml')) {
            pushRust(recs, stack);
        }
    } else if (stack.primary === 'typescript' || stack.primary === 'javascript') {
        pushTsJs(recs, stack);
    } else if (stack.primary === 'python') {
        pushPython(recs, stack);
    } else if (stack.primary === 'go') {
        pushGo(recs, stack);
    } else if (stack.primary === 'rust') {
        pushRust(recs, stack);
    }
    // generic stack → universals only

    return recs.map((r) => ({ name: r.name, reason: r.reason }));
}
