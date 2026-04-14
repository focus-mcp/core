// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { defineConfig } from 'tsup';
import { focusTsupPreset } from '../../config/tsup.preset.ts';

export default defineConfig(
  focusTsupPreset({
    entry: ['src/index.ts', 'src/bin/focus.ts'],
  }),
);
