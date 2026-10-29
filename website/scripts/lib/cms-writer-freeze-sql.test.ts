import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import {
  FREEZE_PURPOSE,
  makeFreezeSql,
  type FreezeAction,
  type FreezeRoles,
} from './cms-writer-freeze-sql.mjs';

/** Superuser installer (PGlite's bootstrap `postgres`); a distinct NOLOGIN role owned the CMS tables. */
const roles: FreezeRoles = {
  app: 'freeze_app',
  cli: 'freeze_cli',
  owner: 'freeze_owner',
  installer: 'postgres',
  sourceOwner: 'freeze_source',
  trustedPlatformRoles: [],
};
/** Neon shape: the non-superuser database owner installs and owned the tables. PGlite's bootstrap
 * superuser `postgres` stands in for the provider's own superuser, so it is listed as trusted. */
const neon: FreezeRoles = {
  ...roles,
  installer: 'neon_owner',
  sourceOwner: 'neon_owner',
  trustedPlatformRoles: ['cloud_admin', 'neon_service', 'postgres'],
};

const sql = (action: FreezeAction, contract: FreezeRoles = roles) =>
  makeFreezeSql(action, contract, FREEZE_PURPOSE);

/** CMS tables (one with an enum, like `cms_role`) and the enum, all owned by the source owner. */
const BASE = `
  CREATE ROLE freeze_owner NOLOGIN;
  CREATE ROLE freeze_app LOGIN;
  CREATE ROLE freeze_cli LOGIN;
  CREATE ROLE freeze_source NOLOGIN;
  CREATE TYPE cms_role AS ENUM ('admin', 'editor');
  CREATE TABLE cms_users (id integer PRIMARY KEY, role cms_role NOT NULL DEFAULT 'editor');
  CREATE TABLE cms_services (id integer PRIMARY KEY, value text);
  ALTER TYPE cms_role OWNER TO freeze_source;
  ALTER TABLE cms_users OWNER TO freeze_source;
  ALTER TABLE cms_services OWNER TO freeze_source;
`;

async function asRole(db: PGlite, role: string, statement: string) {
  await db.exec(`SET SESSION AUTHORIZATION "${role}"`);
  try {
    return await db.exec(statement);
  } finally {
    await db.exec('ROLLBACK');
    await db.exec('SET SESSION AUTHORIZATION postgres');
  }
}

/** Runs `setup` (as postgres) and the generated SQL (as `installer`) in one rolled-back transaction. */
async function expectRefused(
  db: PGlite,
  setup: string,
  script: string,
  pattern: RegExp,
  installer = 'postgres',
) {
  await db.exec(`BEGIN; ${setup}`);
  try {
    await db.exec(`SET SESSION AUTHORIZATION "${installer}"`);
    await expect(db.exec(script)).rejects.toThrow(pattern);
  } finally {
    await db.exec('ROLLBACK');
    await db.exec('SET SESSION AUTHORIZATION postgres');
  }
}

async function tableState(db: PGlite, table: string) {
  return (
    await db.query<{ owner: string; acl: string[] | null; triggers: number }>(
      `SELECT pg_get_userbyid(relowner) AS owner, relacl::text[] AS acl,
         (SELECT count(*)::integer FROM pg_trigger WHERE tgrelid = c.oid AND NOT tgisinternal) AS triggers
       FROM pg_class c WHERE oid = '${table}'::regclass`,
    )
  ).rows[0];
}

async function guardAbsent(db: PGlite) {
  const sqlText = "SELECT to_regnamespace('cms_writer_freeze') IS NULL AS absent";
  return (await db.query<{ absent: boolean }>(sqlText)).rows[0].absent;
}

async function guardState(db: PGlite) {
  return (await db.query('SELECT * FROM cms_writer_freeze.state')).rows[0];
}

async function databaseName(db: PGlite) {
  return (await db.query<{ name: string }>('SELECT current_database() AS name')).rows[0].name;
}

