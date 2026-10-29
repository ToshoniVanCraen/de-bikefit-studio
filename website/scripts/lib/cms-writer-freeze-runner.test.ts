import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { FREEZE_PURPOSE, makeFreezeSql, type FreezeRoles } from './cms-writer-freeze-sql.mjs';
import {
  PROBE_FAILURE_SQL,
  PROBE_SUCCESS_SQL,
  validateIdentity,
  validateReviewedSql,
  validateTarget,
} from './cms-writer-freeze-runner.mjs';

const host = 'ep-proof-branch.eu-central-1.aws.neon.tech';
const url = `postgresql://freeze_installer:private@${host}/proofdb?sslmode=require`;
const roles: FreezeRoles = {
  app: 'freeze_app',
  cli: 'freeze_cli',
  owner: 'freeze_owner',
  installer: 'freeze_installer',
  sourceOwner: 'freeze_installer',
  trustedPlatformRoles: ['cloud_admin', 'neon_service'],
};
const sql = makeFreezeSql('verify', roles, FREEZE_PURPOSE);
const digest = (text: string) => createHash('sha256').update(text).digest('hex');

describe('disposable freeze runner validation', () => {
  it('pins direct host, database, installer login, port and TLS request', () => {
    expect(() => validateTarget(url, host, 'proofdb', 'freeze_installer')).not.toThrow();
    for (const bad of [
      url.replace(host, 'ep-proof-branch-pooler.eu-central-1.aws.neon.tech'),
      url.replace(host, 'ep-other-branch.eu-central-1.aws.neon.tech'),
      url.replace('/proofdb', '/staging'),
      url.replace('freeze_installer:', 'other_user:'),
      url.replace('sslmode=require', 'sslmode=disable'),
      url + '&sslmode=disable',
      url + '&options=-csearch_path=public',
      url + '&channel_binding=require',
      url.replace('/proofdb', ':5433/proofdb'),
    ])
      expect(() => validateTarget(bad, host, 'proofdb', 'freeze_installer')).toThrow();
    expect(() =>
      validateTarget(url, host.replace('branch.', 'branch-pooler.'), 'proofdb', 'freeze_installer'),
    ).toThrow();
  });

  it('requires an exact generated transaction, even if edited SQL is rehashed', () => {
    expect(validateReviewedSql(sql, digest(sql), roles.installer)).toMatchObject({
      action: 'verify',
      digest: digest(sql),
    });
    expect(() => validateReviewedSql(sql, '0'.repeat(64), roles.installer)).toThrow(
      /SHA-256 mismatch/,
    );
    expect(() => validateReviewedSql(sql, digest(sql), 'other_user')).toThrow(/contract mismatch/);
    for (const edited of [
      sql.replace('BEGIN;', 'SELECT 1; BEGIN;'),
      sql.replace('COMMIT;', 'ROLLBACK;'),
      sql.replace('disposable-branch-proof', 'live-proof'),
      sql.replace('installer=freeze_installer', 'installer=other_user'),
      sql.replace('SET LOCAL lock_timeout', 'SET LOCAL idle_in_transaction_session_timeout'),
    ])
      expect(() => validateReviewedSql(edited, digest(edited), roles.installer)).toThrow();
  });

  it('probe SQL commits only a temp baseline and rolls back its mid-transaction write', async () => {
    const db = new PGlite();
    try {
      await db.exec(PROBE_SUCCESS_SQL);
      await expect(db.exec(PROBE_FAILURE_SQL)).rejects.toThrow();
      await db.exec('ROLLBACK');
      const count = await db.query<{ n: number }>(
        'SELECT count(*)::integer AS n FROM pg_temp.cms_writer_freeze_transport_probe',
      );
      expect(count.rows[0].n).toBe(1);
      expect(
        (
          await db.query<{ relation: string | null }>(
            "SELECT to_regclass('public.cms_writer_freeze_transport_probe')::text AS relation",
          )
        ).rows[0].relation,
      ).toBeNull();
    } finally {
      await db.close();
    }
  });

  it('requires both session identities and PostgreSQL 16+', () => {
    expect(() =>
      validateIdentity(
        {
          session_user: 'freeze_installer',
          current_user: 'freeze_installer',
          current_database: 'proofdb',
          server_version_num: '160000',
        },
        roles.installer,
        'proofdb',
      ),
    ).not.toThrow();
    expect(() =>
      validateIdentity(
        {
          session_user: 'freeze_installer',
          current_user: 'other',
          current_database: 'proofdb',
          server_version_num: '170000',
        },
        roles.installer,
        'proofdb',
      ),
    ).toThrow();
    expect(() =>
      validateIdentity(
        {
          session_user: 'freeze_installer',
          current_user: 'freeze_installer',
          current_database: 'proofdb',
          server_version_num: '150000',
        },
        roles.installer,
        'proofdb',
      ),
    ).toThrow();
    expect(() =>
      validateIdentity(
        {
          session_user: 'freeze_installer',
          current_user: 'freeze_installer',
          current_database: 'staging',
          server_version_num: '170000',
        },
        roles.installer,
        'proofdb',
      ),
    ).toThrow(/current_database/);
  });
});
