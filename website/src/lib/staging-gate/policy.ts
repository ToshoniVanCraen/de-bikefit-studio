/**
 * The staging gate's pure rules: paths, session lifetime and the return path
 * after sign-in. No I/O, no Next, no Node — unit-tested in `policy.test.ts`.
 * Design: `docs/staging-gate.md` §2–3.
 */

export const GATE_LOGIN_PATH = '/staging-toegang';
export const GATE_LOGIN_POST_PATH = '/api/staging-gate/login';
export const GATE_LOGOUT_PATH = '/staging-toegang/afmelden';
export const GATE_HEALTH_PATH = '/api/staging-gate/health';
/** Request header carrying `STAGING_GATE_HEALTH_TOKEN` (Arend's `site-health`). */
export const GATE_HEALTH_HEADER = 'x-staging-gate-token';

/** Human sessions: 8 hours after sign-in at the latest, 30 minutes without a request. */
export const GATE_ABSOLUTE_LIFETIME_MS = 8 * 60 * 60 * 1000;
export const GATE_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** `reden=` values the login page understands. */
export const GATE_REASONS = ['verlopen', 'afgemeld'] as const;
export type GateReason = (typeof GATE_REASONS)[number];

/**
 * Paths a visitor may reach on the staging host without a session: the login
 * page (GET/HEAD only), its dedicated login POST route, the icons, the brand
 * files the login page shows, and the two signature-verified webhooks. Never
 * permit a Server Action POST on the login page: Next can execute a different
 * page's action there via its action forwarding. `/_next/static` is
 * excluded by the matcher and `/robots.txt` is answered inline, so neither is
 * listed here. The logout page is NOT public: it needs the session it ends.
 */
export function isGatePublicPath(pathname: string, method: string): boolean {
  if (pathname === GATE_LOGIN_PATH) return method === 'GET' || method === 'HEAD';
  if (pathname === GATE_LOGIN_POST_PATH) return method === 'POST';
  if (pathname === '/favicon.ico' || pathname === '/icon.svg' || pathname === '/apple-icon.png') {
    return method === 'GET' || method === 'HEAD';
  }
  return (
    ((method === 'GET' || method === 'HEAD') && pathname.startsWith('/brand/')) ||
    (method === 'POST' &&
      (pathname === '/api/webhooks/clerk' || pathname === '/api/webhooks/stripe'))
  );
}

export type GateSessionRow = {
  createdAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
  accountRevokedAt: Date | null;
};

export type GateSessionDecision =
  | { valid: false; reason: 'revoked' | 'account_revoked' | 'absolute' | 'idle' }
  | { valid: true; touch: boolean };

/**
 * Whether a stored session may be used `now`, and whether its use should be
 * recorded. Revocation (session or account) wins over everything; the
 * absolute end is measured from `created_at`, the idle end from
 * `last_used_at`. A clock that went backwards (negative ages) is treated as
 * "just now".
 */
export function evaluateGateSession(
  row: GateSessionRow,
  now: Date = new Date(),
): GateSessionDecision {
  if (row.revokedAt !== null) return { valid: false, reason: 'revoked' };
  if (row.accountRevokedAt !== null) return { valid: false, reason: 'account_revoked' };
  const age = Math.max(0, now.getTime() - row.createdAt.getTime());
  if (age >= GATE_ABSOLUTE_LIFETIME_MS) return { valid: false, reason: 'absolute' };
  const idle = Math.max(0, now.getTime() - row.lastUsedAt.getTime());
  if (idle >= GATE_IDLE_TIMEOUT_MS) return { valid: false, reason: 'idle' };
  // Persist every positive interval of activity. A throttle would expire an
  // actively used session before the promised 30 minutes of inactivity.
  return { valid: true, touch: idle > 0 };
}

export const GATE_RETURN_MAX_LENGTH = 2048;

/**
 * Where a successful sign-in sends the visitor: the requested path and query
 * when they are a same-origin path, otherwise `fallback`. Refuses anything
 * that could leave the origin (`//evil`, `/\evil`, a scheme), control
 * characters, over-long values and the gate's own pages (no redirect loops).
 * The fragment never reaches the server and is dropped.
 */
export function safeReturnPath(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string') return fallback;
  if (value.length === 0 || value.length > GATE_RETURN_MAX_LENGTH) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;

  let url: URL;
  try {
    url = new URL(value, 'https://staging.invalid');
  } catch {
    return fallback;
  }
  if (url.origin !== 'https://staging.invalid') return fallback;
  if (url.username || url.password) return fallback;
  // Next's route matching may decode escaped path segments. Validate that
  // interpretation too, otherwise `/%73taging-toegang` can loop at login.
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return fallback;
  }
  if (/[\\\u0000-\u001f\u007f]/.test(decodedPath) || decodedPath.startsWith('//')) {
    return fallback;
  }
  if (decodedPath === GATE_LOGIN_PATH || decodedPath.startsWith(`${GATE_LOGIN_PATH}/`)) {
    return fallback;
  }
  return `${url.pathname}${url.search}`;
}
