/** Copy-only role setup and rollback-only behavioral probes. No transport or secret logging. */
import { quoteIdent } from './cms-writer-freeze-sql.mjs';

type QueryResult = { command?: string; rows?: Array<Record<string, unknown>> };
export type QueryClient = { query(sql: string, values?: unknown[]): Promise<QueryResult> };
export type ProofRoles = { app: string; cli: string; owner: string; installer: string };
export const SHOP_TABLES = ['users', 'products', 'orders', 'order_items'] as const;
export const FROZEN_MESSAGE = 'CMS writes frozen for login role ';

/** Reject unresolved vault references and weak/colliding proof credentials before any SQL. */
export function validateProofPasswords(appPassword: string, cliPassword: string): void {
  const acceptable = (value: string) =>
    value.length >= 32 &&
    !value.includes('\0') &&
    !/^op:\/\//i.test(value) &&
    value.trim() === value;
  if (!acceptable(appPassword) || !acceptable(cliPassword) || appPassword === cliPassword)
    throw new Error('Proof credentials must be distinct resolved 32-character passwords');
}

export function checkedName(name: string): string {
  return quoteIdent(name);
}

export function setupSql(roles: ProofRoles): string {
  const { app, cli, owner, installer } = roles;
  [app, cli, owner, installer].forEach(checkedName);
  if (new Set([app, cli, owner, installer]).size !== 4)
    throw new Error('Proof roles must be distinct');
  // Passwords arrive only through parameterized transaction-local settings. DO constructs the
  // required CREATE ROLE dynamic SQL server-side; no password appears in client query text.
  return `DO $proof$
  DECLARE t text; app_pw text; cli_pw text;
  BEGIN
    IF session_user <> ${quoteLiteral(installer)} OR current_user <> ${quoteLiteral(installer)}
       OR current_setting('server_version_num')::integer < 160000 THEN
      RAISE EXCEPTION 'Proof installer identity or version mismatch';
    END IF;
    IF to_regnamespace('cms_writer_freeze') IS NOT NULL
       OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN (${[app, cli, owner].map(quoteLiteral).join(', ')})) THEN
      RAISE EXCEPTION 'Proof roles must be fresh and guard absent';
    END IF;
    IF NOT has_database_privilege(current_user, current_database(), 'CREATE') THEN
      RAISE EXCEPTION 'Installer lacks database CREATE';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE starts_with(c.relname, 'cms_') AND NOT starts_with(n.nspname, 'pg_')
        AND n.nspname <> 'information_schema' AND c.relkind='r'
    ) OR EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE starts_with(c.relname, 'cms_') AND NOT starts_with(n.nspname, 'pg_')
        AND n.nspname <> 'information_schema'
        AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
        AND (c.relkind <> 'r' OR c.relowner<>(SELECT oid FROM pg_roles WHERE rolname=${quoteLiteral(installer)}))
    ) THEN RAISE EXCEPTION 'CMS relation inventory is absent, non-ordinary or not installer-owned';
    END IF;
    FOREACH t IN ARRAY ARRAY[${SHOP_TABLES.map(quoteLiteral).join(', ')}] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=t AND c.relkind='r'
          AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=${quoteLiteral(installer)})
      ) THEN RAISE EXCEPTION 'Reviewed webshop table absent, non-ordinary or not installer-owned: %', t;
      END IF;
    END LOOP;
    app_pw := current_setting('cms_freeze.app_password', true);
    cli_pw := current_setting('cms_freeze.cli_password', true);
    IF app_pw IS NULL OR app_pw='' OR cli_pw IS NULL OR cli_pw='' THEN
      RAISE EXCEPTION 'Proof passwords missing';
    END IF;
    EXECUTE format('CREATE ROLE %I NOLOGIN', ${quoteLiteral(owner)});
    EXECUTE format('CREATE ROLE %I LOGIN', ${quoteLiteral(app)});
    EXECUTE format('CREATE ROLE %I LOGIN', ${quoteLiteral(cli)});
    EXECUTE format('ALTER ROLE %I PASSWORD %L', ${quoteLiteral(app)}, app_pw);
    EXECUTE format('ALTER ROLE %I PASSWORD %L', ${quoteLiteral(cli)}, cli_pw);
    EXECUTE format('GRANT %I TO %I WITH INHERIT TRUE, SET TRUE', ${quoteLiteral(owner)}, ${quoteLiteral(installer)});
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', ${quoteLiteral(app)});
    FOREACH t IN ARRAY ARRAY[${SHOP_TABLES.map(quoteLiteral).join(', ')}] LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO %I', t, ${quoteLiteral(app)});
    END LOOP;
  END $proof$`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function validateCmsTable(table: string): string {
  checkedName(table);
  if (!table.startsWith('cms_') || table.length <= 4)
    throw new Error('Probe table must be an exact reviewed cms_* identifier');
  return checkedName(table);
}

/** Every attempted statement is isolated and always rolled back, including unexpected success. */
export async function runRollbackProbe(
  client: QueryClient,
  role: string,
  database: string,
  table: string,
  phase: 'frozen' | 'unfrozen' | 'uninstalled',
  backendPid: unknown,
  actor: 'app' | 'cli',
  ownerRole: string,
): Promise<string[]> {
  const cms = `public.${validateCmsTable(table)}`;
  const events: string[] = [];
  let begun = false;
  let rolledBack = false;
  const attempt = async (label: string, statement: string, expected?: 'guard' | 'deny') => {
    await client.query('SAVEPOINT proof_statement');
    let result: QueryResult | undefined;
    let error: unknown;
    try {
      result = await client.query(statement);
    } catch (caught) {
      error = caught;
    }
    // PostgreSQL requires rollback-to-savepoint after an error, and we also discard successes.
    await client.query('ROLLBACK TO SAVEPOINT proof_statement');
    await client.query('RELEASE SAVEPOINT proof_statement');
    if (expected) {
      const code = (error as { code?: unknown } | null)?.code;
      const message = (error as { message?: unknown } | null)?.message;
      if (code !== '42501' || (expected === 'guard' && message !== `${FROZEN_MESSAGE}${role}`))
        throw new Error(`Probe ${label} did not receive the required denial`);
    } else if (error || !result) {
      throw new Error(`Probe ${label} did not succeed`);
    }
    events.push(`${label}=${expected ? 'denied' : 'ok'}`);
  };
  try {
    const begin = await client.query('BEGIN');
    if (begin.command !== 'BEGIN') throw new Error('Probe BEGIN acknowledgement missing');
    begun = true;
    await client.query('SET LOCAL search_path = pg_catalog, pg_temp');
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    const identity = await client.query(
      'SELECT session_user, current_user, current_database() AS db, pg_backend_pid() AS pid',
    );
    const row = identity.rows?.[0];
    if (
      !row ||
      row.session_user !== role ||
      row.current_user !== role ||
      row.db !== database ||
      row.pid !== backendPid
    )
      throw new Error('Probe identity/backend mismatch');
    // A zero-row INSERT still fires the statement trigger; no existing data is read into output.
    const cmsInsert = `INSERT INTO ${cms} SELECT * FROM ${cms} WHERE false`;
    const cmsUpdate = `UPDATE ${cms} SET id=id WHERE false`;
    const cmsDelete = `DELETE FROM ${cms} WHERE false`;
    if (phase === 'frozen') {
      if (actor === 'app') {
        await attempt('cms_insert', cmsInsert, 'guard');
        await attempt('cms_update', cmsUpdate, 'guard');
        await attempt('cms_delete', cmsDelete, 'guard');
        await attempt('cms_truncate', `TRUNCATE ${cms}`, 'deny');
        await attempt(
          'cms_create',
          'CREATE TABLE public.cms_freeze_probe_escape (id integer)',
          'deny',
        );
        await attempt(
          'cms_alter',
          `ALTER TABLE ${cms} DISABLE TRIGGER cms_writer_freeze_dml`,
          'deny',
        );
        await attempt('set_owner', `SET ROLE ${checkedName(ownerRole)}`, 'deny');
        for (const shop of SHOP_TABLES) {
          const q = `public.${checkedName(shop)}`;
          await attempt(`${shop}_select`, `SELECT 1 FROM ${q} WHERE false`);
          await attempt(`${shop}_insert`, `INSERT INTO ${q} SELECT * FROM ${q} WHERE false`);
          await attempt(`${shop}_update`, `UPDATE ${q} SET id=id WHERE false`);
          await attempt(`${shop}_delete`, `DELETE FROM ${q} WHERE false`);
        }
      } else {
        await attempt('cms_insert', cmsInsert);
        await attempt('cms_update', cmsUpdate);
        await attempt('cms_delete', cmsDelete);
      }
    } else if (phase === 'unfrozen' && actor === 'app') {
      await attempt('cms_insert', cmsInsert);
      await attempt('cms_update', cmsUpdate);
      await attempt('cms_delete', cmsDelete);
    } else if (phase === 'uninstalled') {
      if (actor === 'app') {
        await attempt('cms_insert', cmsInsert);
        await attempt('cms_update', cmsUpdate);
        await attempt('cms_delete', cmsDelete);
      } else {
        await attempt('cms_insert', cmsInsert, 'deny');
        await attempt('cms_update', cmsUpdate, 'deny');
        await attempt('cms_delete', cmsDelete, 'deny');
      }
    } else throw new Error('Unsupported proof phase/actor');
    const endIdentity = await client.query(
      'SELECT session_user, current_user, current_database() AS db, pg_backend_pid() AS pid',
    );
    const end = endIdentity.rows?.[0];
    if (
      !end ||
      end.session_user !== role ||
      end.current_user !== role ||
      end.db !== database ||
      end.pid !== backendPid
    )
      throw new Error('Probe backend changed');
    return events;
  } finally {
    if (begun) {
      try {
        const end = await client.query('ROLLBACK');
        rolledBack = end.command === 'ROLLBACK';
      } catch {
        /* outcome is uncertain */
      }
    }
    if (begun && !rolledBack)
      throw new Error('Probe ROLLBACK acknowledgement missing; outcome uncertain');
  }
}

/** A pooled HTTP URL must be exactly the pooler companion of the pinned direct endpoint. */
export function derivePoolerUrl(
  directUrl: string,
  expectedDirectHost: string,
  role: string,
): string {
  const direct = new URL(directUrl);
  if (direct.hostname !== expectedDirectHost || !/^ep-[a-z0-9-]+\./.test(expectedDirectHost))
    throw new Error('Direct host mismatch');
  const poolerHost = expectedDirectHost.replace(/^(ep-[a-z0-9-]+)\./, '$1-pooler.');
  direct.hostname = poolerHost;
  const pooled = direct.toString();
  const parsed = new URL(pooled);
  if (
    parsed.hostname !== poolerHost ||
    parsed.username !== role ||
    parsed.pathname !== new URL(directUrl).pathname ||
    parsed.search !== '?sslmode=require' ||
    (parsed.port && parsed.port !== '5432')
  )
    throw new Error('Pooled target mismatch');
  return pooled;
}