describe('CMS writer freeze PostgreSQL integration', () => {
  it('freezes app and stale DML, permits only CLI, keeps the webshop and restores the source owner', async () => {
    const db = new PGlite();
    try {
      await db.exec(`${BASE}
        CREATE ROLE freeze_stale LOGIN;
        CREATE ROLE freeze_webshop LOGIN;
        CREATE TABLE webshop_orders (id integer PRIMARY KEY, value text);
        ALTER TABLE webshop_orders OWNER TO freeze_webshop;
        GRANT SELECT, INSERT, UPDATE, DELETE ON webshop_orders TO freeze_app;
        GRANT SELECT, INSERT, TRUNCATE ON cms_services TO freeze_stale;
      `);
      const webshop = await tableState(db, 'webshop_orders');
      await db.exec(sql('install'));
      expect(await guardState(db)).toMatchObject({
        enabled: true,
        app_role: 'freeze_app',
        source_owner: 'freeze_source',
        trusted_roles: [],
      });
      expect(await tableState(db, 'cms_users')).toMatchObject({
        owner: 'freeze_owner',
        triggers: 2,
      });
      for (const write of [
        "INSERT INTO cms_services VALUES (1, 'app')",
        "UPDATE cms_services SET value = 'empty update'",
        'DELETE FROM cms_users',
      ]) {
        await expect(asRole(db, 'freeze_app', write)).rejects.toThrow(/frozen/);
      }
      await expect(
        asRole(db, 'freeze_stale', "INSERT INTO cms_services VALUES (1, 'old URL')"),
      ).rejects.toThrow(/frozen/);
      await expect(asRole(db, 'freeze_stale', 'TRUNCATE cms_services')).rejects.toThrow(/frozen/);
      await expect(
        asRole(db, 'freeze_app', 'ALTER TABLE cms_services DISABLE TRIGGER cms_writer_freeze_dml'),
      ).rejects.toThrow(/owner/);
      await expect(
        asRole(db, 'freeze_app', 'CREATE TABLE public.cms_escape (id integer)'),
      ).rejects.toThrow(/permission/);
      await expect(
        asRole(db, 'freeze_app', 'UPDATE cms_writer_freeze.state SET enabled = false'),
      ).rejects.toThrow(/permission/);
      await asRole(db, 'freeze_app', "INSERT INTO webshop_orders VALUES (1, 'app during freeze')");
      await asRole(db, 'freeze_webshop', "INSERT INTO webshop_orders VALUES (2, 'owner')");
      await asRole(db, 'freeze_cli', "INSERT INTO cms_users VALUES (2, 'admin')");
      await db.exec(sql('verify'));

      // Drift after install fails verification.
      const drift: [string, RegExp][] = [
        ['ALTER TABLE cms_services DISABLE TRIGGER cms_writer_freeze_dml;', /trigger missing/],
        ['CREATE TABLE cms_new (id integer);', /coverage drift/],
        ['GRANT TRUNCATE ON cms_services TO freeze_app;', /TRIGGER\/MAINTAIN on CMS tables/],
        ['GRANT TRIGGER ON cms_users TO freeze_stale;', /CMS TRIGGER privilege/],
        ['GRANT pg_write_all_data TO freeze_stale WITH INHERIT FALSE;', /freeze_stale can bypass/],
      ];
      for (const [setup, pattern] of drift) await expectRefused(db, setup, sql('verify'), pattern);
      // Why the last check exists: a SET-only write-all member could otherwise rewrite guard state.
      await db.exec('BEGIN; GRANT pg_write_all_data TO freeze_stale WITH INHERIT FALSE;');
      await db.exec('SET SESSION AUTHORIZATION freeze_stale; SET ROLE pg_write_all_data;');
      await db.exec('UPDATE cms_writer_freeze.state SET enabled = false;');
      await db.exec('RESET ROLE; SET SESSION AUTHORIZATION postgres;');
      expect(await guardState(db)).toMatchObject({ enabled: false });
      await db.exec('ROLLBACK');
      await db.exec('SET SESSION AUTHORIZATION postgres');

      await db.exec(sql('unfreeze'));
      await asRole(db, 'freeze_app', "INSERT INTO cms_services VALUES (3, 'normal')");
      await db.exec(sql('freeze'));
      await expect(
        asRole(db, 'freeze_app', "INSERT INTO cms_services VALUES (4, 'blocked again')"),
      ).rejects.toThrow(/frozen/);
      await expectRefused(db, '', sql('uninstall'), /Unfreeze and verify/);
      await db.exec(sql('unfreeze'));
      await db.exec(sql('uninstall'));
      expect(await guardAbsent(db)).toBe(true);
      for (const table of ['cms_users', 'cms_services']) {
        expect(await tableState(db, table)).toMatchObject({ owner: 'freeze_source', triggers: 0 });
      }
      await asRole(
        db,
        'freeze_app',
        "INSERT INTO cms_services VALUES (5, 'after'); UPDATE cms_services SET value = 'u' WHERE id = 5; DELETE FROM cms_services WHERE id = 5;",
      );
      await expect(
        asRole(db, 'freeze_cli', "INSERT INTO cms_services VALUES (6, 'no grant left')"),
      ).rejects.toThrow(/permission/);
      expect(await tableState(db, 'webshop_orders')).toEqual(webshop);
      await asRole(db, 'freeze_webshop', "INSERT INTO webshop_orders VALUES (3, 'owner after')");
      const count = 'SELECT count(*)::integer AS n FROM webshop_orders';
      expect((await db.query(count)).rows[0]).toEqual({ n: 3 });
    } finally {
      await db.close();
    }
  });

  it('installs and uninstalls as a non-superuser Neon-shaped database owner with listed platform roles', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE neon_superuser NOLOGIN CREATEDB CREATEROLE BYPASSRLS;
        CREATE ROLE neon_owner LOGIN CREATEDB CREATEROLE BYPASSRLS IN ROLE neon_superuser;
        CREATE ROLE cloud_admin LOGIN SUPERUSER CREATEDB CREATEROLE BYPASSRLS;
        CREATE ROLE neon_service LOGIN CREATEROLE BYPASSRLS;
        ALTER DATABASE "${await databaseName(db)}" OWNER TO neon_owner;
      `);
      // As on Neon: the console owner created the tables and creates the new roles with SQL.
      await asRole(
        db,
        'neon_owner',
        `CREATE TYPE cms_role AS ENUM ('admin', 'editor');
        CREATE TABLE cms_users (id integer PRIMARY KEY, role cms_role NOT NULL DEFAULT 'editor');
        CREATE TABLE cms_services (id integer PRIMARY KEY, value text);
        CREATE TABLE webshop_orders (id integer PRIMARY KEY, value text);
        CREATE ROLE freeze_owner NOLOGIN;
        CREATE ROLE freeze_app LOGIN;
        CREATE ROLE freeze_cli LOGIN;
        GRANT freeze_owner TO neon_owner WITH INHERIT TRUE, SET FALSE;
        GRANT SELECT, INSERT, UPDATE, DELETE ON cms_users, cms_services, webshop_orders TO freeze_app;`,
      );
      const installer = 'neon_owner';
      const run = (script: string) => asRole(db, installer, script);
      const webshop = await tableState(db, 'webshop_orders');
      // PostgreSQL 16+ needs SET on the new owner for ALTER ... OWNER TO.
      await expectRefused(db, '', sql('install', neon), /INHERIT and SET membership/, installer);
      await run('GRANT freeze_owner TO neon_owner WITH SET TRUE');
      const without = { ...neon, trustedPlatformRoles: [] };
      await expectRefused(
        db,
        '',
        sql('install', without),
        /cloud_admin, neon_service, postgres can bypass/,
        installer,
      );
      const partial = { ...neon, trustedPlatformRoles: ['postgres'] };
      await expectRefused(
        db,
        '',
        sql('install', partial),
        /cloud_admin, neon_service can/,
        installer,
      );
      expect(await guardAbsent(db)).toBe(true);

      await run(sql('install', neon));
      expect(await guardState(db)).toMatchObject({
        enabled: true,
        installer_role: 'neon_owner',
        source_owner: 'neon_owner',
        trusted_roles: ['cloud_admin', 'neon_service', 'postgres'],
      });
      expect((await tableState(db, 'cms_users')).owner).toBe('freeze_owner');
      await expect(
        asRole(db, 'freeze_app', "INSERT INTO cms_users VALUES (1, 'admin')"),
      ).rejects.toThrow(/frozen/);
      await asRole(db, 'freeze_cli', "INSERT INTO cms_users VALUES (2, 'editor')");
      await asRole(db, 'freeze_app', "INSERT INTO webshop_orders VALUES (1, 'app')");
      await run("INSERT INTO webshop_orders VALUES (2, 'owner')");

      // The recorded list is compared as a set: reordering passes, a superset or subset fails.
      await run(
        sql('verify', {
          ...neon,
          trustedPlatformRoles: ['postgres', 'cloud_admin', 'neon_service'],
        }),
      );
      const superset = {
        ...neon,
        trustedPlatformRoles: [...neon.trustedPlatformRoles, 'neon_extra'],
      };
      for (const action of ['verify', 'uninstall'] as const) {
        await expectRefused(
          db,
          'CREATE ROLE neon_extra NOLOGIN;',
          sql(action, superset),
          /Trusted platform role list differs/,
          installer,
        );
      }
      const subset = { ...neon, trustedPlatformRoles: ['cloud_admin', 'postgres'] };
      await expectRefused(db, '', sql('verify', subset), /neon_service can bypass/, installer);

      await run(sql('unfreeze', neon));
      await asRole(db, 'freeze_app', "INSERT INTO cms_users VALUES (3, 'editor')");
      await run(sql('freeze', neon));
      await expect(asRole(db, 'freeze_app', 'DELETE FROM cms_users')).rejects.toThrow(/frozen/);
      await run(sql('unfreeze', neon));
      await run(sql('uninstall', neon));
      expect(await guardAbsent(db)).toBe(true);
      for (const table of ['cms_users', 'cms_services']) {
        expect(await tableState(db, table)).toMatchObject({ owner: 'neon_owner', triggers: 0 });
      }
      await asRole(
        db,
        'freeze_app',
        "INSERT INTO cms_services VALUES (4, 'after'); UPDATE cms_users SET role = 'admin'; DELETE FROM cms_services;",
      );
      await expect(asRole(db, 'freeze_cli', 'SELECT * FROM cms_users')).rejects.toThrow(
        /permission/,
      );
      expect(await tableState(db, 'webshop_orders')).toEqual(webshop);
      await run("INSERT INTO webshop_orders VALUES (3, 'owner after')");

      // A NOLOGIN source owner without schema CREATE exercises the non-superuser temporary
      // CREATE grant in both directions; the shared schema ACL ends as it started.
      await run(`CREATE ROLE cms_source NOLOGIN;
        GRANT cms_source TO neon_owner WITH INHERIT TRUE, SET TRUE;
        GRANT CREATE ON SCHEMA public TO cms_source;
        ALTER TABLE cms_users OWNER TO cms_source;
        ALTER TABLE cms_services OWNER TO cms_source;
        ALTER TYPE cms_role OWNER TO cms_source;
        REVOKE CREATE ON SCHEMA public FROM cms_source;`);
      const publicAcl = "SELECT nspacl::text[] AS acl FROM pg_namespace WHERE nspname = 'public'";
      const aclBefore = (await db.query(publicAcl)).rows;
      const split = { ...neon, sourceOwner: 'cms_source' };
      for (const action of ['install', 'unfreeze', 'uninstall'] as const) {
        await run(sql(action, split));
      }
      expect((await tableState(db, 'cms_services')).owner).toBe('cms_source');
      expect((await db.query(publicAcl)).rows).toEqual(aclBefore);
    } finally {
      await db.close();
    }
  });

  it('rejects trusted-list abuse: missing roles, app/CLI memberships and member logins', async () => {
    const db = new PGlite();
    try {
      await db.exec(`${BASE}
        CREATE ROLE cloud_admin LOGIN SUPERUSER;
        CREATE ROLE neon_service LOGIN CREATEROLE BYPASSRLS;
        CREATE ROLE platform_plain LOGIN;
        CREATE ROLE old_login LOGIN;
      `);
      const platform = {
        ...roles,
        trustedPlatformRoles: ['cloud_admin', 'neon_service', 'platform_plain'],
      };
      await expectRefused(db, '', sql('install'), /cloud_admin, neon_service can bypass/);
      const missing = { ...platform, trustedPlatformRoles: ['cloud_admin', 'missing_role'] };
      await expectRefused(db, '', sql('install', missing), /role missing: missing_role/);
      const options = ['', ' WITH ADMIN TRUE', ' WITH INHERIT FALSE', ' WITH SET FALSE'];
      for (const writer of ['freeze_app', 'freeze_cli']) {
        for (const option of [...options, ' WITH ADMIN TRUE, INHERIT FALSE, SET FALSE']) {
          const grant = `GRANT platform_plain TO ${writer}${option};`;
          await expectRefused(db, grant, sql('install', platform), /App\/CLI can assume/);
        }
      }
      const adminOnly =
        'GRANT neon_service TO freeze_app WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;';
      await expectRefused(db, adminOnly, sql('install', platform), /freeze_app via neon_service/);
      // Membership never inherits the exemption of a trusted login identity.
      const intoSuper = 'GRANT cloud_admin TO old_login WITH INHERIT FALSE, SET FALSE;';
      await expectRefused(db, intoSuper, sql('install', platform), /old_login can bypass/);
      const intoPlain = 'GRANT platform_plain TO old_login WITH INHERIT FALSE;';
      await expectRefused(
        db,
        intoPlain,
        sql('install', platform),
        /old_login can assume the installer or a trusted platform role/,
      );
      expect(await guardAbsent(db)).toBe(true);
      await db.exec(sql('install', platform));
      await db.exec(sql('verify', platform));
    } finally {
      await db.close();
    }
  });

  it('refuses old-role bypasses and unsafe states before or after transfer, leaving nothing changed', async () => {
    const db = new PGlite();
    try {
      const database = await databaseName(db);
      await db.exec(`${BASE} CREATE ROLE old_login LOGIN;`);
      const oldAsApp = { ...roles, app: 'old_login' };
      const oldAsSource = { ...roles, sourceOwner: 'old_login' };
      const cases: [string, RegExp, FreezeRoles?][] = [
        [
          'ALTER ROLE old_login CREATEROLE CREATEDB BYPASSRLS;',
          /App and CLI must be plain/,
          oldAsApp,
        ],
        [`ALTER DATABASE "${database}" OWNER TO old_login;`, /old_login via old_login/, oldAsApp],
        [
          'ALTER ROLE old_login CREATEROLE; ALTER TABLE cms_users OWNER TO old_login; ALTER TABLE cms_services OWNER TO old_login;',
          /old_login can bypass/,
          oldAsSource,
        ],
        ['ALTER ROLE old_login CREATEROLE;', /old_login can bypass/],
        ['GRANT pg_write_all_data TO old_login WITH INHERIT FALSE;', /old_login can bypass/],
        [
          `ALTER DATABASE "${database}" OWNER TO old_login; REVOKE CREATE ON DATABASE "${database}" FROM old_login;`,
          /old_login can create unguarded CMS relations/,
        ],
        [
          'ALTER SCHEMA public OWNER TO old_login; REVOKE CREATE ON SCHEMA public FROM old_login;',
          /old_login can create unguarded CMS relations/,
        ],
        [
          'CREATE ROLE freeze_creator NOLOGIN; GRANT CREATE ON SCHEMA public TO freeze_creator; GRANT freeze_creator TO freeze_app WITH INHERIT FALSE;',
          /freeze_app can create unguarded CMS relations directly or via SET ROLE/,
        ],
        [
          'CREATE ROLE freeze_admin NOLOGIN CREATEROLE; GRANT freeze_admin TO freeze_app WITH INHERIT FALSE;',
          /freeze_app can bypass the guard or administer roles/,
        ],
        ['ALTER TYPE cms_role OWNER TO freeze_app;', /owns objects.*freeze_app via freeze_app/],
        ['GRANT TRIGGER ON cms_services TO freeze_app;', /freeze_app via freeze_app/],
        ['GRANT MAINTAIN ON cms_users TO freeze_cli;', /freeze_cli via freeze_cli/],
        ['GRANT SELECT ON cms_services TO freeze_cli;', /CLI role must be fresh/],
        ['ALTER TABLE cms_services OWNER TO old_login;', /differs from the declared source owner/],
        ['CREATE TABLE cms_serial (id serial PRIMARY KEY);', /sequence/],
        [
          'CREATE FUNCTION public.early_writer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$; CREATE TRIGGER aaa_early BEFORE INSERT ON cms_services FOR EACH STATEMENT EXECUTE FUNCTION public.early_writer();',
          /Existing CMS user trigger/,
        ],
        // These fail only after the ownership transfer, so they also prove the rollback. Writes
        // through an inheritance parent skip the CMS table's statement trigger.
        [
          'CREATE TABLE ext_parent (id integer); ALTER TABLE cms_services INHERIT ext_parent;',
          /inheritance/,
        ],
        // The stale login can SET ROLE to the source owner, which still owns the CMS enum
        // (ALTER TYPE ... RENAME VALUE would rewrite CMS data without DML).
        [
          'GRANT freeze_source TO old_login WITH INHERIT FALSE;',
          /old_login own or can assume the owner of an object the CMS tables depend on/,
        ],
      ];
      for (const [setup, pattern, contract] of cases) {
        await expectRefused(db, setup, sql('install', contract), pattern);
        expect(await guardAbsent(db)).toBe(true);
        for (const table of ['cms_users', 'cms_services']) {
          expect(await tableState(db, table)).toEqual({
            owner: 'freeze_source',
            acl: null,
            triggers: 0,
          });
        }
      }
    } finally {
      await db.close();
    }
  });

  it('validates identifiers, distinct roles and the explicit trusted list, and stamps the header', () => {
    expect(() => sql('install', { ...roles, app: 'app; DROP TABLE cms_services' })).toThrow(
      /Invalid/,
    );
    expect(() => sql('install', { ...roles, app: roles.cli })).toThrow(/distinct/);
    expect(() => sql('install', { ...roles, sourceOwner: roles.app })).toThrow(
      /Source owner must be distinct/,
    );
    expect(() => sql('install', { ...roles, sourceOwner: roles.owner })).toThrow(/Source owner/);
    const reserved = [roles.app, roles.cli, roles.owner, roles.installer, roles.sourceOwner];
    for (const name of reserved) {
      const contract = { ...roles, trustedPlatformRoles: ['cloud_admin', name] };
      expect(() => sql('install', contract)).toThrow(/cannot be the app/);
    }
    for (const name of [
      '*',
      '%',
      'neon_%',
      'neon_*',
      'cloud admin',
      'Cloud_admin',
      '',
      'x'.repeat(64),
    ]) {
      expect(() => sql('verify', { ...roles, trustedPlatformRoles: [name] })).toThrow(/Invalid/);
    }
    const duplicate = { ...roles, trustedPlatformRoles: ['cloud_admin', 'cloud_admin'] };
    expect(() => sql('install', duplicate)).toThrow(/Duplicate/);
    for (const name of ['pg_database_owner', 'none']) {
      expect(() => sql('install', { ...roles, trustedPlatformRoles: [name] })).toThrow(/pg_\*/);
    }
    const notAList = { ...roles, trustedPlatformRoles: 'cloud_admin' as unknown as string[] };
    expect(() => sql('install', notAList)).toThrow(/explicit list/);
    const purpose = 'staging-activation' as typeof FREEZE_PURPOSE;
    expect(() => makeFreezeSql('install', roles, purpose)).toThrow(/Purpose/);
    expect(() => makeFreezeSql('drop' as FreezeAction, roles, FREEZE_PURPOSE)).toThrow(/Unknown/);

    const reordered = {
      ...neon,
      trustedPlatformRoles: ['postgres', 'neon_service', 'cloud_admin'],
    };
    const header = sql('install', reordered);
    expect(header).toBe(sql('install', neon));
    expect(header).toContain(
      '-- Generated CMS writer freeze: install. Purpose: disposable-branch-proof.',
    );
    expect(header).toContain('-- Trusted platform roles: cloud_admin, neon_service, postgres');
    expect(header).toContain('-- ATTESTATION: SQL cannot prove these platform roles safe');
    expect(sql('verify')).toContain('-- Trusted platform roles: none');
  });
});
