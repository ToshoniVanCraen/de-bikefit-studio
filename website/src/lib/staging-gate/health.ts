import type { GateConfig, GateResolution } from './config';
import { constantTimeEqual } from './token';

/**
 * The pure half of `GET /api/staging-gate/health` (docs/staging-gate.md §2
 * step 3): who may ask, and what to answer. The route handler adds the host,
 * the token header and the database probe.
 */

export type HealthAccess =
  | { kind: 'respond'; status: 401 | 404 | 503; body: { code: string } | null }
  | { kind: 'probe'; config: GateConfig };

/** Inactive host → 404; misconfigured → 503; token checked in constant time → 401 or probe. */
export function decideHealthAccess(resolution: GateResolution, token: string | null): HealthAccess {
  if (resolution.kind === 'inactive') return { kind: 'respond', status: 404, body: null };
  if (resolution.kind === 'misconfigured') {
    return { kind: 'respond', status: 503, body: { code: 'gate_misconfigured' } };
  }
  if (token === null || !constantTimeEqual(token, resolution.config.healthToken)) {
    return { kind: 'respond', status: 401, body: { code: 'gate_auth_failed' } };
  }
  return { kind: 'probe', config: resolution.config };
}

/** The answer after the `select 1` probe. */
export function healthProbeResult(databaseOk: boolean): {
  status: 200 | 503;
  body: { status: 'ok' } | { code: 'app_unhealthy' };
} {
  return databaseOk
    ? { status: 200, body: { status: 'ok' } }
    : { status: 503, body: { code: 'app_unhealthy' } };
}
