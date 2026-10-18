/**
 * Core of `npm run staging:access` (staging gate accounts, issue #18), apart
 * from argument parsing so the self-test can drive it on its own PGlite.
 * Design: docs/staging-gate.md §3. Request-scope free: no cookies, no Next.
 *
 * `add` and `reset-password` take the password one of two ways:
 * - provided (vault-first, the staging handoff): `password` is what the CLI
 *   read from stdin (`--password-stdin`). It is checked here again with
 *   `checkProvidedPassword()` (one line, no control characters, the CMS
 *   strength rules) BEFORE any query, hashed, and never returned: the result
 *   has no `password` key, because the vault item already holds it;
 * - generated (no `password`; the fallback, e.g. locally):
 *   `generateTemporaryPassword()`, RETURNED to the caller, which prints it once.
 * Either way only the scrypt hash (`hashPassword()`) is stored, and nothing
 * here logs or throws a password or a hash: `log` gets identifiers, dates,
 * notes, counts and where the password came from.
 */
import type { CmsDatabase } from '@/db/cms';

export type StagingAccessCommand =
  | { kind: 'list' }
  | {
      kind: 'add';
      identifier: string;
      note: string;
      /** Provided (vault-first) password; absent → a generated one is returned. */
      password?: string;
    }
  | {
      kind: 'reset-password';
      identifier: string;
      /** Provided (vault-first) password; absent → a generated one is returned. */
      password?: string;
    }
  | { kind: 'revoke'; identifier: string };

export type StagingAccessResult =
  /** `add` / `reset-password` with a generated password: to be handed over privately, once. */
  | { password: string }
  /** `list`, `revoke` and a provided password: nothing to show, no `password` key at all. */
  | { password?: never };

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

/**
 * Runs a write whose parameters include the password hash. Drizzle's error
 * text repeats every query parameter (`Failed query: … params: …`), so a
 * failure is re-thrown with only the SQLSTATE or the error's class name, and
 * without the original error as its cause.
 */
async function writeWithHash<T>(write: () => PromiseLike<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    const code = (cause as { code?: unknown } | null)?.code;
    const reason =
      typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)
        ? `SQLSTATE ${code}`
        : cause instanceof Error
          ? cause.name
          : 'unknown error';
    throw new Error(`database write failed (${reason}); its parameters are not shown`);
  }
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
  const { checkProvidedPassword } = await import('@/lib/staging-gate/password-stdin');

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
  // A provided password is refused before any query; the message is fixed, never the input.
  const provided = command.kind === 'revoke' ? undefined : command.password;
  if (provided !== undefined) {
    const checked = checkProvidedPassword(provided);
    if (!checked.ok) throw new Error(checked.message);
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
    const password = provided ?? generateTemporaryPassword();
    const passwordHash = await hashPassword(password);
    const inserted = await writeWithHash(() =>
      db
        .insert(accounts)
        .values({ identifier, passwordHash, note })
        .onConflictDoNothing({ target: accounts.identifier })
        .returning({ id: accounts.id }),
    );
    if (inserted.length !== 1) throw new Error(`${identifier} already exists; nothing changed`);
    if (provided !== undefined) {
      log('✓', `account ${identifier} created (password from stdin)`);
      return {};
    }
    log('✓', `account ${identifier} created`);
    return { password };
  }

  if (!existing) throw new Error(`no staging gate account ${identifier}; nothing changed`);

  if (command.kind === 'reset-password') {
    if (existing.revokedAt) {
      throw new Error(`${identifier} is revoked; a password reset does not restore access`);
    }
    const password = provided ?? generateTemporaryPassword();
    const passwordHash = await hashPassword(password);
    // New hash first, then the old sessions: whoever held the old password is out either way.
    await writeWithHash(() =>
      db
        .update(accounts)
        .set({ passwordHash })
        .where(and(eq(accounts.id, existing.id), isNull(accounts.revokedAt))),
    );
    const ended = await db
      .update(sessions)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(sessions.accountId, existing.id), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    if (provided !== undefined) {
      log('✓', `password of ${identifier} replaced from stdin; ${ended.length} session(s) revoked`);
      return {};
    }
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
