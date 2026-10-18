import 'server-only';

import { cookies, headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { env } from '@/lib/env';
import { findGateSessionByTag } from './auth-repo';
import { resolveStagingGate, type GateResolution } from './config';
import { evaluateGateSession } from './policy';
import { GATE_COOKIE_NAME, verifyGateCookie } from './token';

/**
 * Request-bound helpers for the Node side (login page, logout page, the
 * actions in `./actions.ts`). Design: `docs/staging-gate.md` §1 and §3.
 */

/**
 * `resolveStagingGate()` for this request: the `host` header plus `env`. The
 * login page answers `notFound()` unless `kind === 'active'`.
 */
export async function currentGateResolution(): Promise<GateResolution> {
  const headerList = await headers();
  return resolveStagingGate({
    hostname: headerList.get('host'),
    vercelEnv: env.VERCEL_ENV,
    gitRef: env.VERCEL_GIT_COMMIT_REF,
    secret: env.STAGING_GATE_SECRET,
    healthToken: env.STAGING_GATE_HEALTH_TOKEN,
    databaseUrl: env.DATABASE_URL,
  });
}

/**
 * True when the gate is active here and the request's `__Host-staging-gate`
 * cookie verifies, its session exists and `evaluateGateSession()` accepts it.
 * Read-only (never touches `last_used_at`); any error is false.
 */
export async function currentGateSessionValid(): Promise<boolean> {
  try {
    const resolution = await currentGateResolution();
    if (resolution.kind !== 'active') return false;
    const value = (await cookies()).get(GATE_COOKIE_NAME)?.value;
    const tag = await verifyGateCookie(resolution.config.secret, value);
    if (!tag) return false;
    const row = await findGateSessionByTag(tag);
    return row !== null && evaluateGateSession(row, new Date()).valid;
  } catch (error) {
    // Next's own control-flow errors (dynamic rendering bail-out) pass through.
    unstable_rethrow(error);
    console.error('[staging-gate] session_check_failed');
    return false;
  }
}
