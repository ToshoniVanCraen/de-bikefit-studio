import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextFetchEvent, NextRequest } from 'next/server';

import { nextWithAdminCsp, withAdminCspHeader } from '@/lib/security/admin-csp-response';
import { resolveStagingGate } from '@/lib/staging-gate/config';
import {
  gateRequest,
  misconfiguredResponse,
  runsLegacyMiddleware,
  stampGateHeaders,
} from '@/lib/staging-gate/middleware';
import {
  createNeonExecutor,
  findGateSession,
  touchGateSession,
} from '@/lib/staging-gate/store-edge';

/**
 * Auth middleware.
 *
 * NOTE: Next.js 16 is migrating `middleware.ts` → `proxy.ts` and prints a
 * deprecation notice on every build. We keep `middleware.ts` because that is
 * the filename Clerk's `clerkMiddleware` expects; it still works in 16.x.
 * Renaming to `proxy.ts` is a follow-up once Clerk supports it.
 *
 * Three independent concerns live here:
 *
 *  1. **Webshop (Clerk).** Unchanged: `/account` and `/checkout` are protected
 *     when Clerk is configured, and the whole thing is a pass-through when it
 *     is not, so the app still runs key-free.
 *
 *  2. **CMS admin.** A cheap presence check on the `cms_session` cookie that
 *     bounces anonymous visitors from `/admin/*` to `/admin/login`. This is a
 *     convenience redirect, NOT the security boundary — the cookie is not
 *     validated here. Real validation happens in the `/admin` layout via
 *     `requireCmsUser()`, which hits the database.
 *
 *  3. **Admin Content-Security-Policy.** Every `/admin` and `/admin/…` request
 *     gets a fresh nonce, forwarded to the app (so Next stamps it on its
 *     scripts) and named in the policy header on the response, the sign-in
 *     redirect included. Report-only for now; see
 *     `src/lib/security/admin-csp.ts` and `docs/admin-csp.md`. Every other
 *     path is passed through exactly as before, with no CSP.
 *
 *  4. **Staging access gate** (`docs/staging-gate.md`). Only on the exact host
 *     `staging.debikefitstudio.be`: misconfigured → 503 everywhere; active →
 *     `gateRequest()` first (one Neon HTTP query per gated request, raw SQL in
 *     `src/lib/staging-gate/store-edge.ts`), then concerns 1–3, and every
 *     response stamped `no-store` + `noindex`. On every other host the gate
 *     is inactive and concerns 1–3 run exactly as before, on exactly the
 *     paths the old matcher selected (`runsLegacyMiddleware()`).
 *
 * No other database access: this retained `middleware.ts` runs in the Edge
 * runtime on Next 16 (confirmed by the production build's edge output), so
 * PGlite's WASM/filesystem client is unsuitable for request gating.
 * The gate uses a stateless Neon HTTP query on staging only.
 */

const isProtectedRoute = createRouteMatcher(['/account(.*)', '/checkout(.*)']);

/**
 * Same test as `features.clerk` in `src/lib/env.ts`, but read literally on
 * purpose: preserve the pre-existing middleware convention and keep the
 * request-path decision independent of the whole-object `env.ts` parser.
 * This file is the documented exception to "env only through `src/lib/env.ts`";
 * the staging gate's inputs in `stagingGateFor()` below are read literally too.
 */
const hasClerk = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

/**
 * Admin CSP options. `NODE_ENV` is read literally for the same edge reason; it
 * is set (and inlined at build time) by Next itself, not configuration.
 */
const ADMIN_CSP = { isDev: process.env.NODE_ENV === 'development' };

/** Must match `SESSION_COOKIE_NAME` in `src/lib/cms/session.ts`. */
const CMS_SESSION_COOKIE = 'cms_session';

/**
 * `/admin/login` is the only admin route an anonymous visitor may reach, plus
 * `/admin/mfa`, the second sign-in step, which runs before any session exists
 * (it checks its own `cms_mfa` challenge cookie against the database).
 */
function isGuardedAdminRoute(pathname: string): boolean {
  if (!pathname.startsWith('/admin')) return false;
  const open = ['/admin/login', '/admin/mfa'];
  return !open.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Returns a redirect to the login page when an admin route is requested
 * without a session cookie, otherwise null.
 */
function guardAdmin(req: NextRequest): NextResponse | null {
  const { pathname, search } = req.nextUrl;
  if (!isGuardedAdminRoute(pathname)) return null;
  if (req.cookies.get(CMS_SESSION_COOKIE)?.value) return null;

  const loginUrl = new URL('/admin/login', req.url);
  // Let the login page send the user back where they were headed.
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

const clerk = clerkMiddleware(async (auth, req) => {
  const adminRedirect = guardAdmin(req);
  if (adminRedirect) return withAdminCspHeader(req, adminRedirect, ADMIN_CSP);

  if (isProtectedRoute(req)) {
    await auth.protect();
  }

  // Admin paths continue with the nonce; null elsewhere, so Clerk's own
  // pass-through applies exactly as before.
  return nextWithAdminCsp(req, ADMIN_CSP);
});

const legacyMiddleware = hasClerk
  ? clerk
  : function middleware(req: NextRequest) {
      const adminRedirect = guardAdmin(req);
      if (adminRedirect) return withAdminCspHeader(req, adminRedirect, ADMIN_CSP);
      return nextWithAdminCsp(req, ADMIN_CSP) ?? NextResponse.next();
    };

/** The gate's decision for this request's host; literal env reads (see `hasClerk`). */
function stagingGateFor(req: NextRequest) {
  return resolveStagingGate({
    // In Next 16's local production server `nextUrl.hostname` is `localhost`
    // even when Host is the requested custom domain. Host is also the source
    // used by the Node sign-in/health handlers. Prefer it so both layers make
    // the same exact-host decision; fall back only when the header is absent.
    hostname: req.headers.get('host') ?? req.nextUrl.hostname,
    vercelEnv: process.env.VERCEL_ENV,
    gitRef: process.env.VERCEL_GIT_COMMIT_REF,
    secret: process.env.STAGING_GATE_SECRET,
    healthToken: process.env.STAGING_GATE_HEALTH_TOKEN,
    databaseUrl: process.env.DATABASE_URL,
  });
}

/** Stamps a response that may have immutable headers (e.g. `Response.redirect`). */
function stampAny(response: Response): Response {
  try {
    return stampGateHeaders(response);
  } catch {
    return stampGateHeaders(new Response(response.body, response));
  }
}

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  const gate = stagingGateFor(req);

  if (gate.kind === 'inactive') {
    // Paths the old matcher never selected pass through untouched.
    if (!runsLegacyMiddleware(req.nextUrl.pathname)) return NextResponse.next();
    return legacyMiddleware(req, event);
  }
  if (gate.kind === 'misconfigured') return misconfiguredResponse(gate.reasons);

  const exec = createNeonExecutor(gate.config.databaseUrl);
  const outcome = await gateRequest(req, {
    config: gate.config,
    findSession: (tokenHash) => findGateSession(exec, tokenHash),
    touchSession: (id, now) => touchGateSession(exec, id, now),
  });
  if (outcome.kind === 'respond') return stampGateHeaders(outcome.response);

  const response = await legacyMiddleware(req, event);
  return stampAny(response ?? NextResponse.next());
}

export const config = {
  matcher: [
    // Everything except Next's hashed build assets: on the staging host the gate
    // must also cover `/_next/image`, public files and API routes. Other hosts
    // keep the old path set through `runsLegacyMiddleware()`, which reproduces
    // the previous two matcher entries exactly.
    '/((?!_next/static/).*)',
  ],
};
