// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * Stack detection — pure, browser-compatible.
 *
 * Inspects a project's files via an injected ProjectFiles interface and infers:
 * - the primary stack (typescript, javascript, python, go, rust, monorepo, generic)
 * - optional monorepo type (pnpm-workspace, turborepo, lerna, nx, yarn-workspace)
 * - frameworks detected in dependency manifests (best-effort, no parsing if malformed)
 *
 * Used by initProject() to drive recommendBricks(). No file IO here — the host
 * (CLI, web playground, …) implements ProjectFiles using its own runtime.
 */

export interface ProjectFiles {
    hasFile(relativePath: string): boolean;
    readFileText(relativePath: string): string | null;
}

export type StackPrimary =
    | 'typescript'
    | 'javascript'
    | 'python'
    | 'go'
    | 'rust'
    | 'monorepo'
    | 'generic';

export type MonorepoType = 'pnpm-workspace' | 'turborepo' | 'lerna' | 'nx' | 'yarn-workspace';

export interface DetectedStack {
    readonly primary: StackPrimary;
    readonly detected_files: readonly string[];
    readonly monorepo?: { type: MonorepoType };
    readonly frameworks: readonly string[];
}

const TS_JS_FRAMEWORKS = ['react', 'next', 'vue', 'svelte', 'nuxt'] as const;
const PYTHON_FRAMEWORKS = ['fastapi', 'flask', 'django'] as const;
const RUST_FRAMEWORKS = ['axum', 'rocket', 'actix-web'] as const;

const MONOREPO_FILE_MARKERS = [
    'pnpm-workspace.yaml',
    'turbo.json',
    'lerna.json',
    'nx.json',
] as const;

const TS_JS_CONFIG_FILES = [
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
    'svelte.config.js',
    'nuxt.config.ts',
    'vite.config.ts',
    'vite.config.js',
] as const;

const PYTHON_FILE_MARKERS = ['pyproject.toml', 'requirements.txt', 'setup.py'] as const;

function safeJsonParse(raw: string | null): Record<string, unknown> | null {
    if (raw === null) return null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }
        return parsed as Record<string, unknown>;
    } catch {
        return null;
    }
}

function detectMonorepoType(files: ProjectFiles): MonorepoType | null {
    if (files.hasFile('pnpm-workspace.yaml')) return 'pnpm-workspace';
    if (files.hasFile('turbo.json')) return 'turborepo';
    if (files.hasFile('lerna.json')) return 'lerna';
    if (files.hasFile('nx.json')) return 'nx';
    // yarn workspaces are declared inside package.json — detect via the workspaces field
    if (files.hasFile('package.json')) {
        const pkg = safeJsonParse(files.readFileText('package.json'));
        if (pkg && 'workspaces' in pkg) {
            return 'yarn-workspace';
        }
    }
    return null;
}

function collectPackageJsonDeps(files: ProjectFiles): Record<string, string> {
    const pkg = safeJsonParse(files.readFileText('package.json'));
    if (!pkg) return {};
    const merged: Record<string, string> = {};
    for (const key of [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
    ] as const) {
        const value = pkg[key];
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            for (const [name, version] of Object.entries(value as Record<string, unknown>)) {
                if (typeof version === 'string') merged[name] = version;
            }
        }
    }
    return merged;
}

function detectTsJsFrameworks(files: ProjectFiles): string[] {
    const deps = collectPackageJsonDeps(files);
    const found: string[] = [];
    for (const fw of TS_JS_FRAMEWORKS) {
        if (fw in deps) found.push(fw);
    }
    return found;
}

function detectPythonFrameworks(files: ProjectFiles): string[] {
    const sources: string[] = [];
    for (const marker of PYTHON_FILE_MARKERS) {
        if (files.hasFile(marker)) {
            const text = files.readFileText(marker);
            if (text) sources.push(text);
        }
    }
    const blob = sources.join('\n').toLowerCase();
    const found: string[] = [];
    for (const fw of PYTHON_FRAMEWORKS) {
        // Word-boundary check to avoid matching inside random identifiers
        const regex = new RegExp(`(^|[^a-z0-9_-])${fw}([^a-z0-9_-]|$)`);
        if (regex.test(blob)) found.push(fw);
    }
    return found;
}

