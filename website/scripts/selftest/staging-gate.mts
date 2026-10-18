/**
 * Self-test section 20: the first-party staging access gate (issue #18,
 * design: `docs/staging-gate.md` §3 and §5), on the throwaway PGlite of
 * `cms-selftest.mts`. Drives the real modules: the account CLI core
 * (`scripts/lib/staging-access.mts`), the Node sign-in repo
 * (`src/lib/staging-gate/auth-repo.ts`), the edge store's raw SQL
 * (`src/lib/staging-gate/store-edge.ts`, over an executor on this PGlite),
 * the cookie (`token.ts`), the session policy (`policy.ts`) and the health
 * decision (`health.ts`).
 *
 *  A. migration 0013: both tables and their columns, additive, re-runnable,
 *     one copy of every table, constraint and index afterwards;
 *  B. named accounts: add (normalised identifier, scrypt hash, the password
 *     returned once and never logged), duplicate refused, list, reset-password;
 *  C. sign-in: unknown, wrong password and revoked all end in the same
 *     `invalid` (no session written), the identifier and IP limits refuse
 *     even a correct password, success writes one session keyed by the tag;
 *  D. edge store: lookup + policy valid, account revoke ends the session,
 *     8 h absolute and 30 min idle end on back-dated rows, the touch rule;
 *  E. logout ends exactly one session; forged cookies never reach the store;
 *  F. health: token check, probe answers, the database probe.
 *
 * Time is moved by back-dating columns or passing `now`, never by sleeping.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CmsDatabase } from '@/db/cms';

type Check = (label: string, condition: boolean, detail?: string) => void;

/** Test-only secrets (≥ 32 characters), never used outside this throwaway database. */
const SECRET = 'selftest-staging-gate-secret-0123456789abcdef';
const OTHER_SECRET = 'selftest-staging-gate-other-secret-9876543210';
const HEALTH_TOKEN = 'selftest-staging-gate-health-token-0123456789';
const REVIEWER_ONE = 'reviewer.een@selftest.local';
const REVIEWER_TWO = 'reviewer-twee';
const LEAVER = 'vertrokken@selftest.local';
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;

