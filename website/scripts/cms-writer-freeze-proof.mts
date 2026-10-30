/** Disposable direct-host proof only: fresh SQL roles and rollback-only APP/CLI probes. */
import { Client, neon, neonConfig } from '@neondatabase/serverless';
import { validateIdentity, validateTarget } from './lib/cms-writer-freeze-runner.mjs';
import {
  checkedName,
  derivePoolerUrl,
  runRollbackProbe,
  setupSql,
  validateCmsTable,
  validateProofPasswords,
} from './lib/cms-writer-freeze-proof.mjs';

const usage =
  'Usage: npm run cms:writer-freeze:proof -- <setup|check-roles|probe> --expected-host DIRECT_NEON_HOST --database DB --installer ROLE --app ROLE --cli ROLE --owner ROLE [--phase frozen|unfrozen|uninstalled --cms-table EXACT_CMS_TABLE]';
const argv = process.argv.slice(2);
const mode = argv.shift();
const values: Record<string, string> = {};
while (argv.length) {
  const key = argv.shift();
  const value = argv.shift();
  if (
    !key ||
    !value ||
    value.startsWith('--') ||
    ![
      '--expected-host',
      '--database',
      '--installer',
      '--app',
      '--cli',
      '--owner',
      '--phase',
      '--cms-table',
    ].includes(key) ||
    key in values
  )
    throw new Error(usage);
  values[key] = value;
}
const common = ['--expected-host', '--database', '--installer', '--app', '--cli', '--owner'];
const expected =
  mode === 'setup' || mode === 'check-roles'
    ? common
    : mode === 'probe'
      ? [...common, '--phase', '--cms-table']
      : [];
if (
  !expected.length ||
  Object.keys(values).length !== expected.length ||
  expected.some((key) => !values[key])
)
  throw new Error(usage);
const roles = {
  app: values['--app'],
  cli: values['--cli'],
  owner: values['--owner'],
  installer: values['--installer'],
};
Object.values(roles).forEach(checkedName);
if (new Set(Object.values(roles)).size !== 4) throw new Error('Proof roles must be distinct');
const phase = values['--phase'];
if (mode === 'probe' && !['frozen', 'unfrozen', 'uninstalled'].includes(phase))
  throw new Error(usage);
if (mode === 'probe') validateCmsTable(values['--cms-table']);
const installerUrl = process.env.DATABASE_URL;
if (!installerUrl) throw new Error('DATABASE_URL must be supplied in the environment');
validateTarget(installerUrl, values['--expected-host'], values['--database'], roles.installer);
const appPassword = process.env.CMS_FREEZE_APP_PASSWORD;
const cliPassword = process.env.CMS_FREEZE_CLI_PASSWORD;
if (!appPassword || !cliPassword)
  throw new Error('APP and CLI passwords must be supplied in environment variables');
validateProofPasswords(appPassword, cliPassword);

neonConfig.webSocketConstructor = WebSocket;
neonConfig.useSecureWebSocket = true;
neonConfig.forceDisablePgSSL = true;
neonConfig.pipelineConnect = false;

function roleUrl(base: string, role: string, password: string): string {
  const url = new URL(base);
  url.username = role;
  url.password = password;
  const derived = url.toString();
  validateTarget(derived, values['--expected-host'], values['--database'], role);
  return derived;
}

async function withClient<T>(
  url: string,
  role: string,
  fn: (client: Client, pid: unknown) => Promise<T>,
): Promise<T> {
  const client = new Client(url);
  let transportFailed = false;
  let connected = false;
  client.on('error', () => {
    transportFailed = true;
  });
  let result: T | undefined;
  try {
    await client.connect();
    connected = true;
    const identity = await client.query(
      "SELECT session_user, current_user, current_database() AS current_database, current_setting('server_version_num') AS server_version_num, pg_backend_pid() AS backend_pid",
    );
    const row = identity.rows[0];
    if (!row) throw new Error('Identity query returned no row');
    validateIdentity(row, role, values['--database']);
    if (transportFailed) throw new Error('Transport failed before proof SQL');
    result = await fn(client, row.backend_pid);
  } finally {
    if (connected)
      try {
        await client.end();
      } catch {
        transportFailed = true;
      }
    if (transportFailed) throw new Error('Transport failed; proof outcome uncertain');
  }
  return result as T;
}

