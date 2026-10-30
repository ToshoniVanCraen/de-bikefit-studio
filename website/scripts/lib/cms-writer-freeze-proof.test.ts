import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { FREEZE_PURPOSE, makeFreezeSql } from './cms-writer-freeze-sql.mjs';
import {
  derivePoolerUrl,
  runRollbackProbe,
  setupSql,
  validateCmsTable,
  validateProofPasswords,
  type QueryClient,
} from './cms-writer-freeze-proof.mjs';

const roles = { app: 'proof_app', cli: 'proof_cli', owner: 'proof_guard', installer: 'postgres' };

function fakeClient(statement: 'success' | 'error', rollbackAck = true) {
  const calls: string[] = [];
  const client: QueryClient = {
    async query(sql) {
      calls.push(sql);
      if (sql === 'BEGIN') return { command: 'BEGIN' };
      if (sql === 'ROLLBACK') return { command: rollbackAck ? 'ROLLBACK' : 'NOPE' };
      if (sql.startsWith('SELECT session_user'))
        return {
          rows: [{ session_user: roles.app, current_user: roles.app, db: 'proofdb', pid: 42 }],
        };
      if (sql.startsWith('INSERT INTO public.cms_services') && statement === 'error')
        throw Object.assign(new Error('wrong denial'), { code: '23505' });
      return { command: 'OK' };
    },
  };
  return { client, calls };
}

