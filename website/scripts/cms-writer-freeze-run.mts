/** Repo-locked, single-session executor for reviewed disposable-branch freeze SQL. */
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  createStrictPlusClient,
  parseDirectTarget,
  type StrictPlusClient,
} from './lib/cms-writer-freeze-direct.mjs';
import {
  PROBE_FAILURE_SQL,
  PROBE_SUCCESS_SQL,
  validateIdentity,
  validateReviewedSql,
} from './lib/cms-writer-freeze-runner.mjs';

const usage =
  'Usage: npm run cms:writer-freeze:run -- <check|probe|execute> --expected-host DIRECT_NEON_HOST --database DB --installer ROLE [--file FILE --sha256 HASH]';
const args = process.argv.slice(2);
const mode = args.shift();
if (mode !== 'check' && mode !== 'probe' && mode !== 'execute') throw new Error(usage);
const values: Record<string, string> = {};
while (args.length) {
  const key = args.shift();
  const value = args.shift();
  if (
    !key ||
    !['--expected-host', '--database', '--installer', '--file', '--sha256'].includes(key) ||
    !value ||
    value.startsWith('--') ||
    key in values
  )
    throw new Error(usage);
  values[key] = value;
}
const expectedKeys =
  mode !== 'execute'
    ? ['--expected-host', '--database', '--installer']
    : ['--expected-host', '--database', '--installer', '--file', '--sha256'];
if (Object.keys(values).length !== expectedKeys.length || expectedKeys.some((key) => !values[key]))
  throw new Error(usage);
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL must be supplied in the environment');
const target = parseDirectTarget(
  url,
  values['--expected-host'],
  values['--database'],
  values['--installer'],
);

async function readReviewedFile(path: string): Promise<string> {
  const absolute = resolve(path);
  const canonical = await realpath(absolute);
  if (canonical !== absolute) throw new Error('SQL file must not be a symlink');
  const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1)
      throw new Error('SQL file must be a private mode-0600 regular file with one link');
    if (stat.size > 2_000_000) throw new Error('SQL file exceeds review size limit');
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
}

/** Temp-only probe: no guard SQL, no existing tables, and no persistent relation/data changes. */
async function runTransportProbe(client: StrictPlusClient, backendPid: unknown): Promise<string> {
  const rollback = async () => {
    try {
      return await client.query('ROLLBACK');
    } catch {
      return undefined;
    }
  };
  let first: unknown;
  try {
    first = await client.query(PROBE_SUCCESS_SQL);
  } catch {
    await rollback();
    throw new Error(
      'Transport probe failed; no guard SQL submitted. Inspect disposable branch state.',
    );
  }
  const firstResults = Array.isArray(first) ? first : [first];
  if ((firstResults.at(-1) as { command?: unknown } | undefined)?.command !== 'COMMIT') {
    await rollback();
    throw new Error('Transport probe COMMIT acknowledgement missing; no guard SQL submitted.');
  }
  let expectedError = false;
  try {
    await client.query(PROBE_FAILURE_SQL);
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === '22012') expectedError = true;
  }
  if (!expectedError) {
    await rollback();
    throw new Error(
      'Transport probe did not receive expected division-by-zero error; no guard SQL submitted.',
    );
  }
  const rolledBack = await rollback();
  if (rolledBack?.command !== 'ROLLBACK') {
    throw new Error('Transport probe ROLLBACK acknowledgement missing; no guard SQL submitted.');
  }
  let count: unknown;
  try {
    const check = await client.query(
      'SELECT count(*)::integer AS n FROM pg_temp.cms_writer_freeze_transport_probe',
    );
    count = check.rows[0]?.n;
  } catch {
    throw new Error('Transport probe post-rollback check failed; no guard SQL submitted.');
  }
  if (count !== 1) {
    throw new Error(
      'Transport probe rollback did not restore temp-only baseline; no guard SQL submitted.',
    );
  }
  return `Transport probe OK: temp-only COMMIT, deliberate error, ROLLBACK, baseline=1 backend_pid=${backendPid}`;
}