export async function stagingGateSection(ctx: {
  db: CmsDatabase;
  check: Check;
  section: (title: string) => void;
}) {
  const { db, check, section } = ctx;
  section('20. staging access gate (issue #18): accounts, sign-in, sessions, health');

  const { and, eq, isNull, sql } = await import('drizzle-orm');
  const { cmsStagingGateAccounts: accounts, cmsStagingGateSessions: sessions } =
    await import('@/db/cms-staging-gate-schema');
  const { runStagingAccess } = await import('../lib/staging-access.mjs');
  const repo = await import('@/lib/staging-gate/auth-repo');
  const { GATE_RATE_LIMIT_MAX, gateIdentifierKey, gateIpKey, gateRateLimitScopes } =
    await import('@/lib/staging-gate/auth');
  const { parseGateLoginForm } = await import('@/lib/staging-gate/auth');
  const { GATE_FIELD_IDENTIFIER, GATE_FIELD_PASSWORD } =
    await import('@/lib/staging-gate/form-state');
  const token = await import('@/lib/staging-gate/token');
  const policy = await import('@/lib/staging-gate/policy');
  const store = await import('@/lib/staging-gate/store-edge');
  const { decideHealthAccess, healthProbeResult } = await import('@/lib/staging-gate/health');
  const { reserveRateLimit } = await import('@/lib/rate-limit');
  const { verifyPassword } = await import('@/lib/cms/password');

  const rowsOf = async (query: ReturnType<typeof sql>) =>
    ((await db.execute(query)) as unknown as { rows: Array<Record<string, unknown>> }).rows;
  /** The edge store's executor, here over this PGlite: `$n` placeholders become bound parameters. */
  let execCalls = 0;
  const exec: import('@/lib/staging-gate/store-edge').GateSqlExecutor = async (text, params) => {
    execCalls += 1;
    const parts = text.split(/\$(\d+)/);
    const chunks = parts.map((part, i) =>
      i % 2 === 0 ? sql.raw(part) : sql`${params[Number(part) - 1]}`,
    );
    return rowsOf(sql.join(chunks));
  };
  const logLines: string[] = [];
  const cli = (command: Parameters<typeof runStagingAccess>[0]['command']) =>
    runStagingAccess({
      db,
      command,
      log: (symbol, message) => logLines.push(`${symbol} ${message}`),
    });
  const cliError = async (command: Parameters<typeof runStagingAccess>[0]['command']) => {
    try {
      await cli(command);
      return 'ok';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };
  const accountRow = async (identifier: string) =>
    (await db.select().from(accounts).where(eq(accounts.identifier, identifier)).limit(1))[0];
  const sessionRow = async (id: string) =>
    (await db.select().from(sessions).where(eq(sessions.id, id)).limit(1))[0];
  const sessionCount = async () => (await db.select({ id: sessions.id }).from(sessions)).length;
  const login = (identifier: string, password: string, ip: string | null) => {
    const parsed = parseGateLoginForm(
      new Map([
        [GATE_FIELD_IDENTIFIER, identifier],
        [GATE_FIELD_PASSWORD, password],
      ]),
    );
    if (!parsed.ok) throw new Error('selftest: login form did not parse');
    return repo.performGateLogin({ input: parsed.input, ip, secret: SECRET, db });
  };
  /** A session row as a sign-in writes it, without the scrypt run (test-only). */
  const newSession = async (accountId: string) => {
    const raw = token.generateGateToken();
    const tag = await token.gateTokenTag(SECRET, raw);
    const [row] = await db
      .insert(sessions)
      .values({ accountId, tokenHash: tag })
      .returning({ id: sessions.id });
    return { id: row.id, tag, cookie: token.formatGateCookie(raw, tag) };
  };
  /** Test-only: stands for time passing. */
  const setTimes = (id: string, createdAt: Date, lastUsedAt: Date) =>
    db.update(sessions).set({ createdAt, lastUsedAt }).where(eq(sessions.id, id));
  const decide = async (tag: string, now: Date) => {
    const found = await store.findGateSession(exec, tag);
    return found ? policy.evaluateGateSession(found, now) : null;
  };
  const hitsFor = async (key: string | null) =>
    key === null
      ? -1
      : Number(
          (
            await rowsOf(
              sql`select coalesce(cardinality(hits), 0) as n from cms_rate_limits where scope = ${key}`,
            )
          )[0]?.n ?? 0,
        );

  // A. migration 0013 ------------------------------------------------------
  const columnsOf = async (table: string) =>
    (
      await rowsOf(
        sql`select column_name from information_schema.columns where table_name = ${table} order by column_name`,
      )
    )
      .map((r) => String(r.column_name))
      .join(',');
  check(
    'migration 0013: cms_staging_gate_accounts has exactly its six columns',
    (await columnsOf('cms_staging_gate_accounts')) ===
      'created_at,id,identifier,note,password_hash,revoked_at',
    await columnsOf('cms_staging_gate_accounts'),
  );
  check(
    'migration 0013: cms_staging_gate_sessions has exactly its six columns (no IP, no user agent)',
    (await columnsOf('cms_staging_gate_sessions')) ===
      'account_id,created_at,id,last_used_at,revoked_at,token_hash',
    await columnsOf('cms_staging_gate_sessions'),
  );
  const migrationSql = await readFile(
    resolve(process.cwd(), 'drizzle/0013_cms_staging_gate.sql'),
    'utf8',
  );
  const code0013 = migrationSql.replace(/^--.*$/gm, '');
  check(
    'migration 0013: additive (two CREATE TABLE IF NOT EXISTS, guarded FK, no DROP / TRUNCATE / DELETE / UPDATE, no webshop or cms_users table)',
    // `ON DELETE cascade` on the foreign key is expected; a DELETE statement is not.
    !/\b(DROP|TRUNCATE)\b|\bDELETE\s+FROM\b|\bUPDATE\s+"?\w+"?\s+SET\b/i.test(code0013) &&
      !/"(users|products|orders|order_items|cms_users)"/.test(code0013) &&
      (code0013.match(/\bCREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/g) ?? []).length === 2 &&
      /WHEN duplicate_object THEN null/.test(code0013),
  );
  let rerun = 'ok';
  try {
    for (let pass = 0; pass < 2; pass += 1) {
      for (const statement of migrationSql.split('--> statement-breakpoint')) {
        if (statement.replace(/^--.*$/gm, '').trim()) await db.execute(sql.raw(statement));
      }
    }
  } catch (error) {
    rerun = error instanceof Error ? error.message : String(error);
  }
  check('migration 0013: re-running it twice does not throw', rerun === 'ok', rerun);
  const objects = await rowsOf(
    sql`select
      (select count(*) from pg_tables where tablename like 'cms_staging_gate_%')::int as tables,
      (select count(*) from pg_constraint where conname = 'cms_staging_gate_sessions_account_id_cms_staging_gate_accounts_id_fk')::int as fks,
      (select count(*) from pg_indexes where tablename like 'cms_staging_gate_%')::int as indexes`,
  );
  check(
    'migration 0013: one copy afterwards (2 tables, 1 foreign key, 6 indexes incl. pkeys and uniques)',
    Number(objects[0]?.tables) === 2 &&
      Number(objects[0]?.fks) === 1 &&
      Number(objects[0]?.indexes) === 6,
    JSON.stringify(objects[0]),
  );

  // B. named accounts through the CLI core ----------------------------------
  const added = await cli({
    kind: 'add',
    identifier: '  Reviewer.Een@Selftest.LOCAL ',
    note: 'PR #18',
  });
  const addedTwo = await cli({ kind: 'add', identifier: REVIEWER_TWO, note: '' });
  const addedLeaver = await cli({ kind: 'add', identifier: LEAVER, note: 'tijdelijk' });
  const one = await accountRow(REVIEWER_ONE);
  check(
    'staging:access --add stores the trimmed, lower-cased identifier with its note',
    one?.identifier === REVIEWER_ONE && one.note === 'PR #18' && one.revokedAt === null,
  );
  const passwordOne = added.password ?? '';
  check(
    'staging:access --add returns a generated password once, and it is not a hash',
    passwordOne.length >= 12 &&
      !passwordOne.startsWith('scrypt$') &&
      typeof addedTwo.password === 'string' &&
      addedTwo.password !== passwordOne,
  );
  check(
    'staging:access --add stores only a scrypt hash that verifies the returned password',
    !!one &&
      one.passwordHash.startsWith('scrypt$') &&
      !one.passwordHash.includes(passwordOne) &&
      (await verifyPassword(passwordOne, one.passwordHash)),
  );
  check(
    'staging:access --add refuses an existing identifier (any case) and changes nothing',
    (await cliError({ kind: 'add', identifier: 'REVIEWER.EEN@selftest.local', note: '' })).includes(
      'already exists',
    ) && (await accountRow(REVIEWER_ONE))?.passwordHash === one?.passwordHash,
  );
  logLines.length = 0;
  const listed = await cli({ kind: 'list' });
  const listText = logLines.join('\n');
  check(
    'staging:access --list shows both named reviewers as active, without any password or hash',
    listed.password === undefined &&
      logLines.some((l) => l.includes(REVIEWER_ONE) && l.includes('active')) &&
      logLines.some((l) => l.includes(REVIEWER_TWO) && l.includes('active')) &&
      !listText.includes('scrypt$') &&
      !listText.includes(passwordOne),
    listText,
  );
  const reset = await cli({ kind: 'reset-password', identifier: REVIEWER_ONE });
  const passwordOneNew = reset.password ?? '';
  const oneAfterReset = await accountRow(REVIEWER_ONE);
  check(
    'staging:access --reset-password returns a new password and replaces the hash (old one no longer verifies)',
    passwordOneNew !== '' &&
      passwordOneNew !== passwordOne &&
      oneAfterReset?.passwordHash !== one?.passwordHash &&
      !(await verifyPassword(passwordOne, oneAfterReset?.passwordHash ?? '')),
  );
  check(
    'staging:access never logs a password or a hash',
    !logLines.join('\n').includes(passwordOneNew) && !logLines.join('\n').includes('scrypt$'),
  );

  // C. sign-in core ----------------------------------------------------------
  await cli({ kind: 'revoke', identifier: LEAVER });
  const unknown = await login('niemand@selftest.local', 'Wat-Dan-Ook-2026', '10.18.0.1');
  const wrong = await login(REVIEWER_ONE, `${passwordOneNew}x`, '10.18.0.2');
  const revoked = await login(LEAVER, addedLeaver.password ?? '', '10.18.0.3');
  check(
    'sign-in: unknown identifier, wrong password and revoked account give the identical generic failure',
    JSON.stringify(unknown) === '{"kind":"invalid"}' &&
      JSON.stringify(wrong) === JSON.stringify(unknown) &&
      JSON.stringify(revoked) === JSON.stringify(unknown),
    JSON.stringify([unknown, wrong, revoked]),
  );
  check('sign-in: a failed attempt writes no session', (await sessionCount()) === 0);
  const success = await login(REVIEWER_ONE.toUpperCase(), passwordOneNew, '10.18.0.4');
  const cookieOne = success.kind === 'ok' ? success.cookieValue : '';
  const tagOne = await token.verifyGateCookie(SECRET, cookieOne);
  const [rowOne] = tagOne
    ? await db.select().from(sessions).where(eq(sessions.tokenHash, tagOne))
    : [];
  check(
    'sign-in: success writes one session keyed by the cookie tag, the cookie verifies with the secret',
    success.kind === 'ok' &&
      tagOne !== null &&
      rowOne?.accountId === one?.id &&
      (await sessionCount()) === 1 &&
      !rowOne.tokenHash.includes(cookieOne.split('.')[1] ?? '?'),
  );
  check(
    'sign-in: the cookie does not verify under another secret',
    (await token.verifyGateCookie(OTHER_SECRET, cookieOne)) === null,
  );

  const twoKey = gateIdentifierKey(REVIEWER_TWO);
  for (let i = 0; i < GATE_RATE_LIMIT_MAX - 1; i += 1) {
    await reserveRateLimit(db, gateRateLimitScopes({ identifierKey: twoKey, ip: null }));
  }
  const tenthForTwo = await login(REVIEWER_TWO, 'Fout-Wachtwoord-2026', '10.18.1.1');
  const eleventhForTwo = await login(REVIEWER_TWO, addedTwo.password ?? '', '10.18.1.2');
  check(
    `rate limit: the identifier is refused after ${GATE_RATE_LIMIT_MAX} attempts, even with the right password and a fresh IP`,
    tenthForTwo.kind === 'invalid' &&
      eleventhForTwo.kind === 'too_many' &&
      (await hitsFor(twoKey)) === GATE_RATE_LIMIT_MAX,
    `${tenthForTwo.kind} / ${eleventhForTwo.kind} / ${await hitsFor(twoKey)}`,
  );
  const busyIp = '10.18.9.9';
  for (let i = 0; i < GATE_RATE_LIMIT_MAX - 1; i += 1) {
    await reserveRateLimit(
      db,
      gateRateLimitScopes({ identifierKey: gateIdentifierKey(`onbekend-${i}`), ip: busyIp }),
    );
  }
  const tenthFromIp = await login('nog-iemand@selftest.local', 'Wat-Dan-Ook-2026', busyIp);
  const eleventhFromIp = await login(REVIEWER_ONE, passwordOneNew, busyIp);
  check(
    `rate limit: the IP is refused after ${GATE_RATE_LIMIT_MAX} attempts, even for a valid account, and no session is written`,
    tenthFromIp.kind === 'invalid' &&
      eleventhFromIp.kind === 'too_many' &&
      (await hitsFor(gateIpKey(busyIp))) === GATE_RATE_LIMIT_MAX &&
      (await sessionCount()) === 1,
    `${tenthFromIp.kind} / ${eleventhFromIp.kind} / ${await hitsFor(gateIpKey(busyIp))}`,
  );
  check(
    'rate limit: keys are hashed, the raw identifier never reaches cms_rate_limits',
    (await rowsOf(sql`select scope from cms_rate_limits where scope like ${'%selftest.local%'}`))
      .length === 0,
  );

  // D. the edge store on this PGlite ----------------------------------------
  const now = new Date();
  const foundOne = tagOne ? await store.findGateSession(exec, tagOne) : null;
  check(
    'edge store: findGateSession by the tag finds the session, the policy says valid with activity due',
    foundOne?.id === rowOne?.id &&
      foundOne?.accountId === one?.id &&
      foundOne?.createdAt instanceof Date &&
      JSON.stringify(policy.evaluateGateSession(foundOne, now)) === '{"valid":true,"touch":true}',
    JSON.stringify(foundOne),
  );
  const two = await accountRow(REVIEWER_TWO);
  const twoSession = await newSession(two?.id ?? '');
  const beforeRevoke = await decide(twoSession.tag, now);
  await cli({ kind: 'revoke', identifier: REVIEWER_TWO });
  const afterRevoke = await decide(twoSession.tag, now);
  const twoSessionRow = await sessionRow(twoSession.id);
  check(
    'edge store: revoking the account ends its session at the next lookup, the row is revoked too',
    beforeRevoke?.valid === true &&
      afterRevoke?.valid === false &&
      twoSessionRow?.revokedAt !== null &&
      (await accountRow(REVIEWER_TWO))?.revokedAt !== null,
    JSON.stringify([beforeRevoke, afterRevoke]),
  );
  await db.update(sessions).set({ revokedAt: null }).where(eq(sessions.id, twoSession.id));
  check(
    'edge store: a revoked account wins even over a session row that was not revoked',
    JSON.stringify(await decide(twoSession.tag, now)) ===
      '{"valid":false,"reason":"account_revoked"}',
  );
  check(
    'staging:access --reset-password refuses a revoked account',
    (await cliError({ kind: 'reset-password', identifier: REVIEWER_TWO })).includes('revoked'),
  );

  const fresh = await newSession(one?.id ?? '');
  await setTimes(fresh.id, new Date(now.getTime() - 8 * HOUR - MIN), now);
  check(
    'edge store: 8 h + 1 min after sign-in the session is over, however recently it was used',
    JSON.stringify(await decide(fresh.tag, now)) === '{"valid":false,"reason":"absolute"}',
  );
  await setTimes(fresh.id, now, new Date(now.getTime() - 30 * MIN - SEC));
  check(
    'edge store: 30 min + 1 s without a request the session is over (idle)',
    JSON.stringify(await decide(fresh.tag, now)) === '{"valid":false,"reason":"idle"}',
  );
  await setTimes(fresh.id, now, new Date(now.getTime() - 29 * SEC));
  check(
    'touch rule: used 29 s ago → valid with a write due',
    JSON.stringify(await decide(fresh.tag, now)) === '{"valid":true,"touch":true}',
  );
  const lastUsedOld = new Date(now.getTime() - 31 * SEC);
  await setTimes(fresh.id, now, lastUsedOld);
  const due = await decide(fresh.tag, now);
  await store.touchGateSession(exec, fresh.id, now);
  const touched = await sessionRow(fresh.id);
  check(
    'touch rule: used 31 s ago → valid with a write due, touchGateSession moves last_used_at to now',
    JSON.stringify(due) === '{"valid":true,"touch":true}' &&
      touched?.lastUsedAt.getTime() === now.getTime(),
    touched?.lastUsedAt.toISOString(),
  );
  await store.touchGateSession(exec, fresh.id, new Date(now.getTime() - 10 * MIN));
  check(
    'touch rule: last_used_at never moves backwards',
    (await sessionRow(fresh.id))?.lastUsedAt.getTime() === now.getTime(),
  );
  await setTimes(fresh.id, now, lastUsedOld);
  await db
    .update(sessions)
    .set({ revokedAt: sql`now()` })
    .where(eq(sessions.id, fresh.id));
  await store.touchGateSession(exec, fresh.id, now);
  check(
    'touch rule: a revoked session is never touched',
    (await sessionRow(fresh.id))?.lastUsedAt.getTime() === lastUsedOld.getTime(),
  );

  // E. logout and forged cookies ---------------------------------------------
  const other = await newSession(one?.id ?? '');
  if (tagOne) await repo.revokeGateSessionByTag(tagOne, db);
  const loggedOut = rowOne ? await sessionRow(rowOne.id) : undefined;
  const byTag = tagOne ? await repo.findGateSessionByTag(tagOne, db) : null;
  check(
    'logout: revokeGateSessionByTag revokes that session; the Node and the edge lookup both say revoked',
    loggedOut?.revokedAt instanceof Date &&
      byTag !== null &&
      policy.evaluateGateSession(byTag, now).valid === false &&
      JSON.stringify(tagOne ? await decide(tagOne, now) : null) ===
        '{"valid":false,"reason":"revoked"}',
  );
  check(
    'logout: the other session of the same account is untouched and still valid',
    (await sessionRow(other.id))?.revokedAt === null &&
      (await decide(other.tag, now))?.valid === true,
  );
  if (tagOne) await repo.revokeGateSessionByTag(tagOne, db);
  check(
    'logout: idempotent (a second logout keeps the first revocation time)',
    (rowOne ? await sessionRow(rowOne.id) : undefined)?.revokedAt?.getTime() ===
      loggedOut?.revokedAt?.getTime(),
  );
  const [, tokenOne, tagPart] = cookieOne.split('.');
  const flipped = `${tagPart.slice(0, -1)}${tagPart.endsWith('A') ? 'B' : 'A'}`;
  const forged = [
    token.formatGateCookie(tokenOne, other.tag),
    token.formatGateCookie(tokenOne, flipped),
    token.formatGateCookie(token.generateGateToken(), tagPart),
    token.formatGateCookie(tokenOne, await token.gateTokenTag(OTHER_SECRET, tokenOne)),
    'v2.' + cookieOne.slice(3),
    `${cookieOne}=`,
    'garbage',
    '',
  ];
  execCalls = 0;
  let passed = 0;
  for (const value of forged) {
    const tag = await token.verifyGateCookie(SECRET, value);
    if (tag !== null) {
      passed += 1;
      await store.findGateSession(exec, tag);
    }
  }
  check(
    'forged cookies (wrong tag, swapped tag, other secret, bad version or shape) are refused before any store call',
    passed === 0 && execCalls === 0,
    `${passed} passed, ${execCalls} store calls`,
  );
  check(
    'a tag the client sent is not a lookup key: the other session tag under a stranger token finds nothing via verify',
    (await token.verifyGateCookie(SECRET, token.formatGateCookie(tokenOne, other.tag))) === null &&
      (await store.findGateSession(exec, flipped)) === null,
  );

  // F. health -----------------------------------------------------------------
  const active = {
    kind: 'active' as const,
    config: {
      secret: SECRET,
      healthToken: HEALTH_TOKEN,
      databaseUrl: 'postgres://selftest.invalid/x',
    },
  };
  const failed = '{"kind":"respond","status":401,"body":{"code":"gate_auth_failed"}}';
  check(
    'health: the right token may probe',
    decideHealthAccess(active, HEALTH_TOKEN).kind === 'probe',
  );
  check(
    'health: a wrong, shorter or missing token is the same 401 gate_auth_failed',
    JSON.stringify(decideHealthAccess(active, `${HEALTH_TOKEN.slice(0, -1)}x`)) === failed &&
      JSON.stringify(decideHealthAccess(active, 'kort')) === failed &&
      JSON.stringify(decideHealthAccess(active, null)) === failed,
  );
  check(
    'health: an inactive host is a bare 404, a misconfigured gate 503 gate_misconfigured',
    JSON.stringify(decideHealthAccess({ kind: 'inactive' }, HEALTH_TOKEN)) ===
      '{"kind":"respond","status":404,"body":null}' &&
      JSON.stringify(decideHealthAccess({ kind: 'misconfigured', reasons: [] }, HEALTH_TOKEN)) ===
        '{"kind":"respond","status":503,"body":{"code":"gate_misconfigured"}}',
  );
  check(
    'health: probe ok → 200 {status: ok}, probe failed → 503 app_unhealthy',
    JSON.stringify(healthProbeResult(true)) === '{"status":200,"body":{"status":"ok"}}' &&
      JSON.stringify(healthProbeResult(false)) === '{"status":503,"body":{"code":"app_unhealthy"}}',
  );
  check(
    'health: checkGateDatabase is true on the migrated database',
    await store.checkGateDatabase(exec),
  );
  check(
    'health: checkGateDatabase is false (not a throw) when the database fails',
    !(await store.checkGateDatabase(async () => {
      throw new Error('selftest: database unavailable');
    })),
  );
  const leftover = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.accountId, one?.id ?? ''), isNull(sessions.revokedAt)));
  check(
    'end state: only the untouched second session of reviewer one is still open',
    leftover.length === 1 && leftover[0].id === other.id,
  );
}