describe('copy-only freeze proof helper', () => {
  it('creates only fresh plain roles and reviewed webshop grants atomically', async () => {
    const db = new PGlite();
    try {
      await db.exec(
        'CREATE TABLE users (id integer); CREATE TABLE products (id integer); CREATE TABLE orders (id integer); CREATE TABLE order_items (id integer); CREATE TABLE cms_services (id integer PRIMARY KEY);',
      );
      await db.exec('BEGIN');
      await db.query(
        "SELECT set_config('cms_freeze.app_password', $1, true) IS NOT NULL AS app_set, set_config('cms_freeze.cli_password', $2, true) IS NOT NULL AS cli_set",
        ['not-printed-app', 'not-printed-cli'],
      );
      await db.exec(setupSql(roles));
      await db.exec('COMMIT');
      const roleState = await db.query<{
        rolname: string;
        rolcanlogin: boolean;
        rolcreaterole: boolean;
      }>(
        "SELECT rolname, rolcanlogin, rolcreaterole FROM pg_roles WHERE rolname LIKE 'proof_%' ORDER BY rolname",
      );
      expect(roleState.rows).toEqual([
        { rolname: 'proof_app', rolcanlogin: true, rolcreaterole: false },
        { rolname: 'proof_cli', rolcanlogin: true, rolcreaterole: false },
        { rolname: 'proof_guard', rolcanlogin: false, rolcreaterole: false },
      ]);
      const membership = await db.query<{ inherit_option: boolean; set_option: boolean }>(
        "SELECT m.inherit_option, m.set_option FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles u ON u.oid=m.member WHERE r.rolname='proof_guard' AND u.rolname='postgres'",
      );
      expect(membership.rows[0]).toEqual({ inherit_option: true, set_option: true });
      for (const table of ['users', 'products', 'orders', 'order_items']) {
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
          const grants = await db.query<{ app: boolean; cli: boolean }>(
            `SELECT has_table_privilege('proof_app', 'public.${table}', '${privilege}') AS app,
                    has_table_privilege('proof_cli', 'public.${table}', '${privilege}') AS cli`,
          );
          expect(grants.rows[0]).toEqual({ app: true, cli: false });
        }
      }
      await expect(db.exec(setupSql(roles))).rejects.toThrow(/fresh/);
      await db.exec('ROLLBACK');
    } finally {
      await db.close();
    }
  });

  it('refuses an absent reviewed webshop table without creating any role', async () => {
    const db = new PGlite();
    try {
      await db.exec(
        'CREATE TABLE users (id integer); CREATE TABLE products (id integer); CREATE TABLE orders (id integer); CREATE TABLE cms_services (id integer PRIMARY KEY);',
      );
      await db.exec('BEGIN');
      await db.query(
        "SELECT set_config('cms_freeze.app_password', $1, true) IS NOT NULL AS app_set, set_config('cms_freeze.cli_password', $2, true) IS NOT NULL AS cli_set",
        ['a', 'b'],
      );
      await expect(db.exec(setupSql(roles))).rejects.toThrow(/Reviewed webshop table absent/);
      await db.exec('ROLLBACK');
      const count = await db.query<{ n: number }>(
        "SELECT count(*)::integer AS n FROM pg_roles WHERE rolname LIKE 'proof_%'",
      );
      expect(count.rows[0].n).toBe(0);
    } finally {
      await db.close();
    }
  });

  it('rolls back the outer transaction after unexpected success or wrong error', async () => {
    for (const outcome of ['success', 'error'] as const) {
      const { client, calls } = fakeClient(outcome);
      await expect(
        runRollbackProbe(
          client,
          roles.app,
          'proofdb',
          'cms_services',
          'frozen',
          42,
          'app',
          roles.owner,
        ),
      ).rejects.toThrow(/required denial/);
      expect(calls).toContain('ROLLBACK TO SAVEPOINT proof_statement');
      expect(calls.at(-1)).toBe('ROLLBACK');
    }
  });

  it('accepts only exact guard denials while frozen and rolls back all positive webshop checks', async () => {
    const calls: string[] = [];
    const client: QueryClient = {
      async query(sql) {
        calls.push(sql);
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { command: sql };
        if (sql.startsWith('SELECT session_user'))
          return {
            rows: [{ session_user: roles.app, current_user: roles.app, db: 'proofdb', pid: 42 }],
          };
        if (
          /^(INSERT INTO public.\"cms_services\"|UPDATE public.\"cms_services\"|DELETE FROM public.\"cms_services\")/.test(
            sql,
          )
        )
          throw Object.assign(new Error(`CMS writes frozen for login role ${roles.app}`), {
            code: '42501',
          });
        if (/^(TRUNCATE|CREATE TABLE|ALTER TABLE|SET ROLE)/.test(sql))
          throw Object.assign(new Error('permission denied'), { code: '42501' });
        return { command: 'OK' };
      },
    };
    const events = await runRollbackProbe(
      client,
      roles.app,
      'proofdb',
      'cms_services',
      'frozen',
      42,
      'app',
      roles.owner,
    );
    expect(events).toContain('cms_insert=denied');
    expect(events).toContain('products_update=ok');
    expect(events).toContain('set_owner=denied');
    expect(calls.at(-1)).toBe('ROLLBACK');
    expect(calls.filter((sql) => sql === 'ROLLBACK TO SAVEPOINT proof_statement')).toHaveLength(23);
  });

  it('requires a final ROLLBACK acknowledgement even for positive probes', async () => {
    const { client, calls } = fakeClient('success', false);
    await expect(
      runRollbackProbe(
        client,
        roles.app,
        'proofdb',
        'cms_services',
        'unfrozen',
        42,
        'app',
        roles.owner,
      ),
    ).rejects.toThrow(/ROLLBACK acknowledgement/);
    expect(calls.at(-1)).toBe('ROLLBACK');
  });

  it('derives only the exact pooler companion for read-only HTTP identity checks', () => {
    const host = 'ep-proof-branch.eu-central-1.aws.neon.tech';
    const url = `postgresql://proof_app:private@${host}/proofdb?sslmode=require&channel_binding=require`;
    expect(new URL(derivePoolerUrl(url, host, roles.app)).hostname).toBe(
      'ep-proof-branch-pooler.eu-central-1.aws.neon.tech',
    );
    expect(() => derivePoolerUrl(url, 'ep-other.eu-central-1.aws.neon.tech', roles.app)).toThrow();
    expect(() =>
      derivePoolerUrl(url.replace('sslmode=require', 'sslmode=disable'), host, roles.app),
    ).toThrow();
  });

  it('runs setup and actual guard/probe transitions in PGlite with no persisted probe writes', async () => {
    const db = new PGlite();
    const contract = { ...roles, sourceOwner: roles.installer, trustedPlatformRoles: [] };
    const sql = (action: 'install' | 'unfreeze' | 'uninstall') =>
      makeFreezeSql(action, contract, FREEZE_PURPOSE);
    const client: QueryClient = {
      async query(statement) {
        const results = await db.exec(statement);
        return results.at(-1) as Awaited<ReturnType<QueryClient['query']>>;
      },
    };
    const asActor = async (
      role: string,
      actor: 'app' | 'cli',
      phase: 'frozen' | 'unfrozen' | 'uninstalled',
    ) => {
      await db.exec(`SET SESSION AUTHORIZATION "${role}"`);
      try {
        const pidResult = await db.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
        const database = await db.query<{ name: string }>('SELECT current_database() AS name');
        await runRollbackProbe(
          client,
          role,
          database.rows[0].name,
          'cms_services',
          phase,
          pidResult.rows[0].pid,
          actor,
          roles.owner,
        );
      } finally {
        await db.exec('ROLLBACK');
        await db.exec('SET SESSION AUTHORIZATION postgres');
      }
    };
    try {
      await db.exec(
        'CREATE TABLE users (id integer); CREATE TABLE products (id integer); CREATE TABLE orders (id integer); CREATE TABLE order_items (id integer); CREATE TABLE cms_services (id integer PRIMARY KEY);',
      );
      await db.exec('BEGIN');
      await db.query(
        "SELECT set_config('cms_freeze.app_password', $1, true) IS NOT NULL, set_config('cms_freeze.cli_password', $2, true) IS NOT NULL",
        ['app-test', 'cli-test'],
      );
      await db.exec(setupSql(roles));
      await db.exec('COMMIT');
      await db.exec(sql('install'));
      await asActor(roles.app, 'app', 'frozen');
      await asActor(roles.cli, 'cli', 'frozen');
      await db.exec(sql('unfreeze'));
      await asActor(roles.app, 'app', 'unfrozen');
      await db.exec(sql('uninstall'));
      await asActor(roles.app, 'app', 'uninstalled');
      await asActor(roles.cli, 'cli', 'uninstalled');
      const count = await db.query<{ n: number }>(
        'SELECT count(*)::integer AS n FROM cms_services',
      );
      expect(count.rows[0].n).toBe(0);
    } finally {
      await db.close();
    }
  });

  it('rejects unresolved 1Password references, weak and reused proof credentials', () => {
    const app = 'A'.repeat(32);
    const cli = 'B'.repeat(32);
    expect(() => validateProofPasswords(app, cli)).not.toThrow();
    for (const bad of [
      'op://OpenClaw/item/password',
      'op://OpenClaw/' + 'x'.repeat(40),
      'short',
      ' A'.repeat(16),
      app,
    ]) {
      expect(() => validateProofPasswords(app, bad)).toThrow(/Proof credentials/);
    }
  });

  it('validates reviewed CMS identifiers', () => {
    expect(validateCmsTable('cms_services')).toBe('"cms_services"');
    for (const name of ['products', 'cms_', 'cms_services;DROP', 'CMS_services'])
      expect(() => validateCmsTable(name)).toThrow();
  });
});
