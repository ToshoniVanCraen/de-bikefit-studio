import { NextResponse, type NextRequest } from 'next/server';

import type { GateConfig, GateMisconfigReason } from './config';
import {
  evaluateGateSession,
  GATE_HEALTH_HEADER,
  GATE_HEALTH_PATH,
  GATE_LOGIN_PATH,
  isGatePublicPath,
  safeReturnPath,
  type GateSessionRow,
} from './policy';
import { constantTimeEqual, GATE_COOKIE_NAME, parseGateCookie, verifyGateCookie } from './token';

/**
 * The proxy half of the staging gate: one request in, a decision out. Runs in
 * `src/middleware.ts` only when `resolveStagingGate()` says `active`, before
 * the pre-existing logic (Clerk, admin redirect, admin CSP). The store is
 * injected (`deps`), so unit tests need no Neon. Order of checks:
 * `docs/staging-gate.md` §2.
 */

/** What the store must return; `GateStoredSession` in `./store-edge` satisfies it. */
export type GateSessionLookup = GateSessionRow & { id: string };

export type GateDeps = {
  config: GateConfig;
  now?: () => Date;
  /** Session by recomputed tag (`token_hash`), joined with its account; null when unknown. */
  findSession: (tokenHash: string) => Promise<GateSessionLookup | null>;
  /** Moves `last_used_at` forward; a write failure fails the request closed. */
  touchSession: (id: string, now: Date) => Promise<void>;
};

export type GateOutcome = { kind: 'pass' } | { kind: 'respond'; response: NextResponse };

const ROBOTS_BODY = 'User-agent: *\nDisallow: /';

function isReadMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD';
}

function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function errorName(error: unknown): string {
  return error instanceof Error && /^[A-Za-z0-9_]{1,64}$/.test(error.name) ? error.name : 'unknown';
}

function jsonCode(code: string, status: number): NextResponse {
  return NextResponse.json({ code }, { status });
}

function clearGateCookie(response: NextResponse): NextResponse {
  // `__Host-` cookies are only accepted (and so only removable) with Secure and Path=/.
  response.cookies.set({
    name: GATE_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}

/** 302 to the login page (or 401 JSON under `/api/`), the return path only for GET/HEAD. */
function sessionRequired(req: NextRequest, expired: boolean): NextResponse {
  const { pathname, search } = req.nextUrl;
  if (isApiPath(pathname)) {
    const response = jsonCode('gate_session_required', 401);
    return expired ? clearGateCookie(response) : response;
  }
  const loginUrl = new URL(GATE_LOGIN_PATH, req.url);
  if (expired) loginUrl.searchParams.set('reden', 'verlopen');
  if (isReadMethod(req.method)) {
    // Same validation the login page applies; '' (refused) means no `next` at all.
    const next = safeReturnPath(`${pathname}${search}`, '');
    if (next !== '') loginUrl.searchParams.set('next', next);
  }
  const response = NextResponse.redirect(loginUrl, 302);
  return expired ? clearGateCookie(response) : response;
}

/** The gate's decision for one request on the active staging host. */
export async function gateRequest(req: NextRequest, deps: GateDeps): Promise<GateOutcome> {
  const { pathname } = req.nextUrl;

  // Next's image optimizer replaces our no-store response header with a
  // publicly cacheable one. A staging build renders all <Image> URLs directly;
  // refuse even authenticated optimizer requests so none can warm that cache.
  if (pathname === '/_next/image') {
    return { kind: 'respond', response: new NextResponse(null, { status: 404 }) };
  }

  // 1. Public method/path pairs: no action POST to the login page.
  if (isGatePublicPath(pathname, req.method)) return { kind: 'pass' };

  // 2. robots.txt never comes from the database-driven route on this host.
  if (pathname === '/robots.txt') {
    return {
      kind: 'respond',
      response: new NextResponse(ROBOTS_BODY, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }),
    };
  }

  // 3. Machine token (site-health): read-only, no cookie, no session.
  const machineToken = req.headers.get(GATE_HEALTH_HEADER);
  if (machineToken !== null) {
    const valid =
      isReadMethod(req.method) && constantTimeEqual(machineToken, deps.config.healthToken);
    return valid
      ? { kind: 'pass' }
      : { kind: 'respond', response: jsonCode('gate_auth_failed', 401) };
  }
  // The health route takes the token only, never a cookie.
  if (pathname === GATE_HEALTH_PATH) {
    return { kind: 'respond', response: jsonCode('gate_auth_failed', 401) };
  }

  // 4. Session cookie: shape and tag first, so garbage or forgery costs no query.
  const cookie = req.cookies.get(GATE_COOKIE_NAME)?.value;
  if (!cookie || !parseGateCookie(cookie)) {
    const response = sessionRequired(req, false);
    return { kind: 'respond', response: cookie ? clearGateCookie(response) : response };
  }
  const tokenHash = await verifyGateCookie(deps.config.secret, cookie);
  if (!tokenHash) return { kind: 'respond', response: sessionRequired(req, true) };

  const now = deps.now ? deps.now() : new Date();
  let session: GateSessionLookup | null;
  try {
    session = await deps.findSession(tokenHash);
  } catch (error) {
    console.error(`[staging-gate] store_error ${errorName(error)}`);
    return { kind: 'respond', response: jsonCode('gate_unavailable', 503) };
  }
  if (!session) return { kind: 'respond', response: sessionRequired(req, true) };

  const decision = evaluateGateSession(session, now);
  if (!decision.valid) return { kind: 'respond', response: sessionRequired(req, true) };

  if (decision.touch) {
    try {
      await deps.touchSession(session.id, now);
    } catch (error) {
      console.error(`[staging-gate] touch_failed ${errorName(error)}`);
      return { kind: 'respond', response: jsonCode('gate_unavailable', 503) };
    }
  }
  return { kind: 'pass' };
}

/** Every response on the active (or misconfigured) staging host, redirects and errors included. */
export function stampGateHeaders<T extends Response>(response: T): T {
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

const loggedMisconfigurations = new Set<string>();

/** 503 for every request on a misconfigured staging host; reason codes logged once per instance. */
export function misconfiguredResponse(reasons: readonly GateMisconfigReason[]): NextResponse {
  const codes = [...reasons].sort().join(',') || 'unknown';
  if (!loggedMisconfigurations.has(codes)) {
    loggedMisconfigurations.add(codes);
    console.error(`[staging-gate] misconfigured ${codes}`);
  }
  return stampGateHeaders(jsonCode('gate_misconfigured', 503));
}

/**
 * The pre-gate middleware matcher, reproduced so the wider matcher changes
 * nothing for hosts where the gate is inactive. Same regular expressions Next
 * compiles from the old `config.matcher` entries (case-sensitive, tested
 * against the pathname):
 *  - `/((?!_next|[^?]*\.(?:html?|css|js(?!on)|…|webmanifest)).*)`
 *  - `/(api|trpc)(.*)`
 */
const LEGACY_MATCHERS = [
  /^\/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)$/,
  /^\/(api|trpc)(.*)$/,
];

/** True when the old matcher would have run the middleware on `pathname`. */
export function runsLegacyMiddleware(pathname: string): boolean {
  return LEGACY_MATCHERS.some((matcher) => matcher.test(pathname));
}
