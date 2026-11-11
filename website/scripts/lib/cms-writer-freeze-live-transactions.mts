/** Injectable live SQL boundary. The CLI performs the same review checks before opening a session. */
import { SHOP_TABLES, type ProofRoles } from './cms-writer-freeze-proof.mjs';
import {
  validateReviewedLiveSetupSql,
  validateReviewedLiveSql,
  type LivePins,
} from './cms-writer-freeze-live.mjs';
import { validateOperationalHoldReceipt } from './cms-writer-freeze-live-receipt.mjs';
import { validateIdentity } from './cms-writer-freeze-runner.mjs';

export type LiveSqlClient = {
  query(sql: string, values?: unknown[]): Promise<unknown>;
};
export type LiveSessionClient = LiveSqlClient & {
  connectStrict(): Promise<void>;
  end(): Promise<void>;
  on(event: 'error', listener: () => void): unknown;
};
type SqlResult = { command?: unknown; rows?: Array<Record<string, unknown>> };
const result = (value: unknown): SqlResult => value as SqlResult;

/** Only locally constructed errors may reach stderr. Driver/API/parameter errors never do. */
export class LiveOperationError extends Error {}
const SAFE_OPERATION_MESSAGES = new Set([
  'Live identity missing',
  'Transport failed',
  'Transport failed; outcome uncertain after SQL submission',
  'Live setup failed or COMMIT uncertain; inspect branch state, no retry',
  'Live setup preflight failed; no role SQL submitted',
  'Live guard SQL failed; outcome uncertain, inspect branch state, no retry',
  'Live guard COMMIT acknowledgement missing; outcome uncertain, no retry',
  'Live verify result invalid; inspect branch state',
  'Live probe disabled: catalog race and external effects require a new reviewed design',
]);
export function safeLiveError(error: unknown): string {
  return error instanceof LiveOperationError && SAFE_OPERATION_MESSAGES.has(error.message)
    ? error.message
    : 'Live writer-freeze refused; inspect pinned branch state before any retry';
}

/** One connection, one independent re-attestation, one callback, no retry. */
export async function withPinnedLiveClient<T>(
  client: LiveSessionClient,
  role: string,
  pins: LivePins,
  attest: () => Promise<void>,
  fn: (client: LiveSessionClient, pid: unknown) => Promise<T>,
): Promise<T> {
  let failed = false;
  client.on('error', () => {
    failed = true;
  });
  let connected = false;
  let value: T;
  try {
    await client.connectStrict();
    connected = true;
    await attest();
    const identity = result(
      await client.query(
        "SELECT session_user, current_user, current_database() AS current_database, current_setting('server_version_num') AS server_version_num, pg_backend_pid() AS backend_pid",
      ),
    );
    const row = identity.rows?.[0];
    if (!row) throw new LiveOperationError('Live identity missing');
    validateIdentity(row, role, pins.database);
    if (failed) throw new LiveOperationError('Transport failed');
    value = await fn(client, row.backend_pid);
  } finally {
    if (connected)
      try {
        await client.end();
      } catch {
        failed = true;
      }
    if (failed)
      throw new LiveOperationError('Transport failed; outcome uncertain after SQL submission');
  }
  return value!;
}

export type LiveWriteReview = {
  sql: string;
  hash: string;
  holdRaw: string;
  holdHash: string;
  pins: LivePins;
};
export type LiveSetupWrite = LiveWriteReview & {
  names: ProofRoles;
  passwords: { app: string; cli: string };
  pid: unknown;
};

