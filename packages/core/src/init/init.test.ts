// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { detectStack, type ProjectFiles } from './detect-stack.ts';
import { initProject } from './index.ts';
import { recommendBricks } from './recommend-bricks.ts';

/** Minimal mock — keys whose value is `true` count as "exists but empty"; strings carry content. */
function mockFiles(paths: Record<string, string | true>): ProjectFiles {
    return {
        hasFile: (p) => Object.hasOwn(paths, p),
        readFileText: (p) => {
            if (!Object.hasOwn(paths, p)) return null;
            const v = paths[p];
            return v === true ? '' : (v as string);
        },
    };
}

// ---------- detectStack ----------

describe('detectStack', () => {
    it('returns generic when nothing is detected', () => {
        const stack = detectStack(mockFiles({}));
        expect(stack.primary).toBe('generic');
        expect(stack.detected_files).toEqual([]);
        expect(stack.frameworks).toEqual([]);
        expect(stack.monorepo).toBeUndefined();
    });

    it('detects typescript when package.json + tsconfig.json are present', () => {
        const stack = detectStack(
            mockFiles({
                'package.json': JSON.stringify({ name: 'demo' }),
                'tsconfig.json': true,
            }),
        );
        expect(stack.primary).toBe('typescript');
        expect(stack.detected_files).toContain('package.json');
        expect(stack.detected_files).toContain('tsconfig.json');
    });

    it('detects javascript when package.json is present without tsconfig', () => {
        const stack = detectStack(mockFiles({ 'package.json': JSON.stringify({ name: 'demo' }) }));
        expect(stack.primary).toBe('javascript');
    });

    it('detects python via pyproject.toml', () => {
        const stack = detectStack(mockFiles({ 'pyproject.toml': true }));
        expect(stack.primary).toBe('python');
        expect(stack.detected_files).toContain('pyproject.toml');
    });

    it('detects python via requirements.txt', () => {
        const stack = detectStack(mockFiles({ 'requirements.txt': true }));
        expect(stack.primary).toBe('python');
    });

    it('detects python via setup.py', () => {
        const stack = detectStack(mockFiles({ 'setup.py': true }));
        expect(stack.primary).toBe('python');
    });

    it('detects go via go.mod', () => {
        const stack = detectStack(mockFiles({ 'go.mod': 'module example.com/x\n' }));
        expect(stack.primary).toBe('go');
        expect(stack.detected_files).toContain('go.mod');
    });

    it('detects rust via Cargo.toml', () => {
        const stack = detectStack(mockFiles({ 'Cargo.toml': '[package]\nname = "x"\n' }));
        expect(stack.primary).toBe('rust');
        expect(stack.detected_files).toContain('Cargo.toml');
    });

    it('detects monorepo via pnpm-workspace.yaml', () => {
        const stack = detectStack(mockFiles({ 'pnpm-workspace.yaml': true, 'package.json': '{}' }));
        expect(stack.primary).toBe('monorepo');
        expect(stack.monorepo?.type).toBe('pnpm-workspace');
    });

    it('detects monorepo via turbo.json', () => {
        const stack = detectStack(mockFiles({ 'turbo.json': true, 'package.json': '{}' }));
        expect(stack.monorepo?.type).toBe('turborepo');
    });

    it('detects monorepo via lerna.json', () => {
        const stack = detectStack(mockFiles({ 'lerna.json': true, 'package.json': '{}' }));
        expect(stack.monorepo?.type).toBe('lerna');
    });

    it('detects monorepo via nx.json', () => {
        const stack = detectStack(mockFiles({ 'nx.json': true, 'package.json': '{}' }));
        expect(stack.monorepo?.type).toBe('nx');
    });

    it('detects yarn workspaces via package.json workspaces field', () => {
        const stack = detectStack(
            mockFiles({
                'package.json': JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
            }),
        );
        expect(stack.primary).toBe('monorepo');
        expect(stack.monorepo?.type).toBe('yarn-workspace');
    });

    it('classifies as monorepo when yarn-workspace coexists with a marker file', () => {
        // pnpm-workspace.yaml wins on detectMonorepoType (checked first), but
        // even if yarn workspaces are also declared in package.json the project
        // must still be classified as a monorepo (regression test for the
        // isMonorepo edge case).
        const stack = detectStack(
            mockFiles({
                'turbo.json': true,
                'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
            }),
        );
        // detectMonorepoType returns 'turborepo' first (turbo.json before package.json check),
        // so the monorepo type is turborepo and isMonorepo must be true.
        expect(stack.primary).toBe('monorepo');
        expect(stack.monorepo?.type).toBe('turborepo');
    });

    it('classifies as monorepo when only a marker file exists with no parseable workspaces', () => {
        // Defensive case: hasMonorepoFile is true even when detectMonorepoType
        // would return null due to inconsistent IO. isMonorepo must still be true.
        const stack = detectStack(mockFiles({ 'pnpm-workspace.yaml': true }));
        expect(stack.primary).toBe('monorepo');
        expect(stack.monorepo?.type).toBe('pnpm-workspace');
    });

    it('detects TS/JS frameworks from package.json deps', () => {
        const stack = detectStack(
            mockFiles({
                'package.json': JSON.stringify({
                    dependencies: { react: '18', next: '14' },
                    devDependencies: { svelte: '4' },
                }),
                'tsconfig.json': true,
            }),
        );
        expect(stack.frameworks).toContain('react');
        expect(stack.frameworks).toContain('next');
        expect(stack.frameworks).toContain('svelte');
    });

    it('detects vue and nuxt frameworks', () => {
        const stack = detectStack(
            mockFiles({
                'package.json': JSON.stringify({ dependencies: { vue: '3', nuxt: '3' } }),
            }),
        );
        expect(stack.frameworks).toEqual(expect.arrayContaining(['vue', 'nuxt']));
    });

    it('records framework config files in detected_files', () => {
        const stack = detectStack(
            mockFiles({
                'package.json': JSON.stringify({ dependencies: { next: '14' } }),
                'tsconfig.json': true,
                'next.config.js': true,
                'vite.config.ts': true,
            }),
        );
        expect(stack.detected_files).toEqual(
            expect.arrayContaining(['next.config.js', 'vite.config.ts']),
        );
    });

    it('records all next config variants when present', () => {
        const stack = detectStack(
            mockFiles({
                'package.json': '{}',
                'next.config.mjs': true,
                'next.config.ts': true,
                'svelte.config.js': true,
                'nuxt.config.ts': true,
                'vite.config.js': true,
            }),
        );
        expect(stack.detected_files).toEqual(
            expect.arrayContaining([
                'next.config.mjs',
                'next.config.ts',
                'svelte.config.js',
                'nuxt.config.ts',
                'vite.config.js',
            ]),
        );
    });

    it('detects Python frameworks from pyproject.toml', () => {
        const stack = detectStack(
            mockFiles({
                'pyproject.toml': '[project]\nname = "x"\ndependencies = ["fastapi", "django"]\n',
            }),
        );
        expect(stack.frameworks).toEqual(expect.arrayContaining(['fastapi', 'django']));
    });

    it('detects Python frameworks from requirements.txt', () => {
        const stack = detectStack(
            mockFiles({ 'requirements.txt': 'flask==2.3\nrequests==2.31\n' }),
        );
        expect(stack.frameworks).toContain('flask');
    });

    it('detects Python frameworks from setup.py', () => {
        const stack = detectStack(
            mockFiles({ 'setup.py': "install_requires=['fastapi','uvicorn']" }),
        );
        expect(stack.frameworks).toContain('fastapi');
    });

    it('does not falsely detect a Python framework substring', () => {
        const stack = detectStack(mockFiles({ 'requirements.txt': 'myfastapis==1.0\n' }));
        expect(stack.frameworks).not.toContain('fastapi');
    });

    it('skips python framework detection when source files are empty', () => {
        const stack = detectStack(
            mockFiles({ 'pyproject.toml': true, 'requirements.txt': true, 'setup.py': true }),
        );
        expect(stack.primary).toBe('python');
        expect(stack.frameworks).toEqual([]);
    });

    it('detects Go frameworks from go.mod', () => {
        const stack = detectStack(
            mockFiles({
                'go.mod':
                    'module x\nrequire github.com/gin-gonic/gin v1.9.0\nrequire github.com/labstack/echo v4\nrequire github.com/gofiber/fiber v2\n',
            }),
        );
        expect(stack.frameworks).toEqual(expect.arrayContaining(['gin', 'echo', 'fiber']));
    });

    it('returns no Go frameworks when go.mod has none', () => {
        const stack = detectStack(mockFiles({ 'go.mod': 'module x\n' }));
        expect(stack.frameworks).toEqual([]);
    });

    it('detects Rust frameworks from Cargo.toml', () => {
        const stack = detectStack(
            mockFiles({
                'Cargo.toml': '[dependencies]\naxum = "0.7"\nrocket = "0.5"\nactix-web = "4"\n',
            }),
        );
        expect(stack.frameworks).toEqual(expect.arrayContaining(['axum', 'rocket', 'actix-web']));
    });

    it('returns no Rust frameworks when Cargo.toml has none', () => {
        const stack = detectStack(mockFiles({ 'Cargo.toml': '[package]\nname = "x"\n' }));
        expect(stack.frameworks).toEqual([]);
    });

    it('handles malformed package.json gracefully (returns javascript with no frameworks)', () => {
        const stack = detectStack(mockFiles({ 'package.json': '{ this is not valid json' }));
        expect(stack.primary).toBe('javascript');
        expect(stack.frameworks).toEqual([]);
    });

    it('handles package.json that parses to non-object (e.g. an array)', () => {
        const stack = detectStack(mockFiles({ 'package.json': '[1,2,3]' }));
        expect(stack.primary).toBe('javascript');
        expect(stack.frameworks).toEqual([]);
    });

    it('handles package.json that parses to null', () => {
        const stack = detectStack(mockFiles({ 'package.json': 'null' }));
        expect(stack.primary).toBe('javascript');
        expect(stack.frameworks).toEqual([]);
    });

    it('handles package.json with non-string version values in deps', () => {
        const stack = detectStack(
            mockFiles({
                'package.json': JSON.stringify({
                    dependencies: { react: 18, next: '14' },
                }),
            }),
        );
        // react ignored (number, not string), next kept
        expect(stack.frameworks).toContain('next');
        expect(stack.frameworks).not.toContain('react');
    });

    it('handles package.json with non-object dependencies field', () => {
        const stack = detectStack(
            mockFiles({
                'package.json': JSON.stringify({ dependencies: 'invalid' }),
            }),
        );
        expect(stack.primary).toBe('javascript');
        expect(stack.frameworks).toEqual([]);
    });

    it('handles package.json with array deps (rejected by safeJsonParse path on values)', () => {
        const stack = detectStack(
            mockFiles({ 'package.json': JSON.stringify({ devDependencies: [1, 2, 3] }) }),
        );
        expect(stack.frameworks).toEqual([]);
    });

    it('records .git/HEAD when present', () => {
        const stack = detectStack(mockFiles({ '.git/HEAD': 'ref: refs/heads/main\n' }));
        expect(stack.detected_files).toContain('.git/HEAD');
    });

    it('treats null returned from readFileText as missing content (Python)', () => {
        // hasFile returns true but readFileText returns null — simulate IO race
        const files: ProjectFiles = {
            hasFile: () => true,
            readFileText: () => null,
        };
        // hasFile === true for everything, so it'll detect monorepo first (pnpm-workspace.yaml)
        const stack = detectStack(files);
        expect(stack.primary).toBe('monorepo');
    });

    it('reads peer/optional deps for TS frameworks', () => {
        const stack = detectStack(
            mockFiles({
                'package.json': JSON.stringify({
                    peerDependencies: { react: '18' },
                    optionalDependencies: { svelte: '4' },
                }),
            }),
        );
        expect(stack.frameworks).toEqual(expect.arrayContaining(['react', 'svelte']));
    });
});

