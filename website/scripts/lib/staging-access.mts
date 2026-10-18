/**
 * Core of `npm run staging:access` (staging gate accounts, issue #18), apart
 * from argument parsing so the self-test can drive it on its own PGlite.
 * Design: docs/staging-gate.md §3. Request-scope free: no cookies, no Next.
 *
 * Passwords are generated here (`generateTemporaryPassword()`), hashed with
 * scrypt (`hashPassword()`) and RETURNED to the caller, which prints them
 * once; nothing here logs a password or a hash. `log` gets identifiers,
 * dates, notes and counts only.
 */
import type { CmsDatabase } from '@/db/cms';

export type StagingAccessCommand =
  | { kind: 'list' }
  | { kind: 'add'; identifier: string; note: string }
  | { kind: 'reset-password'; identifier: string }
  | { kind: 'revoke'; identifier: string };

export type StagingAccessResult = {
  /** Only for `add` and `reset-password`: the new password, to be handed over privately. */
  password?: string;
};

/** The note is free text for the operator (who / approval reference): one line, bounded. */
const NOTE_MAX_LENGTH = 200;

function checkNote(note: string): string {
  const trimmed = note.trim();
  if (trimmed.length > NOTE_MAX_LENGTH) {
    throw new Error(`--note may be at most ${NOTE_MAX_LENGTH} characters`);
  }
  if (/[\u0000-\u001f\u007f]/.test(trimmed))
    throw new Error('--note may not contain control characters');
  return trimmed;
}

export async function runStagingAccess(input: {
  db: CmsDatabase;
  command: StagingAccessCommand;
  log: (symbol: string, message: string) => void;
}): Promise<StagingAccessResult> {
  const { db, command, log } = input;
  const { and, eq, isNull, sql } = await import('drizzle-orm');
  const { cmsStagingGateAccounts: accounts, cmsStagingGateSessions: sessions } =
    await import('@/db/cms-staging-gate-schema');
  const { generateTemporaryPassword, hashPassword } = await import('@/lib/cms/password');
  const { normalizeGateIdentifier } = await import('@/lib/staging-gate/auth');

  if (command.kind === 'list') {
    const rows = await db
      .select({
        identifier: accounts.identifier,
        note: accounts.note,
        createdAt: accounts.createdAt,
        revokedAt: accounts.revokedAt,
        sessions: sql<number>`count(${sessions.id})::int`,
      })
      .from(accounts)
      .leftJoin(sessions, and(eq(sessions.accountId, accounts.id), isNull(sessions.revokedAt)))
      .groupBy(accounts.id)
      .orderBy(accounts.identifier);
    if (rows.length === 0) log('=', 'no staging gate accounts');
    for (const row of rows) {
      const status = row.revokedAt ? `revoked ${row.revokedAt.toISOString()}` : 'active';
      log(
        '=',
        `${row.identifier} · ${status} · created ${row.createdAt.toISOString()} · ` +
          `${Number(row.sessions)} unrevoked session(s)${row.note ? ` · ${row.note}` : ''}`,
      );
    }
    return {};
  }

  const identifier = normalizeGateIdentifier(command.identifier);
  if (!identifier) {
    throw new Error(
      '--identifier must be an e-mail address or a 3–64 character username of a-z 0-9 . _ -',
    );
  }
  const [existing] = await db
    .select({ id: accounts.id, revokedAt: accounts.revokedAt })
    .from(accounts)
    .where(eq(accounts.identifier, identifier))
    .limit(1);

  if (command.kind === 'add') {
    const note = checkNote(command.note);
    if (existing) {
      throw new Error(
        `${identifier} already exists${existing.revokedAt ? ' (revoked)' : ''}; nothing changed`,
      );
    }
    const password = generateTemporaryPassword();
    const inserted = await db
      .insert(accounts)
      .values({ identifier, passwordHash: await hashPassword(password), note })
      .onConflictDoNothing({ target: accounts.identifier })
      .returning({ id: accounts.id });
    if (inserted.length !== 1) throw new Error(`${identifier} already exists; nothing changed`);
    log('✓', `account ${identifier} created`);
    return { password };
  }

  if (!existing) throw new Error(`no staging gate account ${identifier}; nothing changed`);

  if (command.kind === 'reset-password') {
    if (existing.revokedAt) {
      throw new Error(`${identifier} is revoked; a password reset does not restore access`);
    }
    const password = generateTemporaryPassword();
    // New hash first, then the old sessions: whoever held the old password is out either way.
    await db
      .update(accounts)
      .set({ passwordHash: await hashPassword(password) })
      .where(and(eq(accounts.id, existing.id), isNull(accounts.revokedAt)));
    const ended = await db
      .update(sessions)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(sessions.accountId, existing.id), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    log('✓', `password of ${identifier} replaced; ${ended.length} session(s) revoked`);
    return { password };
  }

  // revoke: the account first (the middleware checks it on every request), then its sessions.
  const revoked = await db
    .update(accounts)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(accounts.id, existing.id), isNull(accounts.revokedAt)))
    .returning({ id: accounts.id });
  const ended = await db
    .update(sessions)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(sessions.accountId, existing.id), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  log(
    '✓',
    `${identifier} ${revoked.length === 1 ? 'revoked' : 'was already revoked'}; ` +
      `${ended.length} session(s) revoked`,
  );
  return {};
}