/** The exact reviewed setup is submitted once inside an acknowledged transaction. */
export async function runLiveSetupTransaction(
  client: LiveSqlClient,
  input: LiveSetupWrite,
): Promise<string> {
  const { sql, hash, holdRaw, holdHash, names, pins, passwords, pid } = input;
  validateReviewedLiveSetupSql(sql, hash, names, pins);
  validateOperationalHoldReceipt(holdRaw, holdHash, pins, 'setup', hash);
  let begun = false;
  let submitted = false;
  let committed = false;
  try {
    const begin = result(await client.query('BEGIN'));
    if (begin.command !== 'BEGIN') throw new Error('BEGIN not acknowledged');
    begun = true;
    await client.query('SET LOCAL search_path = pg_catalog, pg_temp');
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    // Refuse PUBLIC DML on audited webshop or CMS relations: a fresh CLI would inherit it.
    const publicAcl = result(
      await client.query(
        `SELECT count(*)::integer AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE (n.nspname='public' AND c.relname=ANY($1::text[]) OR (c.relname LIKE 'cms\\_%' ESCAPE '\\' AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'))
          AND c.relkind IN ('r','p','v','m','f')
          AND EXISTS (SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
            WHERE a.grantee=0 AND a.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER'))`,
        [SHOP_TABLES],
      ),
    );
    if (publicAcl.rows?.[0]?.n !== 0) throw new Error('PUBLIC relation privilege preflight failed');
    const settings = result(
      await client.query(
        "SELECT set_config('cms_freeze.app_password',$1,true) IS NOT NULL AS app_set, set_config('cms_freeze.cli_password',$2,true) IS NOT NULL AS cli_set",
        [passwords.app, passwords.cli],
      ),
    );
    if (!settings.rows?.[0]?.app_set || !settings.rows?.[0]?.cli_set)
      throw new Error('Password injection failed');
    submitted = true;
    await client.query(sql);
    const same = result(
      await client.query('SELECT session_user,current_user,pg_backend_pid() AS pid'),
    );
    if (
      same.rows?.[0]?.session_user !== pins.installer ||
      same.rows?.[0]?.current_user !== pins.installer ||
      same.rows?.[0]?.pid !== pid
    )
      throw new Error('Setup backend identity changed');
    const commit = result(await client.query('COMMIT'));
    committed = commit.command === 'COMMIT';
    if (!committed) throw new Error('COMMIT acknowledgement missing');
    return `Live ${pins.environment} setup COMMIT confirmed: project=${pins.projectId} branch=${pins.branchId} endpoint=${pins.endpointId} database=${pins.database} backend_pid=${pid} SHA-256=${hash}; APP grants=USAGE public + SELECT/INSERT/UPDATE/DELETE on public.${SHOP_TABLES.join(',public.')}; CLI non-CMS grants=none`;
  } catch {
    if (begun && !committed)
      try {
        await client.query('ROLLBACK');
      } catch {
        /* uncertain */
      }
    throw new LiveOperationError(
      submitted
        ? 'Live setup failed or COMMIT uncertain; inspect branch state, no retry'
        : 'Live setup preflight failed; no role SQL submitted',
    );
  }
}

/** The generated transaction contains its own BEGIN/COMMIT; submit exactly once. */
export async function runLiveGuardTransaction(
  client: LiveSqlClient,
  input: LiveWriteReview & { pid: unknown },
): Promise<string> {
  const { sql, hash, holdRaw, holdHash, pins, pid } = input;
  const reviewed = validateReviewedLiveSql(sql, hash, pins);
  validateOperationalHoldReceipt(holdRaw, holdHash, pins, reviewed.action, reviewed.digest);
  let queryResult: unknown;
  try {
    queryResult = await client.query(reviewed.sql);
  } catch {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* uncertain */
    }
    throw new LiveOperationError(
      'Live guard SQL failed; outcome uncertain, inspect branch state, no retry',
    );
  }
  const results = Array.isArray(queryResult) ? queryResult : [queryResult];
  if ((results.at(-1) as SqlResult | undefined)?.command !== 'COMMIT')
    throw new LiveOperationError(
      'Live guard COMMIT acknowledgement missing; outcome uncertain, no retry',
    );
  if (reviewed.action === 'verify') {
    const row = results.map(result).find((r) => r.rows?.[0] && 'guarded_tables' in r.rows[0])
      ?.rows?.[0];
    if (
      !row ||
      typeof row.enabled !== 'boolean' ||
      !Number.isInteger(Number(row.guarded_tables)) ||
      Number(row.guarded_tables) < 1 ||
      row.installer_role !== pins.installer
    )
      throw new LiveOperationError('Live verify result invalid; inspect branch state');
  }
  return `Live ${pins.environment} ${reviewed.action} COMMIT confirmed: project=${pins.projectId} branch=${pins.branchId} endpoint=${pins.endpointId} SHA-256=${reviewed.digest} backend_pid=${pid}`;
}
