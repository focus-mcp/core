#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 FocusMCP contributors
# SPDX-License-Identifier: MIT
#
# Fail if @focus-mcp/core ever gets a Node.js-specific import.
# core MUST remain runtime-agnostic (browser-compatible) for multi-consumer use.
#
# Usage: bash scripts/check-runtime-agnostic.sh

set -euo pipefail

CORE_SRC="packages/core/src"

if [ ! -d "$CORE_SRC" ]; then
    echo "ERROR: $CORE_SRC not found (run from the repo root)"
    exit 2
fi

# Search for Node.js built-in module imports (node: protocol imports and requires)
NODE_IMPORTS=$(grep -rEn "from ['\"]node:|require\(['\"]node:" "$CORE_SRC" || true)

if [ -n "$NODE_IMPORTS" ]; then
    echo "ERROR: core must remain runtime-agnostic. Found Node.js-only imports:"
    echo "$NODE_IMPORTS"
    echo ""
    echo "Use the adapter pattern: define an interface in core, implement"
    echo "the Node-specific version in @focus-mcp/cli (or other consumers)."
    exit 1
fi

echo "✓ core remains runtime-agnostic (no Node.js-only imports detected)"
