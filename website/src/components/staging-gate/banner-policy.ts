import { isStagingGateHost } from '@/lib/staging-gate/config';
import { GATE_LOGIN_PATH } from '@/lib/staging-gate/policy';

/**
 * Whether the staging banner ("Stagingomgeving · Uitloggen") belongs on this
 * page. Pure and client-safe: the banner calls it with
 * `window.location.hostname` and the router's pathname.
 *
 * Shown only on the one gated host, with the same host rule as the middleware
 * (`isStagingGateHost`: exact host, case and a trailing dot ignored), so a
 * look-alike such as `staging.debikefitstudio.be.evil.com` or `www.` never
 * shows it. Hidden on the gate's own pages: the login page has no session to
 * end, and the logout page already is the logout button.
 * Design: `docs/staging-gate.md` §3.
 */
export function shouldShowGateBanner(hostname: string, pathname: string): boolean {
  if (!isStagingGateHost(hostname)) return false;
  return !(pathname === GATE_LOGIN_PATH || pathname.startsWith(`${GATE_LOGIN_PATH}/`));
}
