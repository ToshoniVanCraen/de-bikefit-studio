/**
 * The staging gate's session store as Next 16 middleware sees it: raw,
 * parameterised SQL over an injectable executor. Runtime-neutral on purpose
 * (no `process.env`, no Next, no `server-only`, no Drizzle): the middleware
 * runs it in the Edge middleware over `@neondatabase/serverless` HTTP, and the unit
 * tests run it against a fake executor. Design: `docs/staging-gate.md` §2
 * step 4.
 *
 * Tables and columns: `src/db/cms-staging-gate-schema.ts` (migration
 * `drizzle/0013_cms_staging_gate.sql`). A rename there must be mirrored here.
 */
import { neon } from '@neondatabase/serverless';

/** Runs one parameterised statement (`$1`, `$2`, …) and returns its rows. */
export type GateSqlExecutor = (
  text: string,
  params: unknown[],
) => Promise<Record<string, unknown>[]>;

/**
 * An executor over Neon's HTTP driver (v1 API: `neon(url)` returns a tagged
 * template function whose `.query(text, params)` takes a plain string with
 * `$n` placeholders and resolves to the rows as objects).
 */
export function createNeonExecutor(databaseUrl: string): GateSqlExecutor {
  const sql = neon(databaseUrl);
  return async (text, params) => {
    const rows = await sql.query(text, params);
    return rows as Record<string, unknown>[];
  };
}

export type GateStoredSession = {
  id: string;
  accountId: string;
  createdAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
  accountRevokedAt: Date | null;
};

const FIND_SESSION_SQL = `select s.id, s.account_id, s.created_at, s.last_used_at, s.revoked_at, a.revoked_at as account_revoked_at
from cms_staging_gate_sessions s
join cms_staging_gate_accounts a on a.id = s.account_id
where s.token_hash = $1
limit 1`;

const TOUCH_SESSION_SQL = `update cms_staging_gate_sessions
set last_used_at = $2::timestamptz
where id = $1::uuid and revoked_at is null and last_used_at < $2::timestamptz`;

/** Thrown when a row does not have the shape the schema promises. */
class GateStoreShapeError extends Error {
  constructor(column: string) {
    super(`unexpected value in column ${column}`);
    this.name = 'GateStoreShapeError';
  }
}

/**
 * A `timestamptz` as the driver hands it over: a `Date` (default type
 * parsers, PGlite) or a string (`2026-10-18 09:30:00.123+00`, ISO). An
 * unparseable value throws, so the caller fails closed instead of treating
 * garbage as "no expiry".
 */
function toDate(value: unknown, column: string): Date {
  const date =
    value instanceof Date
      ? new Date(value.getTime())
      : typeof value === 'string' || typeof value === 'number'
        ? new Date(value)
        : null;
  if (!date || Number.isNaN(date.getTime())) throw new GateStoreShapeError(column);
  return date;
}

function toNullableDate(value: unknown, column: string): Date | null {
  return value === null || value === undefined ? null : toDate(value, column);
}

function toId(value: unknown, column: string): string {
  if (typeof value !== 'string' || value === '') throw new GateStoreShapeError(column);
  return value;
}

/**
 * The session whose `token_hash` is `tokenHash`, joined with its account;
 * null when there is none. `tokenHash` must be the tag the server recomputed
 * (`verifyGateCookie()`), never bytes from the client. Database errors
 * propagate: the caller answers 503, the request never passes.
 */
export async function findGateSession(
  exec: GateSqlExecutor,
  tokenHash: string,
): Promise<GateStoredSession | null> {
  const rows = await exec(FIND_SESSION_SQL, [tokenHash]);
  const row = rows[0];
  if (!row) return null;
  return {
    id: toId(row.id, 'id'),
    accountId: toId(row.account_id, 'account_id'),
    createdAt: toDate(row.created_at, 'created_at'),
    lastUsedAt: toDate(row.last_used_at, 'last_used_at'),
    revokedAt: toNullableDate(row.revoked_at, 'revoked_at'),
    accountRevokedAt: toNullableDate(row.account_revoked_at, 'account_revoked_at'),
  };
}

/**
 * Records a use of the session: `last_used_at` moves to `now`, but only
 * forward and never on a revoked session (one conditional UPDATE, safe under
 * parallel requests).
 */
export async function touchGateSession(
  exec: GateSqlExecutor,
  id: string,
  now: Date,
): Promise<void> {
  await exec(TOUCH_SESSION_SQL, [id, now.toISOString()]);
}

/**
 * Probe every table needed for sign-in/session validation, not merely the DB
 * socket: an unapplied gate migration must make site-health unhealthy.
 * `where false` checks relation/column availability without reading PII.
 */
export async function checkGateDatabase(exec: GateSqlExecutor): Promise<boolean> {
  try {
    await exec(
      `select a.id, a.identifier, a.password_hash, a.revoked_at,
              s.id, s.account_id, s.token_hash, s.created_at, s.last_used_at, s.revoked_at,
              r.scope, r.hits, r.updated_at
       from cms_staging_gate_accounts a
       cross join cms_staging_gate_sessions s
       cross join cms_rate_limits r
       where false`,
      [],
    );
    return true;
  } catch {
    return false;
  }
}
