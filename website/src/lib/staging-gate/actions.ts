'use server';

import { cookies } from 'next/headers';
import { redirect, unstable_rethrow } from 'next/navigation';
import { gateCookieOptions } from './auth';
import { revokeGateSessionByTag } from './auth-repo';
import { currentGateResolution } from './auth-server';
import { GATE_LOGIN_PATH } from './policy';
import { GATE_COOKIE_NAME, verifyGateCookie } from './token';

/**
 * The staging gate's sign-out (`docs/staging-gate.md` §3). Sign-in uses the
 * dedicated POST route, not a public-page Server Action: Next can forward an
 * unrelated action POST submitted to a public page. The logout action is only
 * reachable from protected pages and checks the exact host again.
 */

export async function gateLogoutAction(): Promise<void> {
  const resolution = await currentGateResolution();
  if (resolution.kind !== 'active') redirect('/');

  const store = await cookies();
  try {
    const tag = await verifyGateCookie(
      resolution.config.secret,
      store.get(GATE_COOKIE_NAME)?.value,
    );
    if (tag) await revokeGateSessionByTag(tag);
  } catch (error) {
    unstable_rethrow(error);
    // A failed write must not claim a successful logout: the server session may
    // still be valid. Keep the cookie so the person can retry; the gate itself
    // continues to fail closed if its session store is unavailable.
    console.error('[staging-gate] logout_failed');
    throw new Error('Afmelden is tijdelijk niet beschikbaar. Probeer het opnieuw.');
  }
  store.set(GATE_COOKIE_NAME, '', gateCookieOptions(0));
  redirect(`${GATE_LOGIN_PATH}?reden=afgemeld`);
}
