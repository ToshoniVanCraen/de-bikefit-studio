/**
 * The staging gate's database work on the Node side (login, logout, the
 * login page's session check), over Drizzle. Not `server-only`, and every
 * function takes an optional `db` (default `getCmsDb()`), so the self-test
 * can drive the same code on its own PGlite. The edge middleware does NOT use
 * this module; it reads the same tables with raw SQL (`./store-edge.ts`).
 * Design: `docs/staging-gate.md` §3.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getCmsDb, type CmsDatabase } from '@/db/cms';
import { cmsStagingGateAccounts, cmsStagingGateSessions } from '@/db/cms-staging-gate-schema';
import { verifyPassword } from '@/lib/cms/password';
import { reserveRateLimit } from '@/lib/rate-limit';
import {
  decideLogin,
  gateRateLimitScopes,
  type GateAccountRecord,
  type GateLoginInput,
} from './auth';
import type { GateSessionRow } from './policy';
import { formatGateCookie, gateTokenTag, generateGateToken } from './token';

async function resolveDb(db?: CmsDatabase): Promise<CmsDatabase> {
  return db ?? (await getCmsDb());
}

/** The account with exactly this (already normalised) identifier, revoked or not. */
export async function findGateAccount(
  identifier: string,
  db?: CmsDatabase,
): Promise<GateAccountRecord | null> {
  const [row] = await (
    await resolveDb(db)
  )
    .select({
      id: cmsStagingGateAccounts.id,
      passwordHash: cmsStagingGateAccounts.passwordHash,
      revokedAt: cmsStagingGateAccounts.revokedAt,
    })
    .from(cmsStagingGateAccounts)
    .where(eq(cmsStagingGateAccounts.identifier, identifier))
    .limit(1);
  return row ?? null;
}

export type GateLoginOutcome =
  { kind: 'too_many' } | { kind: 'invalid' } | { kind: 'ok'; cookieValue: string };

/**
 * The sign-in core: rate limit first (every attempt counts, nothing is given
 * back), then exactly one scrypt run, then a new session row keyed by the
 * cookie's HMAC tag. The caller has checked that the gate is active and
 * passes its secret; it sets the cookie and redirects. Throws on database
 * errors and `PasswordHasherBusyError`.
 */
export async function performGateLogin(params: {
  input: GateLoginInput;
  ip: string | null;
  secret: string;
  db?: CmsDatabase;
  nowMs?: number;
}): Promise<GateLoginOutcome> {
  const db = await resolveDb(params.db);
  const scopes = gateRateLimitScopes({ identifierKey: params.input.identifierKey, ip: params.ip });
  const reserved = await reserveRateLimit(db, scopes, params.nowMs);
  if (!reserved.ok) return { kind: 'too_many' };

  const decision = await decideLogin(params.input, {
    findAccount: (identifier) => findGateAccount(identifier, db),
    verify: verifyPassword,
  });
  if (!decision.ok) return { kind: 'invalid' };

  const token = generateGateToken();
  const tag = await gateTokenTag(params.secret, token);
  await db.insert(cmsStagingGateSessions).values({ accountId: decision.accountId, tokenHash: tag });
  return { kind: 'ok', cookieValue: formatGateCookie(token, tag) };
}

/** The session behind a recomputed tag, joined with its account; null when there is none. */
export async function findGateSessionByTag(
  tag: string,
  db?: CmsDatabase,
): Promise<GateSessionRow | null> {
  const [row] = await (
    await resolveDb(db)
  )
    .select({
      createdAt: cmsStagingGateSessions.createdAt,
      lastUsedAt: cmsStagingGateSessions.lastUsedAt,
      revokedAt: cmsStagingGateSessions.revokedAt,
      accountRevokedAt: cmsStagingGateAccounts.revokedAt,
    })
    .from(cmsStagingGateSessions)
    .innerJoin(
      cmsStagingGateAccounts,
      eq(cmsStagingGateAccounts.id, cmsStagingGateSessions.accountId),
    )
    .where(eq(cmsStagingGateSessions.tokenHash, tag))
    .limit(1);
  return row ?? null;
}

/** Logout: revokes the one session with this recomputed tag (idempotent). */
export async function revokeGateSessionByTag(tag: string, db?: CmsDatabase): Promise<void> {
  await (
    await resolveDb(db)
  )
    .update(cmsStagingGateSessions)
    .set({ revokedAt: sql`now()` })
    .where(
      and(eq(cmsStagingGateSessions.tokenHash, tag), isNull(cmsStagingGateSessions.revokedAt)),
    );
}
