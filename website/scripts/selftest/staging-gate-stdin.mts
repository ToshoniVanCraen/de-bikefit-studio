/**
 * Self-test section 20, part G (checked last by `./staging-gate.mts`):
 * vault-first passwords (`--password-stdin`, issue #18, `docs/staging-gate.md`
 * §3–§4) on the throwaway PGlite of `cms-selftest.mts`, with their own
 * identifiers and IPs, so the session counts and rate-limit buckets of parts
 * B–F stay exact.
 *
 *  1. the account core with a provided password: `add` stores a hash that
 *     verifies it, `reset-password` replaces the hash and ends every open
 *     session, neither result has a `password` key, no log line holds the
 *     password or a hash; weak, empty, multi-line and control characters are
 *     refused before any query (a database that throws on first use proves
 *     it) and change nothing; a failing write never shows the hash;
 *  2. sign-in with the provided password succeeds, with the replaced one not;
 *  3. the real CLI in child processes (`tsx scripts/staging-access.mts`, each
 *     on its own in-memory PGlite): the piped password is stored and never
 *     printed, the generated fallback still prints once; multi-line and
 *     oversized stdin, `--password=…`, `--password-stdin=…`, a stray argument
 *     and `--password-stdin` with `--list` exit 1 before any database work,
 *     without repeating what was passed. {@link startCliRuns} starts them
 *     before part A: they share nothing with this process (stdin is closed at
 *     spawn), so they run while A–F do instead of adding their seconds after.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { CmsDatabase } from '@/db/cms';
import {
  cmsStagingGateAccounts as accounts,
  cmsStagingGateSessions as sessions,
} from '@/db/cms-staging-gate-schema';
import { validatePasswordStrength, verifyPassword } from '@/lib/cms/password';
import { parseGateLoginForm } from '@/lib/staging-gate/auth';
import { performGateLogin } from '@/lib/staging-gate/auth-repo';
import { GATE_FIELD_IDENTIFIER, GATE_FIELD_PASSWORD } from '@/lib/staging-gate/form-state';
import { PASSWORD_INPUT_MESSAGES } from '@/lib/staging-gate/password-stdin';
import { gateTokenTag, generateGateToken } from '@/lib/staging-gate/token';
import { runStagingAccess, type StagingAccessCommand } from '../lib/staging-access.mjs';

type Check = (label: string, condition: boolean, detail?: string) => void;

/** Test-only passwords (strong by the CMS rules unless named weak), never used outside this run. */
const PROVIDED = 'Kluis-Eerst 2026 ✓';
const PROVIDED_NEW = 'Kluis-Rotatie-2027-Zadel';
const PROVIDED_REFUSED = 'Kluis-Dicht-2028-Pedaal';
const WEAK = 'kluiszonderhoofdletter';
const CLI_PASSWORD = 'Kluis-Pijp-2026-Stuur';
/** Must never appear in any output of the CLI runs. */
const SENTINEL = 'Verklapt-Niets-4242';
const VAULT_ONE = 'kluis.reviewer@selftest.local';
const VAULT_WEAK = 'kluis-zwak@selftest.local';
const VAULT_REFUSED = 'kluis-geweigerd@selftest.local';
const CLI_ONE = 'kluis-cli@selftest.local';
/** Fails a check rather than hanging the self-test if a child never exits. */
const CHILD_TIMEOUT_MS = 60_000;

type CliRun = { code: number | null; stdout: string; stderr: string };

/**
 * `tsx scripts/staging-access.mts <args>` with `stdin` piped in, on an
 * in-memory PGlite: `DATABASE_URL` is set empty (unset for `env`, and dotenv
 * never overrides a variable that exists), so `.env.local` cannot point the
 * child at Neon. Never rejects (a failed spawn is a run with exit `null`), so
 * a run started long before it is awaited cannot become an unhandled rejection.
 */