// ---------- recommendBricks ----------

describe('recommendBricks', () => {
    it('always recommends universal bricks', () => {
        const recs = recommendBricks({
            primary: 'generic',
            detected_files: [],
            frameworks: [],
        });
        const names = recs.map((r) => r.name);
        expect(names).toEqual(expect.arrayContaining(['filesystem', 'textsearch', 'fts']));
    });

    it('returns universal-only bricks for a generic stack', () => {
        const recs = recommendBricks({
            primary: 'generic',
            detected_files: [],
            frameworks: [],
        });
        // No language-specific bricks
        const names = recs.map((r) => r.name);
        expect(names).not.toContain('codebase');
        expect(names).not.toContain('symbol');
    });

    it('recommends git when .git/HEAD is detected', () => {
        const recs = recommendBricks({
            primary: 'generic',
            detected_files: ['.git/HEAD'],
            frameworks: [],
        });
        expect(recs.map((r) => r.name)).toContain('git');
    });

    it('does not recommend git when .git/HEAD is absent', () => {
        const recs = recommendBricks({
            primary: 'generic',
            detected_files: [],
            frameworks: [],
        });
        expect(recs.map((r) => r.name)).not.toContain('git');
    });

    it('recommends TS bundle for typescript stack', () => {
        const recs = recommendBricks({
            primary: 'typescript',
            detected_files: ['package.json', 'tsconfig.json'],
            frameworks: [],
        });
        const names = recs.map((r) => r.name);
        expect(names).toEqual(
            expect.arrayContaining(['codebase', 'codemod', 'devtools', 'validate']),
        );
    });

    it('recommends routes for Next.js typescript stack', () => {
        const recs = recommendBricks({
            primary: 'typescript',
            detected_files: ['package.json', 'tsconfig.json'],
            frameworks: ['react', 'next'],
        });
        expect(recs.map((r) => r.name)).toContain('routes');
    });

    it('recommends routes for Nuxt and Svelte stacks', () => {
        const recsNuxt = recommendBricks({
            primary: 'javascript',
            detected_files: ['package.json'],
            frameworks: ['nuxt'],
        });
        const recsSvelte = recommendBricks({
            primary: 'typescript',
            detected_files: ['package.json', 'tsconfig.json'],
            frameworks: ['svelte'],
        });
        expect(recsNuxt.map((r) => r.name)).toContain('routes');
        expect(recsSvelte.map((r) => r.name)).toContain('routes');
    });

    it('does not recommend routes for plain react app', () => {
        const recs = recommendBricks({
            primary: 'typescript',
            detected_files: ['package.json', 'tsconfig.json'],
            frameworks: ['react'],
        });
        expect(recs.map((r) => r.name)).not.toContain('routes');
    });

    it('recommends Python intel bricks for python stack', () => {
        const recs = recommendBricks({
            primary: 'python',
            detected_files: ['pyproject.toml'],
            frameworks: [],
        });
        const names = recs.map((r) => r.name);
        expect(names).toEqual(
            expect.arrayContaining(['overview', 'outline', 'symbol', 'refs', 'shell']),
        );
    });

    it('recommends routes for Python web frameworks', () => {
        const recs = recommendBricks({
            primary: 'python',
            detected_files: ['pyproject.toml'],
            frameworks: ['fastapi'],
        });
        expect(recs.map((r) => r.name)).toContain('routes');
    });

    it('recommends routes for django and flask', () => {
        const django = recommendBricks({
            primary: 'python',
            detected_files: ['pyproject.toml'],
            frameworks: ['django'],
        });
        const flask = recommendBricks({
            primary: 'python',
            detected_files: ['requirements.txt'],
            frameworks: ['flask'],
        });
        expect(django.map((r) => r.name)).toContain('routes');
        expect(flask.map((r) => r.name)).toContain('routes');
    });

    it('recommends Go intel bricks for go stack', () => {
        const recs = recommendBricks({
            primary: 'go',
            detected_files: ['go.mod'],
            frameworks: [],
        });
        const names = recs.map((r) => r.name);
        expect(names).toEqual(
            expect.arrayContaining(['symbol', 'refs', 'outline', 'depgraph', 'shell']),
        );
    });

    it('recommends routes for Go web frameworks', () => {
        const gin = recommendBricks({
            primary: 'go',
            detected_files: ['go.mod'],
            frameworks: ['gin'],
        });
        const echo = recommendBricks({
            primary: 'go',
            detected_files: ['go.mod'],
            frameworks: ['echo'],
        });
        const fiber = recommendBricks({
            primary: 'go',
            detected_files: ['go.mod'],
            frameworks: ['fiber'],
        });
        expect(gin.map((r) => r.name)).toContain('routes');
        expect(echo.map((r) => r.name)).toContain('routes');
        expect(fiber.map((r) => r.name)).toContain('routes');
    });

    it('recommends Rust intel bricks for rust stack', () => {
        const recs = recommendBricks({
            primary: 'rust',
            detected_files: ['Cargo.toml'],
            frameworks: [],
        });
        const names = recs.map((r) => r.name);
        expect(names).toEqual(expect.arrayContaining(['outline', 'symbol', 'refs', 'shell']));
    });

    it('recommends routes for Rust web frameworks', () => {
        const axum = recommendBricks({
            primary: 'rust',
            detected_files: ['Cargo.toml'],
            frameworks: ['axum'],
        });
        const rocket = recommendBricks({
            primary: 'rust',
            detected_files: ['Cargo.toml'],
            frameworks: ['rocket'],
        });
        const actix = recommendBricks({
            primary: 'rust',
            detected_files: ['Cargo.toml'],
            frameworks: ['actix-web'],
        });
        expect(axum.map((r) => r.name)).toContain('routes');
        expect(rocket.map((r) => r.name)).toContain('routes');
        expect(actix.map((r) => r.name)).toContain('routes');
    });

    it('recommends monorepo extras + TS bricks for a TS monorepo', () => {
        const recs = recommendBricks({
            primary: 'monorepo',
            detected_files: ['pnpm-workspace.yaml', 'package.json', 'tsconfig.json'],
            monorepo: { type: 'pnpm-workspace' },
            frameworks: [],
        });
        const names = recs.map((r) => r.name);
        expect(names).toEqual(
            expect.arrayContaining(['repos', 'impact', 'graphbuild', 'graphquery', 'codebase']),
        );
    });

    it('recommends Python bricks for a Python monorepo', () => {
        const recs = recommendBricks({
            primary: 'monorepo',
            detected_files: ['pnpm-workspace.yaml', 'pyproject.toml'],
            monorepo: { type: 'pnpm-workspace' },
            frameworks: [],
        });
        expect(recs.map((r) => r.name)).toEqual(expect.arrayContaining(['overview', 'symbol']));
    });

    it('recommends Go bricks for a Go monorepo', () => {
        const recs = recommendBricks({
            primary: 'monorepo',
            detected_files: ['turbo.json', 'go.mod'],
            monorepo: { type: 'turborepo' },
            frameworks: [],
        });
        expect(recs.map((r) => r.name)).toEqual(expect.arrayContaining(['depgraph']));
    });

    it('recommends Rust bricks for a Rust monorepo', () => {
        const recs = recommendBricks({
            primary: 'monorepo',
            detected_files: ['nx.json', 'Cargo.toml'],
            monorepo: { type: 'nx' },
            frameworks: [],
        });
        expect(recs.map((r) => r.name)).toEqual(expect.arrayContaining(['outline', 'symbol']));
    });

    it('recommends Python bricks for monorepo with requirements.txt', () => {
        const recs = recommendBricks({
            primary: 'monorepo',
            detected_files: ['lerna.json', 'requirements.txt'],
            monorepo: { type: 'lerna' },
            frameworks: [],
        });
        expect(recs.map((r) => r.name)).toContain('overview');
    });

    it('recommends Python bricks for monorepo with setup.py', () => {
        const recs = recommendBricks({
            primary: 'monorepo',
            detected_files: ['lerna.json', 'setup.py'],
            monorepo: { type: 'lerna' },
            frameworks: [],
        });
        expect(recs.map((r) => r.name)).toContain('symbol');
    });

    it('produces unique brick names (no duplicates)', () => {
        const recs = recommendBricks({
            primary: 'monorepo',
            detected_files: ['pnpm-workspace.yaml', 'package.json', 'tsconfig.json'],
            monorepo: { type: 'pnpm-workspace' },
            frameworks: ['next'],
        });
        const names = recs.map((r) => r.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it('every recommendation has a non-empty reason', () => {
        const recs = recommendBricks({
            primary: 'typescript',
            detected_files: ['package.json', 'tsconfig.json'],
            frameworks: ['next'],
        });
        for (const r of recs) {
            expect(r.reason.length).toBeGreaterThan(0);
        }
    });

    it('routes reason for TS/JS branch only mentions matching frameworks (not python ones)', () => {
        // In a TS monorepo that also contains a Python service, stack.frameworks
        // can mix ecosystems (e.g. ['next', 'fastapi']). The routes reason in the
        // TS branch must mention only TS/JS routing frameworks, never Python ones.
        const recs = recommendBricks({
            primary: 'monorepo',
            detected_files: ['pnpm-workspace.yaml', 'package.json', 'pyproject.toml'],
            monorepo: { type: 'pnpm-workspace' },
            frameworks: ['next', 'fastapi'],
        });
        const tsRoutes = recs.find(
            (r) =>
                r.name === 'routes' && r.reason.includes('next') && !r.reason.includes('fastapi'),
        );
        // At least one routes entry mentions only the TS framework. The Python
        // branch produces a separate routes reason (deduped on name) but the
        // first push wins via pushUnique → check the surviving reason mentions next, not fastapi.
        const routesRec = recs.find((r) => r.name === 'routes');
        expect(routesRec).toBeDefined();
        expect(routesRec?.reason).toContain('next');
        expect(routesRec?.reason).not.toContain('fastapi');
        // sanity: the helper variable above was used for clarity
        expect(tsRoutes).toBeDefined();
    });
});

// ---------- initProject ----------

describe('initProject', () => {
    it('returns stack + recommendations', () => {
        const result = initProject(
            mockFiles({
                'package.json': JSON.stringify({ dependencies: { next: '14' } }),
                'tsconfig.json': true,
                '.git/HEAD': true,
            }),
        );
        expect(result.stack.primary).toBe('typescript');
        expect(result.stack.frameworks).toContain('next');
        const names = result.recommendations.map((r) => r.name);
        expect(names).toEqual(expect.arrayContaining(['codebase', 'routes', 'git']));
    });

    it('returns generic + universals for an empty project', () => {
        const result = initProject(mockFiles({}));
        expect(result.stack.primary).toBe('generic');
        expect(result.recommendations.map((r) => r.name)).toEqual(
            expect.arrayContaining(['filesystem', 'textsearch', 'fts']),
        );
    });
});