async function setup(): Promise<string> {
  const sql = setupSql(roles);
  return withClient(installerUrl!, roles.installer, async (client, pid) => {
    let submitted = false;
    let committed = false;
    try {
      const begin = await client.query('BEGIN');
      if (begin.command !== 'BEGIN') throw new Error('Setup BEGIN acknowledgement missing');
      await client.query('SET LOCAL search_path = pg_catalog, pg_temp');
      await client.query("SET LOCAL lock_timeout = '15s'");
      await client.query("SET LOCAL statement_timeout = '60s'");
      const settings = await client.query(
        "SELECT set_config('cms_freeze.app_password', $1, true) IS NOT NULL AS app_set, set_config('cms_freeze.cli_password', $2, true) IS NOT NULL AS cli_set",
        [appPassword, cliPassword],
      );
      if (settings.rows[0]?.app_set !== true || settings.rows[0]?.cli_set !== true)
        throw new Error('Setup password settings failed');
      submitted = true;
      await client.query(sql);
      const check = await client.query(
        'SELECT session_user, current_user, pg_backend_pid() AS pid',
      );
      if (
        check.rows[0]?.session_user !== roles.installer ||
        check.rows[0]?.current_user !== roles.installer ||
        check.rows[0]?.pid !== pid
      )
        throw new Error('Setup backend identity changed');
      const commit = await client.query('COMMIT');
      committed = commit.command === 'COMMIT';
      if (!committed) throw new Error('Setup COMMIT acknowledgement missing; outcome uncertain');
      return `Setup COMMIT confirmed: host=${values['--expected-host']} database=${values['--database']} installer=${roles.installer} backend_pid=${pid}; roles=${roles.app},${roles.cli},${roles.owner}; webshop grants=public.users,products,orders,order_items`;
    } catch {
      if (!committed)
        try {
          await client.query('ROLLBACK');
        } catch {
          /* uncertain */
        }
      throw new Error(
        submitted
          ? 'Setup failed or COMMIT uncertain; inspect branch state before retry'
          : 'Setup preflight failed; no role SQL submitted',
      );
    }
  });
}

async function checkRoles(): Promise<string[]> {
  const output: string[] = [];
  for (const [actor, role, password] of [
    ['app', roles.app, appPassword!],
    ['cli', roles.cli, cliPassword!],
  ] as const) {
    const direct = roleUrl(installerUrl!, role, password);
    const directIdentity = await withClient(direct, role, async (_client, pid) => pid);
    const pooled = derivePoolerUrl(direct, values['--expected-host'], role);
    // Same stateless HTTP transport used by src/db. No mutations or transaction sent.
    const sql = neon(pooled);
    const rows =
      await sql`SELECT session_user, current_user, current_database() AS current_database`;
    if (
      rows.length !== 1 ||
      rows[0].session_user !== role ||
      rows[0].current_user !== role ||
      rows[0].current_database !== values['--database']
    )
      throw new Error('Pooled HTTP identity mismatch');
    output.push(
      `Role identity OK: ${actor} direct=${values['--expected-host']} pooled=${new URL(pooled).hostname} database=${values['--database']} backend_pid=${directIdentity}`,
    );
  }
  return output;
}

async function probe(): Promise<string[]> {
  const actors: Array<{ role: string; actor: 'app' | 'cli'; password: string }> =
    phase === 'unfrozen'
      ? [{ role: roles.app, actor: 'app', password: appPassword! }]
      : [
          { role: roles.app, actor: 'app', password: appPassword! },
          { role: roles.cli, actor: 'cli', password: cliPassword! },
        ];
  const output: string[] = [];
  for (const { role, actor, password } of actors) {
    const url = roleUrl(installerUrl!, role, password);
    const events = await withClient(url, role, async (client, pid) => {
      const result = await runRollbackProbe(
        client,
        role,
        values['--database'],
        values['--cms-table'],
        phase as 'frozen' | 'unfrozen' | 'uninstalled',
        pid,
        actor,
        roles.owner,
      );
      return { pid, result };
    });
    output.push(
      `Probe ${phase} ${actor} ROLLBACK confirmed: host=${values['--expected-host']} database=${values['--database']} backend_pid=${events.pid} ${events.result.join(' ')}`,
    );
  }
  return output;
}

async function main() {
  const output =
    mode === 'setup'
      ? [await setup()]
      : mode === 'check-roles'
        ? await checkRoles()
        : await probe();
  process.stdout.write(`${output.join('\n')}\n`);
}
main().catch((error: unknown) => {
  // Only exact messages authored by this helper may be printed. Never echo driver text.
  const message = error instanceof Error ? error.message : '';
  const safe = [
    'Setup failed or COMMIT uncertain; inspect branch state before retry',
    'Setup preflight failed; no role SQL submitted',
    'Probe ROLLBACK acknowledgement missing; outcome uncertain',
    'Transport failed; proof outcome uncertain',
  ].includes(message)
    ? message
    : 'CMS freeze proof failed; no success evidence. Inspect disposable branch state before retry.';
  process.stderr.write(`${safe}\n`);
  process.exitCode = 1;
});
