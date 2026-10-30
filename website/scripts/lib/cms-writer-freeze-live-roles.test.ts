import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { setupSql } from './cms-writer-freeze-proof.mjs';
import { makeFreezeSql, FREEZE_PURPOSE } from './cms-writer-freeze-sql.mjs';
import {
  auditLiveRoleGrants,
  auditLiveProbeRelations,
  type AuditClient,
} from './cms-writer-freeze-live-roles.mjs';

const roles = { app: 'audit_app', cli: 'audit_cli', owner: 'audit_owner', installer: 'postgres' };

describe('live APP/CLI grant audit', () => {
  it('requires the exact guard trigger and function manifest before rollback probes', async () => {
    const db = new PGlite();
    const audit = () =>
      auditLiveProbeRelations(db as unknown as AuditClient, 'cms_services', 'frozen', roles.owner);
    try {
      await db.exec(
        'CREATE TABLE users (id integer); CREATE TABLE products (id integer); CREATE TABLE orders (id integer); CREATE TABLE order_items (id integer); CREATE TABLE cms_services (id integer PRIMARY KEY);',
      );
      await db.exec('BEGIN');
      await db.query(
        "SELECT set_config('cms_freeze.app_password',$1,true), set_config('cms_freeze.cli_password',$2,true)",
        ['distinct-app-password', 'distinct-cli-password'],
      );
      await db.exec(setupSql(roles));
      await db.exec('COMMIT');
      await db.exec(
        makeFreezeSql(
          'install',
          { ...roles, sourceOwner: 'postgres', trustedPlatformRoles: [] },
          FREEZE_PURPOSE,
        ),
      );
      await expect(audit()).resolves.toBeUndefined();

      // Same canonical trigger name, but a replacement function would have side effects.
      await db.exec(`BEGIN;
        DROP TRIGGER cms_writer_freeze_dml ON public.cms_services;
        CREATE FUNCTION audit_side_effect() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN INSERT INTO public.users VALUES (42); RETURN NULL; END $$;
        CREATE TRIGGER cms_writer_freeze_dml BEFORE INSERT OR UPDATE OR DELETE ON public.cms_services
          FOR EACH STATEMENT EXECUTE FUNCTION audit_side_effect();`);
      await expect(audit()).rejects.toThrow('guard manifest');
      await db.exec('ROLLBACK');

      // A row WHEN and a different tgtype cannot pass even with the canonical guard function.
      await db.exec(`BEGIN;
        DROP TRIGGER cms_writer_freeze_dml ON public.cms_services;
        CREATE TRIGGER cms_writer_freeze_dml BEFORE INSERT ON public.cms_services
          FOR EACH ROW WHEN (NEW.id IS NOT NULL) EXECUTE FUNCTION cms_writer_freeze.reject_unless_cli();`);
      await expect(audit()).rejects.toThrow('guard manifest');
      await db.exec('ROLLBACK');

      // UPDATE OF preserves the expected name, tgtype and function, but omits other UPDATEs.
      await db.exec(`BEGIN;
        DROP TRIGGER cms_writer_freeze_dml ON public.cms_services;
        CREATE TRIGGER cms_writer_freeze_dml BEFORE INSERT OR UPDATE OF id OR DELETE
          ON public.cms_services FOR EACH STATEMENT
          EXECUTE FUNCTION cms_writer_freeze.reject_unless_cli();
        ALTER TABLE public.cms_services ENABLE ALWAYS TRIGGER cms_writer_freeze_dml;`);
      await expect(audit()).rejects.toThrow('guard manifest');
      await db.exec('ROLLBACK');

      // Trigger arguments keep the same function OID but are not part of the reviewed contract.
      await db.exec(`BEGIN;
        DROP TRIGGER cms_writer_freeze_dml ON public.cms_services;
        CREATE TRIGGER cms_writer_freeze_dml BEFORE INSERT OR UPDATE OR DELETE
          ON public.cms_services FOR EACH STATEMENT
          EXECUTE FUNCTION cms_writer_freeze.reject_unless_cli('unexpected');
        ALTER TABLE public.cms_services ENABLE ALWAYS TRIGGER cms_writer_freeze_dml;`);
      await expect(audit()).rejects.toThrow('guard manifest');
      await db.exec('ROLLBACK');

      // CREATE OR REPLACE retains the function OID, owner and security settings: body must still match.
      await db.exec(`BEGIN;
        CREATE OR REPLACE FUNCTION cms_writer_freeze.reject_unless_cli() RETURNS trigger
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
          BEGIN INSERT INTO public.users VALUES (43); RETURN NULL; END $$;`);
      await expect(audit()).rejects.toThrow('guard manifest');
      await db.exec('ROLLBACK');

      await db.exec(
        'BEGIN; ALTER FUNCTION cms_writer_freeze.reject_unless_cli() SECURITY INVOKER;',
      );
      await expect(audit()).rejects.toThrow('guard manifest');
      await db.exec('ROLLBACK');
      await db.exec(
        'BEGIN; ALTER FUNCTION cms_writer_freeze.reject_unless_cli() SET search_path = public;',
      );
      await expect(audit()).rejects.toThrow('guard manifest');
      await db.exec('ROLLBACK');
      await db.exec(
        'BEGIN; GRANT EXECUTE ON FUNCTION cms_writer_freeze.reject_unless_cli() TO PUBLIC;',
      );
      await expect(audit()).rejects.toThrow('guard manifest');
      await db.exec('ROLLBACK');
      await expect(audit()).resolves.toBeUndefined();
      // BEFORE statement triggers cannot have transition tables or a partition-clone origin via
      // ordinary DDL. Simulate those catalog fields changing and require a closed preflight.
      for (const field of ['no_transition_tables', 'no_parent_trigger']) {
        const client: AuditClient = {
          async query(sql, values) {
            const result = await (db as unknown as AuditClient).query(sql, values);
            if (!sql.includes('t.tgparentid=0 AS no_parent_trigger')) return result;
            return {
              rows: result.rows.map((row, index) =>
                index === 0 ? { ...row, [field]: false } : row,
              ),
            };
          },
        };
        await expect(
          auditLiveProbeRelations(client, 'cms_services', 'frozen', roles.owner),
        ).rejects.toThrow('guard manifest');
      }
    } finally {
      await db.close();
    }
  });
  it('accepts only the audited four-table contract and rejects an extra CLI grant', async () => {
    const db = new PGlite();
    try {
      await db.exec(
        'CREATE TABLE users (id integer); CREATE TABLE products (id integer); CREATE TABLE orders (id integer); CREATE TABLE order_items (id integer); CREATE TABLE cms_services (id integer);',
      );
      await db.exec('BEGIN');
      await db.query(
        "SELECT set_config('cms_freeze.app_password',$1,true), set_config('cms_freeze.cli_password',$2,true)",
        ['distinct-app-password', 'distinct-cli-password'],
      );
      await db.exec(setupSql(roles));
      await db.exec('COMMIT');
      await expect(
        auditLiveRoleGrants(db as unknown as AuditClient, roles),
      ).resolves.toBeUndefined();
      await expect(
        auditLiveProbeRelations(
          db as unknown as AuditClient,
          'cms_services',
          'uninstalled',
          roles.owner,
        ),
      ).resolves.toBeUndefined();
      await db.exec(
        'CREATE FUNCTION webshop_probe_effect() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$; CREATE TRIGGER webshop_probe_effect BEFORE INSERT ON public.users FOR EACH STATEMENT EXECUTE FUNCTION webshop_probe_effect();',
      );
      await expect(
        auditLiveProbeRelations(
          db as unknown as AuditClient,
          'cms_services',
          'uninstalled',
          roles.owner,
        ),
      ).rejects.toThrow('unreviewed statement trigger');
      await db.exec('GRANT SELECT ON public.users TO audit_cli');
      await expect(auditLiveRoleGrants(db as unknown as AuditClient, roles)).rejects.toThrow(
        'grant audit failed',
      );
    } finally {
      await db.close();
    }
  });
});