function runCli(args: string[], stdin: string): Promise<CliRun> {
  const tsx = createRequire(import.meta.url).resolve('tsx/cli');
  return new Promise((done) => {
    const child = spawn(process.execPath, [tsx, 'scripts/staging-access.mts', ...args], {
      env: {
        ...process.env,
        DATABASE_URL: '',
        CMS_PGLITE_DIR: 'memory://',
        CMS_PGLITE_AUTO_MIGRATE: 'true',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    const watchdog = setTimeout(() => child.kill('SIGKILL'), CHILD_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(watchdog);
      done({ code: null, stdout, stderr: `${stderr}\nselftest: spawn failed (${error.name})` });
    });
    child.on('close', (code) => {
      clearTimeout(watchdog);
      done({ code, stdout, stderr });
    });
    // The CLI may exit before reading stdin (refused arguments): ignore the broken pipe.
    child.stdin.on('error', () => {});
    child.stdin.end(stdin);
  });
}

const addArgs = (identifier: string) => ['--add', '--identifier', identifier, '--password-stdin'];

/** Part 3's child processes, all at once; `./staging-gate.mts` starts them before part A. */
export function startCliRuns() {
  return Promise.all([
    runCli([...addArgs(CLI_ONE), '--note', 'selftest'], `${CLI_PASSWORD}\n`),
    runCli(['--add', '--identifier', 'kluis-gegenereerd@selftest.local'], ''),
    runCli(addArgs('kluis-cli-twee@selftest.local'), `${SENTINEL}\n${SENTINEL}\n`),
    runCli(addArgs('kluis-cli-drie@selftest.local'), `${SENTINEL}`.repeat(60)),
    runCli(['--add', '--identifier', 'kluis-x', `--password=${SENTINEL}`], ''),
    runCli(['--add', '--identifier', 'kluis-x', `--password-stdin=${SENTINEL}`], ''),
    runCli([...addArgs('kluis-x'), SENTINEL], `${SENTINEL}\n`),
    runCli(['--list', '--password-stdin'], `${SENTINEL}\n`),
  ]).then(([piped, generated, multiline, oversized, inArgv, onFlag, stray, withList]) => ({
    piped,
    generated,
    multiline,
    oversized,
    inArgv,
    onFlag,
    stray,
    withList,
  }));
}

export type CliRuns = Awaited<ReturnType<typeof startCliRuns>>;

export async function stagingGateStdinChecks(ctx: {
  db: CmsDatabase;
  check: Check;
  secret: string;
  /** {@link startCliRuns}, started before part A. */
  cliRuns: Promise<CliRuns>;
}) {
  const { db, check, secret } = ctx;

  const logLines: string[] = [];
  const cli = (command: StagingAccessCommand) =>
    runStagingAccess({
      db,
      command,
      log: (symbol, message) => logLines.push(`${symbol} ${message}`),
    });
  const errorOf = async (run: () => Promise<unknown>) => {
    try {
      await run();
      return 'ok';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };
  /** A database that throws on first use: a refusal that still matches its message came before any query. */
  const untouchable = new Proxy({} as CmsDatabase, {
    get() {
      throw new Error('selftest: the database was touched');
    },
  });
  const beforeAnyQuery = (command: StagingAccessCommand) =>
    errorOf(() => runStagingAccess({ db: untouchable, command, log: () => {} }));
  const accountRow = async (identifier: string) =>
    (await db.select().from(accounts).where(eq(accounts.identifier, identifier)).limit(1))[0];
  const openSessions = async (accountId: string) =>
    db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.accountId, accountId), isNull(sessions.revokedAt)));
  const login = (identifier: string, password: string, ip: string) => {
    const parsed = parseGateLoginForm(
      new Map([
        [GATE_FIELD_IDENTIFIER, identifier],
        [GATE_FIELD_PASSWORD, password],
      ]),
    );
    if (!parsed.ok) throw new Error('selftest: login form did not parse');
    return performGateLogin({ input: parsed.input, ip, secret, db });
  };
  /** A session row as a sign-in writes it, without the scrypt run (test-only). */
  const newSession = async (accountId: string) => {
    const tag = await gateTokenTag(secret, generateGateToken());
    const [row] = await db
      .insert(sessions)
      .values({ accountId, tokenHash: tag })
      .returning({ id: sessions.id });
    return row.id;
  };
  const clean = (text: string, ...passwords: string[]) =>
    !text.includes('scrypt$') && passwords.every((password) => !text.includes(password));
  const weakReason = validatePasswordStrength(WEAK);

  // 1. the core with a provided password ------------------------------------
  logLines.length = 0;
  const added = await cli({
    kind: 'add',
    identifier: VAULT_ONE,
    note: 'kluis',
    password: PROVIDED,
  });
  const one = await accountRow(VAULT_ONE);
  check(
    'staging:access --add --password-stdin stores only a scrypt hash, and it verifies the provided password',
    !!one &&
      one.passwordHash.startsWith('scrypt$') &&
      !one.passwordHash.includes(PROVIDED) &&
      (await verifyPassword(PROVIDED, one.passwordHash)),
  );
  check(
    'staging:access --add --password-stdin returns no password key at all (the vault holds it)',
    !('password' in added) && Object.keys(added).length === 0,
    JSON.stringify(Object.keys(added)),
  );
  check(
    'staging:access --add --password-stdin logs "password from stdin", never the password or a hash',
    logLines.includes(`✓ account ${VAULT_ONE} created (password from stdin)`) &&
      clean(logLines.join('\n'), PROVIDED),
    logLines.join(' | '),
  );

  const weakAdd = await errorOf(() =>
    cli({ kind: 'add', identifier: VAULT_WEAK, note: '', password: WEAK }),
  );
  check(
    'a weak provided password is refused with the CMS reason (never the password), nothing is inserted',
    weakReason !== null &&
      weakAdd === weakReason &&
      !weakAdd.includes(WEAK) &&
      (await accountRow(VAULT_WEAK)) === undefined,
    weakAdd,
  );
  const refusals = [
    await beforeAnyQuery({ kind: 'add', identifier: VAULT_WEAK, note: '', password: WEAK }),
    await beforeAnyQuery({ kind: 'add', identifier: VAULT_WEAK, note: '', password: '' }),
    await beforeAnyQuery({
      kind: 'reset-password',
      identifier: VAULT_ONE,
      password: `${PROVIDED_NEW}\n${PROVIDED_NEW}`,
    }),
    await beforeAnyQuery({
      kind: 'reset-password',
      identifier: VAULT_ONE,
      password: `${PROVIDED_NEW}\u001b[2J`,
    }),
  ];
  check(
    'a provided password is checked before any query: weak, empty (no fallback to a generated one), multi-line, control characters',
    JSON.stringify(refusals) ===
      JSON.stringify([
        weakReason,
        PASSWORD_INPUT_MESSAGES.empty,
        PASSWORD_INPUT_MESSAGES.multiline,
        PASSWORD_INPUT_MESSAGES.control_characters,
      ]),
    JSON.stringify(refusals),
  );

  const signedIn = await login(VAULT_ONE, PROVIDED, '10.18.20.1');
  await newSession(one?.id ?? '');
  logLines.length = 0;
  const reset = await cli({
    kind: 'reset-password',
    identifier: VAULT_ONE,
    password: PROVIDED_NEW,
  });
  const oneAfterReset = await accountRow(VAULT_ONE);
  check(
    'staging:access --reset-password --password-stdin replaces the hash: the provided password verifies, the old one not',
    !!oneAfterReset &&
      oneAfterReset.passwordHash !== one?.passwordHash &&
      (await verifyPassword(PROVIDED_NEW, oneAfterReset.passwordHash)) &&
      !(await verifyPassword(PROVIDED, oneAfterReset.passwordHash)),
  );
  check(
    'staging:access --reset-password --password-stdin ends every open session (a real sign-in and one more)',
    signedIn.kind === 'ok' &&
      (await openSessions(one?.id ?? '')).length === 0 &&
      logLines.includes(`✓ password of ${VAULT_ONE} replaced from stdin; 2 session(s) revoked`),
    `${signedIn.kind} | ${logLines.join(' | ')}`,
  );
  check(
    'staging:access --reset-password --password-stdin returns no password key, logs neither password nor a hash',
    !('password' in reset) && clean(logLines.join('\n'), PROVIDED, PROVIDED_NEW),
  );

  const stillOpen = await newSession(one?.id ?? '');
  const weakReset = await errorOf(() =>
    cli({ kind: 'reset-password', identifier: VAULT_ONE, password: WEAK }),
  );
  const openAfterWeak = await openSessions(one?.id ?? '');
  check(
    'a weak provided password on --reset-password changes nothing: same hash, the open session stays open',
    weakReset === weakReason &&
      (await accountRow(VAULT_ONE))?.passwordHash === oneAfterReset?.passwordHash &&
      openAfterWeak.length === 1 &&
      openAfterWeak[0].id === stillOpen,
    weakReset,
  );

  // 2. sign-in with the provided password -------------------------------------
  const withNew = await login(VAULT_ONE, PROVIDED_NEW, '10.18.20.2');
  const withOld = await login(VAULT_ONE, PROVIDED, '10.18.20.3');
  check(
    'sign-in: the provided password works, the replaced one gets the generic invalid',
    withNew.kind === 'ok' && JSON.stringify(withOld) === '{"kind":"invalid"}',
    `${withNew.kind} / ${withOld.kind}`,
  );

  // A failing write must not show its parameters (Drizzle's error text holds the hash).
  // A NOT VALID check refuses the insert of one identifier and any update of the other row.
  await db.execute(
    sql.raw(
      `alter table cms_staging_gate_accounts add constraint selftest_kluis_dicht ` +
        `check (identifier not in ('${VAULT_REFUSED}', '${VAULT_ONE}')) not valid`,
    ),
  );
  let failedAdd = '';
  let failedReset = '';
  try {
    failedAdd = await errorOf(() => cli({ kind: 'add', identifier: VAULT_REFUSED, note: '' }));
    failedReset = await errorOf(() =>
      cli({ kind: 'reset-password', identifier: VAULT_ONE, password: PROVIDED_REFUSED }),
    );
  } finally {
    await db.execute(
      sql.raw('alter table cms_staging_gate_accounts drop constraint selftest_kluis_dicht'),
    );
  }
  const refusedWrite = 'database write failed (SQLSTATE 23514); its parameters are not shown';
  check(
    'a failing write (generated add, provided reset) shows only the SQLSTATE, never the hash or the password',
    failedAdd === refusedWrite &&
      failedReset === refusedWrite &&
      (await accountRow(VAULT_REFUSED)) === undefined &&
      (await accountRow(VAULT_ONE))?.passwordHash === oneAfterReset?.passwordHash &&
      (await openSessions(one?.id ?? '')).length === 2,
    `${failedAdd} | ${failedReset}`,
  );

  // 3. the real CLI, in child processes (started before part A) ---------------
  const { piped, generated, multiline, oversized, inArgv, onFlag, stray, withList } =
    await ctx.cliRuns;
  const outputOf = (run: CliRun) => `${run.stdout}\n${run.stderr}`;
  check(
    'CLI: a password piped to --password-stdin is stored (exit 0, "password from stdin") and never printed',
    piped.code === 0 &&
      piped.stdout.includes(`✓ account ${CLI_ONE} created (password from stdin)`) &&
      !piped.stdout.includes('shown once') &&
      clean(outputOf(piped), CLI_PASSWORD),
    `exit ${piped.code} | ${piped.stderr.trim()}`,
  );
  check(
    'CLI: without --password-stdin the generated password is still printed once',
    generated.code === 0 &&
      generated.stdout.includes('password (shown once, hand it over privately') &&
      !generated.stdout.includes('scrypt$'),
    `exit ${generated.code} | ${generated.stderr.trim()}`,
  );
  const refusedRuns: Array<[string, CliRun, string]> = [
    ['multi-line stdin', multiline, PASSWORD_INPUT_MESSAGES.multiline],
    ['oversized stdin', oversized, PASSWORD_INPUT_MESSAGES.oversized],
    ['--password=…', inArgv, 'unknown option #4 (name and value not shown)'],
    ['--password-stdin=…', onFlag, '--password-stdin takes no value (value not shown)'],
    ['a stray argument', stray, 'unexpected argument #5 (value not shown)'],
    [
      '--password-stdin with --list',
      withList,
      '--password-stdin only goes with --add or --reset-password',
    ],
  ];
  for (const [what, run, message] of refusedRuns) {
    check(
      `CLI: ${what} exits 1 with a fixed message before any database work, nothing repeated`,
      run.code === 1 &&
        run.stderr.includes('✗ staging access failed') &&
        run.stderr.includes(message) &&
        !run.stdout.includes('driver:') &&
        !outputOf(run).includes(SENTINEL),
      `exit ${run.code} | ${run.stderr.trim().split('\n').join(' / ')}`,
    );
  }
}
