// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { type Tracer, trace } from '@opentelemetry/api';

const TRACER_NAME = 'focusmcp';
const TRACER_VERSION = '0.0.0';

export function getTracer(): Tracer {
    return trace.getTracer(TRACER_NAME, TRACER_VERSION);
}

export { trace } from '@opentelemetry/api';