async function main() {
  const reviewed =
    mode === 'execute'
      ? validateReviewedSql(
          await readReviewedFile(values['--file']),
          values['--sha256'],
          values['--installer'],
        )
      : undefined;
  const client = createStrictPlusClient(target);
  let transportFailed = false;
  // The native client can emit an idle socket error outside an awaited query. Never surface its raw Error.
  client.on('error', () => {
    transportFailed = true;
  });
  let connected = false;
  let submitted = false;
  let completed = false;
  const status: string[] = [];
  try {
    await client.connectStrict();
    connected = true;
    const identity = await client.query(
      "SELECT session_user, current_user, current_database() AS current_database, current_setting('server_version_num') AS server_version_num, pg_backend_pid() AS backend_pid",
    );
    const row = identity.rows[0];
    if (!row) throw new Error('Database identity query returned no row');
    validateIdentity(row, values['--installer'], values['--database']);
    if (transportFailed)
      throw new Error('Transport failed during identity check; no freeze SQL submitted.');
    status.push(
      `Identity OK: ${values['--expected-host']}/${values['--database']} installer=${values['--installer']} PostgreSQL=${row.server_version_num} backend_pid=${row.backend_pid}`,
    );
    if (mode === 'probe') {
      status.push(await runTransportProbe(client, row.backend_pid));
      completed = true;
      return;
    }
    if (!reviewed) {
      completed = true;
      return;
    }
    let results: unknown;
    try {
      // One unparameterized simple-protocol query: generated BEGIN through COMMIT stays together.
      submitted = true;
      results = await client.query(reviewed.sql);
    } catch {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* transport may already be gone */
      }
      throw new Error(
        'SQL execution failed; outcome uncertain. Inspect branch state before any retry.',
      );
    }
    const resultList = Array.isArray(results) ? results : [results];
    const last = resultList.at(-1) as { command?: unknown } | undefined;
    if (last?.command !== 'COMMIT') {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* transport may already be gone */
      }
      throw new Error(
        'COMMIT acknowledgement missing; outcome uncertain. Inspect branch state before any retry.',
      );
    }
    if (reviewed.action === 'verify') {
      const verification = resultList.find(
        (result: { rows?: Array<Record<string, unknown>> }) =>
          Array.isArray(result?.rows) && result.rows[0] && 'guarded_tables' in result.rows[0],
      );
      const state = verification?.rows?.[0];
      if (
        !state ||
        typeof state.enabled !== 'boolean' ||
        !Number.isInteger(Number(state.guarded_tables)) ||
        Number(state.guarded_tables) < 1 ||
        state.installer_role !== values['--installer']
      ) {
        throw new Error(
          'Verify result missing or invalid; inspect branch state before proceeding.',
        );
      }
      status.push(`Verify: enabled=${state.enabled} guarded_tables=${state.guarded_tables}`);
    }
    status.push(
      `COMMIT confirmed: ${reviewed.action} SHA-256=${reviewed.digest} backend_pid=${row.backend_pid}`,
    );
    completed = true;
  } finally {
    if (connected)
      try {
        await client.end();
      } catch {
        transportFailed = true;
      }
    if (transportFailed) {
      throw new Error(
        submitted
          ? 'Transport failed after SQL submission; outcome uncertain. Inspect branch state before any retry.'
          : 'Transport failed before freeze SQL submission.',
      );
    }
    if (completed) process.stdout.write(`${status.join('\n')}\n`);
  }
}

main().catch((error: unknown) => {
  // Driver errors may contain connection strings or SQL; print only our own bounded messages.
  const safe =
    error instanceof Error &&
    (error.message === usage ||
      error.message.startsWith('SQL execution failed;') ||
      error.message.startsWith('COMMIT acknowledgement missing;') ||
      error.message.startsWith('Verify result missing or invalid;') ||
      error.message.startsWith('Transport probe') ||
      error.message.startsWith('Transport failed') ||
      error.message.startsWith('SQL file must') ||
      error.message.startsWith('SQL file exceeds') ||
      error.message.startsWith('SQL SHA-256 mismatch') ||
      error.message.startsWith('SQL header purpose') ||
      error.message.startsWith('SQL is not the exact generated') ||
      error.message.startsWith('SHA-256 must') ||
      error.message.startsWith('DATABASE_URL must') ||
      error.message.startsWith('Expected host must') ||
      error.message.startsWith('Expected database') ||
      error.message.startsWith('Database session/current') ||
      error.message.startsWith('Database current_database()') ||
      error.message.startsWith('PostgreSQL 16') ||
      error.message.startsWith('DATABASE_URL is not'))
      ? error.message
      : 'Connection or preflight failed; no freeze SQL submitted.';
  process.stderr.write(`${safe}\n`);
  process.exitCode = 1;
});
