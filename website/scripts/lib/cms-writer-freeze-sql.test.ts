import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { makeFreezeSql, type FreezeRoles } from './cms-writer-freeze-sql.mjs';

const roles: FreezeRoles = {
  app: 'freeze_app',
  cli: 'freeze_cli',
  owner: 'freeze_owner',
  installer: 'postgres',
};

async function asRole(db: PGlite, role: string, statement: string) {
  await db.exec(`SET SESSION AUTHORIZATION "${role}"`);
  try {
    return await db.exec(statement);
  } finally {
    await db.exec('SET SESSION AUTHORIZATION postgres');
  }
}

describe('CMS writer freeze PostgreSQL integration', () => {
  it('blocks app and stale deployment DML, permits only CLI, and restores normal ownership', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE freeze_owner NOLOGIN;
        CREATE ROLE freeze_app LOGIN;
        CREATE ROLE freeze_cli LOGIN;
        CREATE ROLE freeze_stale LOGIN;
        GRANT freeze_owner TO postgres;
        GRANT freeze_app TO postgres;
        CREATE TABLE cms_services (id integer PRIMARY KEY, value text);
        CREATE TABLE cms_bookings (id integer PRIMARY KEY, value text);
        CREATE TABLE cms_offerings (id integer PRIMARY KEY, value text);
        CREATE TABLE webshop_orders (id integer PRIMARY KEY, value text);
        ALTER TABLE cms_services OWNER TO freeze_app;
        ALTER TABLE cms_bookings OWNER TO freeze_app;
        ALTER TABLE cms_offerings OWNER TO freeze_app;
        ALTER TABLE webshop_orders OWNER TO freeze_app;
        GRANT INSERT, SELECT ON cms_services TO freeze_stale;
      `);
      await db.exec(makeFreezeSql('install', roles));
      expect(
        (await db.query<{ enabled: boolean }>('SELECT enabled FROM cms_writer_freeze.state'))
          .rows[0].enabled,
      ).toBe(true);
      await expect(
        asRole(db, 'freeze_app', "INSERT INTO cms_services VALUES (1, 'app')"),
      ).rejects.toThrow(/frozen/);
      await expect(
        asRole(db, 'freeze_stale', "INSERT INTO cms_services VALUES (1, 'old URL')"),
      ).rejects.toThrow(/frozen/);
      await expect(
        asRole(db, 'freeze_app', "UPDATE cms_offerings SET value = 'x'"),
      ).rejects.toThrow(/frozen/);
      await expect(asRole(db, 'freeze_app', 'DELETE FROM cms_offerings')).rejects.toThrow(/frozen/);
      await db.exec('GRANT TRUNCATE ON cms_services TO freeze_app');
      await expect(asRole(db, 'freeze_app', 'TRUNCATE cms_services')).rejects.toThrow(/frozen/);
      await expect(
        asRole(db, 'freeze_app', 'ALTER TABLE cms_services DISABLE TRIGGER cms_writer_freeze_dml'),
      ).rejects.toThrow(/owner/);
      await expect(
        asRole(db, 'freeze_app', 'CREATE TABLE public.cms_escape (id integer)'),
      ).rejects.toThrow(/permission/);
      await asRole(db, 'freeze_app', "INSERT INTO webshop_orders VALUES (1, 'untouched')");
      await asRole(db, 'freeze_cli', "INSERT INTO cms_services VALUES (2, 'cli')");
      await db.exec(makeFreezeSql('verify', roles));
      await db.exec('ALTER TABLE cms_services DISABLE TRIGGER cms_writer_freeze_dml');
      await expect(db.exec(makeFreezeSql('verify', roles))).rejects.toThrow(/trigger missing/);
      await db.exec('ROLLBACK');
      await db.exec('ALTER TABLE cms_services ENABLE ALWAYS TRIGGER cms_writer_freeze_dml');
      await db.exec('CREATE TABLE cms_new (id integer)');
      await expect(db.exec(makeFreezeSql('verify', roles))).rejects.toThrow(/coverage drift/);
      await db.exec('ROLLBACK');
      await db.exec('DROP TABLE cms_new');
      await db.exec(makeFreezeSql('unfreeze', roles));
      await asRole(db, 'freeze_app', "INSERT INTO cms_bookings VALUES (3, 'normal')");
      await db.exec(makeFreezeSql('freeze', roles));
      await expect(
        asRole(db, 'freeze_app', "INSERT INTO cms_bookings VALUES (4, 'blocked again')"),
      ).rejects.toThrow(/frozen/);
      await db.exec(makeFreezeSql('unfreeze', roles));
      await db.exec(makeFreezeSql('uninstall', roles));
      await asRole(db, 'freeze_app', "INSERT INTO cms_bookings VALUES (5, 'owner restored')");
      await expect(
        asRole(db, 'freeze_cli', "INSERT INTO cms_bookings VALUES (6, 'no old grant')"),
      ).rejects.toThrow();
      expect(
        (
          await db.query(
            "SELECT pg_get_userbyid(relowner) AS owner FROM pg_class WHERE relname='cms_bookings'",
          )
        ).rows[0],
      ).toEqual({ owner: 'freeze_app' });
      expect((await db.query('SELECT count(*)::integer AS n FROM webshop_orders')).rows[0]).toEqual(
        { n: 1 },
      );
    } finally {
      await db.close();
    }
  });

  it('refuses CMS sequence/default and prior user-trigger bypasses before any transfer', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE freeze_owner NOLOGIN;
        CREATE ROLE freeze_app LOGIN;
        CREATE ROLE freeze_cli LOGIN;
        GRANT freeze_owner TO postgres;
        GRANT freeze_app TO postgres;
        CREATE TABLE cms_serial (id serial PRIMARY KEY);
        ALTER TABLE cms_serial OWNER TO freeze_app;
      `);
      await expect(db.exec(makeFreezeSql('install', roles))).rejects.toThrow(/sequence/);
      await db.exec('ROLLBACK');
      await db.exec('DROP TABLE cms_serial');
      await db.exec(`
        CREATE TABLE cms_plain (id integer);
        ALTER TABLE cms_plain OWNER TO freeze_app;
        CREATE FUNCTION public.early_writer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
        CREATE TRIGGER aaa_early BEFORE INSERT ON cms_plain FOR EACH STATEMENT EXECUTE FUNCTION public.early_writer();
      `);
      await expect(db.exec(makeFreezeSql('install', roles))).rejects.toThrow(
        /Existing CMS user trigger/,
      );
      await db.exec('ROLLBACK');
      expect(
        (await db.query("SELECT to_regnamespace('cms_writer_freeze') IS NULL AS absent")).rows[0],
      ).toEqual({ absent: true });
    } finally {
      await db.close();
    }
  });
  it('refuses CREATE-capable roles that a login can assume without inherited privileges', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE freeze_owner NOLOGIN;
        CREATE ROLE freeze_app LOGIN NOINHERIT;
        CREATE ROLE freeze_cli LOGIN;
        CREATE ROLE freeze_creator NOLOGIN;
        GRANT freeze_owner TO postgres;
        GRANT freeze_app TO postgres;
        GRANT CREATE ON SCHEMA public TO freeze_creator;
        GRANT freeze_creator TO freeze_app;
        CREATE TABLE cms_services (id integer PRIMARY KEY);
        ALTER TABLE cms_services OWNER TO freeze_app;
      `);
      expect(
        (
          await db.query<{ inherited_create: boolean; can_assume: boolean }>(
            "SELECT has_schema_privilege('freeze_app', 'public', 'CREATE') AS inherited_create, pg_has_role('freeze_app', 'freeze_creator', 'MEMBER') AS can_assume",
          )
        ).rows[0],
      ).toEqual({ inherited_create: false, can_assume: true });
      await expect(db.exec(makeFreezeSql('install', roles))).rejects.toThrow(/via SET ROLE/);
      await db.exec('ROLLBACK');
      expect(
        (await db.query("SELECT to_regnamespace('cms_writer_freeze') IS NULL AS absent")).rows[0],
      ).toEqual({ absent: true });
    } finally {
      await db.close();
    }
  });

  it('refuses non-inherited delegated role administration before transfer', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE freeze_owner NOLOGIN;
        CREATE ROLE freeze_app LOGIN NOINHERIT;
        CREATE ROLE freeze_cli LOGIN;
        CREATE ROLE freeze_admin NOLOGIN CREATEROLE;
        GRANT freeze_owner TO postgres;
        GRANT freeze_app TO postgres;
        GRANT freeze_admin TO freeze_app;
        CREATE TABLE cms_services (id integer PRIMARY KEY);
        ALTER TABLE cms_services OWNER TO freeze_app;
      `);
      expect(
        (
          await db.query<{ inherited_admin: boolean; can_assume: boolean }>(
            "SELECT rolcreaterole AS inherited_admin, pg_has_role('freeze_app', 'freeze_admin', 'MEMBER') AS can_assume FROM pg_roles WHERE rolname = 'freeze_app'",
          )
        ).rows[0],
      ).toEqual({ inherited_admin: false, can_assume: true });
      await expect(db.exec(makeFreezeSql('install', roles))).rejects.toThrow(/administer roles/);
      await db.exec('ROLLBACK');
      expect(
        (await db.query("SELECT to_regnamespace('cms_writer_freeze') IS NULL AS absent")).rows[0],
      ).toEqual({ absent: true });
    } finally {
      await db.close();
    }
  });

  it('refuses a schema owner that can self-grant CREATE after revoking it', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE freeze_owner NOLOGIN;
        CREATE ROLE freeze_app LOGIN;
        CREATE ROLE freeze_cli LOGIN;
        GRANT freeze_owner TO postgres;
        GRANT freeze_app TO postgres;
        ALTER SCHEMA public OWNER TO freeze_app;
        REVOKE CREATE ON SCHEMA public FROM freeze_app;
        CREATE TABLE cms_services (id integer PRIMARY KEY);
        ALTER TABLE cms_services OWNER TO freeze_app;
      `);
      expect(
        (
          await db.query<{ create_grant: boolean; owns_schema: boolean }>(
            "SELECT has_schema_privilege('freeze_app', 'public', 'CREATE') AS create_grant, nspowner = 'freeze_app'::regrole::oid AS owns_schema FROM pg_namespace WHERE nspname='public'",
          )
        ).rows[0],
      ).toEqual({ create_grant: false, owns_schema: true });
      await expect(db.exec(makeFreezeSql('install', roles))).rejects.toThrow(
        /unguarded CMS relations/,
      );
      await db.exec('ROLLBACK');
      expect(
        (await db.query("SELECT to_regnamespace('cms_writer_freeze') IS NULL AS absent")).rows[0],
      ).toEqual({ absent: true });
    } finally {
      await db.close();
    }
  });

  it('refuses a database owner even when its CREATE grant was revoked', async () => {
    const db = new PGlite();
    try {
      const database = (await db.query<{ name: string }>('SELECT current_database() AS name'))
        .rows[0].name;
      await db.exec(`
        CREATE ROLE freeze_owner NOLOGIN;
        CREATE ROLE freeze_app LOGIN;
        CREATE ROLE freeze_cli LOGIN;
        GRANT freeze_owner TO postgres;
        GRANT freeze_app TO postgres;
        CREATE TABLE cms_services (id integer PRIMARY KEY);
        ALTER TABLE cms_services OWNER TO freeze_app;
        ALTER DATABASE "${database}" OWNER TO freeze_app;
        REVOKE CREATE ON DATABASE "${database}" FROM freeze_app;
      `);
      expect(
        (
          await db.query<{ create_grant: boolean; owns_database: boolean }>(
            "SELECT has_database_privilege('freeze_app', current_database(), 'CREATE') AS create_grant, datdba = 'freeze_app'::regrole::oid AS owns_database FROM pg_database WHERE datname = current_database()",
          )
        ).rows[0],
      ).toEqual({ create_grant: false, owns_database: true });
      await expect(db.exec(makeFreezeSql('install', roles))).rejects.toThrow(
        /unguarded CMS relations/,
      );
      await db.exec('ROLLBACK');
      expect(
        (await db.query("SELECT to_regnamespace('cms_writer_freeze') IS NULL AS absent")).rows[0],
      ).toEqual({ absent: true });
    } finally {
      await db.close();
    }
  });

  it('rejects unsafe role identifiers and duplicate roles', () => {
    expect(() =>
      makeFreezeSql('install', { ...roles, app: 'app; DROP TABLE cms_services' }),
    ).toThrow(/Invalid/);
    expect(() => makeFreezeSql('install', { ...roles, app: roles.cli })).toThrow(/distinct/);
  });
});