function detectGoFrameworks(files: ProjectFiles): string[] {
    const text = files.readFileText('go.mod');
    if (!text) return [];
    const blob = text.toLowerCase();
    const found: string[] = [];
    if (/github\.com\/gin-gonic\/gin\b/.test(blob)) found.push('gin');
    if (/github\.com\/labstack\/echo\b/.test(blob)) found.push('echo');
    if (/github\.com\/gofiber\/fiber\b/.test(blob)) found.push('fiber');
    return found;
}

function detectRustFrameworks(files: ProjectFiles): string[] {
    const text = files.readFileText('Cargo.toml');
    if (!text) return [];
    const blob = text.toLowerCase();
    const found: string[] = [];
    for (const fw of RUST_FRAMEWORKS) {
        const regex = new RegExp(`(^|[^a-z0-9_-])${fw}\\s*=`, 'm');
        if (regex.test(blob)) found.push(fw);
    }
    return found;
}

interface FileMarkers {
    readonly hasMonorepoFile: boolean;
    readonly hasPackageJson: boolean;
    readonly hasTsConfig: boolean;
    readonly hasPython: boolean;
    readonly hasGo: boolean;
    readonly hasRust: boolean;
    readonly hasGit: boolean;
    readonly detected: string[];
}

function collectMarkers(files: ProjectFiles): FileMarkers {
    const detected: string[] = [];
    let hasMonorepoFile = false;
    for (const marker of MONOREPO_FILE_MARKERS) {
        if (files.hasFile(marker)) {
            detected.push(marker);
            hasMonorepoFile = true;
        }
    }

    const hasPackageJson = files.hasFile('package.json');
    const hasTsConfig = files.hasFile('tsconfig.json');
    if (hasPackageJson) detected.push('package.json');
    if (hasTsConfig) detected.push('tsconfig.json');

    for (const cfg of TS_JS_CONFIG_FILES) {
        if (files.hasFile(cfg)) detected.push(cfg);
    }

    let hasPython = false;
    for (const marker of PYTHON_FILE_MARKERS) {
        if (files.hasFile(marker)) {
            detected.push(marker);
            hasPython = true;
        }
    }

    const hasGo = files.hasFile('go.mod');
    if (hasGo) detected.push('go.mod');

    const hasRust = files.hasFile('Cargo.toml');
    if (hasRust) detected.push('Cargo.toml');

    const hasGit = files.hasFile('.git/HEAD');
    if (hasGit) detected.push('.git/HEAD');

    return {
        hasMonorepoFile,
        hasPackageJson,
        hasTsConfig,
        hasPython,
        hasGo,
        hasRust,
        hasGit,
        detected,
    };
}

function pickPrimary(markers: FileMarkers, isMonorepo: boolean): StackPrimary {
    if (isMonorepo) return 'monorepo';
    if (markers.hasPackageJson && markers.hasTsConfig) return 'typescript';
    if (markers.hasPackageJson) return 'javascript';
    if (markers.hasPython) return 'python';
    if (markers.hasGo) return 'go';
    if (markers.hasRust) return 'rust';
    return 'generic';
}

function collectFrameworks(files: ProjectFiles, markers: FileMarkers): string[] {
    const frameworks: string[] = [];
    if (markers.hasPackageJson) frameworks.push(...detectTsJsFrameworks(files));
    if (markers.hasPython) frameworks.push(...detectPythonFrameworks(files));
    if (markers.hasGo) frameworks.push(...detectGoFrameworks(files));
    if (markers.hasRust) frameworks.push(...detectRustFrameworks(files));
    return frameworks;
}

export function detectStack(files: ProjectFiles): DetectedStack {
    const markers = collectMarkers(files);
    const monorepoType = detectMonorepoType(files);
    // yarn workspaces alone (no marker file) still counts as a monorepo
    const isMonorepo =
        monorepoType !== null && (monorepoType !== 'yarn-workspace' || !markers.hasMonorepoFile);

    const primary = pickPrimary(markers, isMonorepo);
    const frameworks = collectFrameworks(files, markers);

    if (monorepoType !== null && isMonorepo) {
        return {
            primary,
            detected_files: markers.detected,
            monorepo: { type: monorepoType },
            frameworks,
        };
    }
    return {
        primary,
        detected_files: markers.detected,
        frameworks,
    };
}
