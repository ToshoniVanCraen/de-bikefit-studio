import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { setupSql } from './cms-writer-freeze-proof.mjs';
import {
  auditLiveRoleGrants,
  auditLiveProbeRelations,
  type AuditClient,
} from './cms-writer-freeze-live-roles.mjs';

const roles = { app: 'audit_app', cli: 'audit_cli', owner: 'audit_owner', installer: 'postgres' };

describe('live APP/CLI grant audit', () => {
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
        auditLiveProbeRelations(db as unknown as AuditClient, 'cms_services', 'uninstalled'),
      ).resolves.toBeUndefined();
      await db.exec(
        'CREATE FUNCTION webshop_probe_effect() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$; CREATE TRIGGER webshop_probe_effect BEFORE INSERT ON public.users FOR EACH STATEMENT EXECUTE FUNCTION webshop_probe_effect();',
      );
      await expect(
        auditLiveProbeRelations(db as unknown as AuditClient, 'cms_services', 'uninstalled'),
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
