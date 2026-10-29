/** Pure, fail-closed validation for the disposable-branch SQL runner. No network or environment reads. */
import { createHash } from 'node:crypto';
import {
  FREEZE_ACTIONS,
  FREEZE_PURPOSE,
  makeFreezeSql,
  type FreezeAction,
  type FreezeRoles,
} from './cms-writer-freeze-sql.mjs';

export function validateTarget(
  connectionString: string,
  expectedHost: string,
  expectedDatabase: string,
  installer: string,
): void {
  // The expected endpoint must be a concrete Neon direct endpoint, never a wildcard or pooler.
  if (
    !/^[a-z_][a-z0-9_]{0,62}$/.test(expectedDatabase) ||
    !/^[a-z_][a-z0-9_]{0,62}$/.test(installer)
  ) {
    throw new Error('Expected database and installer must be exact PostgreSQL names');
  }
  if (
    !/^ep-[a-z0-9-]+\.[a-z0-9-]+\.(?:aws|azure)\.neon\.tech$/.test(expectedHost) ||
    expectedHost.split('.')[0].endsWith('-pooler')
  ) {
    throw new Error('Expected host must be an exact non-pooler Neon endpoint');
  }
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL is not a valid PostgreSQL URL');
  }
  let database: string;
  let username: string;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
    username = decodeURIComponent(url.username);
  } catch {
    throw new Error('DATABASE_URL has invalid encoded connection fields');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== expectedHost ||
    (url.port && url.port !== '5432') ||
    url.hash ||
    !url.username ||
    !url.password ||
    database !== expectedDatabase ||
    username !== installer ||
    url.searchParams.getAll('sslmode').length !== 1 ||
    url.searchParams.get('sslmode') !== 'require' ||
    [...url.searchParams.keys()].some((key) => key !== 'sslmode')
  ) {
    throw new Error('DATABASE_URL must target the pinned direct Neon host with sslmode=require');
  }
}

export type ReviewedSql = { action: FreezeAction; roles: FreezeRoles; digest: string; sql: string };

export function validateReviewedSql(
  sql: string,
  expectedDigest: string,
  installer: string,
): ReviewedSql {
  if (!/^[0-9a-f]{64}$/.test(expectedDigest))
    throw new Error('SHA-256 must be 64 lowercase hex digits');
  const digest = createHash('sha256').update(sql).digest('hex');
  if (digest !== expectedDigest) throw new Error('SQL SHA-256 mismatch');
  const lines = sql.split('\n');
  const match =
    /^-- Generated CMS writer freeze: (install|verify|freeze|unfreeze|uninstall)\. Purpose: (disposable-branch-proof)\.$/.exec(
      lines[0] ?? '',
    );
  const roleMatch =
    /^-- Roles: app=([a-z_][a-z0-9_]{0,62}) cli=([a-z_][a-z0-9_]{0,62}) owner=([a-z_][a-z0-9_]{0,62}) installer=([a-z_][a-z0-9_]{0,62}) source_owner=([a-z_][a-z0-9_]{0,62})$/.exec(
      lines[2] ?? '',
    );
  const trustedMatch =
    /^-- Trusted platform roles: (none|[a-z_][a-z0-9_]{0,62}(?:, [a-z_][a-z0-9_]{0,62})*)$/.exec(
      lines[3] ?? '',
    );
  if (
    !match ||
    !roleMatch ||
    !trustedMatch ||
    !FREEZE_ACTIONS.includes(match[1] as FreezeAction) ||
    match[2] !== FREEZE_PURPOSE ||
    roleMatch[4] !== installer
  ) {
    throw new Error('SQL header purpose, action, role or installer contract mismatch');
  }
  const action = match[1] as FreezeAction;
  const roles: FreezeRoles = {
    app: roleMatch[1],
    cli: roleMatch[2],
    owner: roleMatch[3],
    installer: roleMatch[4],
    sourceOwner: roleMatch[5],
    trustedPlatformRoles: trustedMatch[1] === 'none' ? [] : trustedMatch[1].split(', '),
  };
  // Exact regeneration verifies BEGIN/COMMIT, the entire role contract, and every statement;
  // an edited script is refused even if its edited bytes have a matching supplied digest.
  try {
    if (sql !== makeFreezeSql(action, roles, FREEZE_PURPOSE)) throw new Error('mismatch');
  } catch {
    throw new Error('SQL is not the exact generated transaction for its declared contract');
  }
  return { action, roles, digest, sql };
}

export function validateIdentity(
  row: {
    session_user?: unknown;
    current_user?: unknown;
    current_database?: unknown;
    server_version_num?: unknown;
  },
  installer: string,
  expectedDatabase: string,
): void {
  if (row.session_user !== installer || row.current_user !== installer) {
    throw new Error('Database session/current user does not match expected installer');
  }
  if (row.current_database !== expectedDatabase) {
    throw new Error('Database current_database() does not match expected database');
  }
  const version = Number(row.server_version_num);
  if (!Number.isInteger(version) || version < 160000)
    throw new Error('PostgreSQL 16 or later is required');
}

/** Only session-local state; the second statement sequence must abort after its INSERT. */
export const PROBE_SUCCESS_SQL = `BEGIN;
CREATE TEMP TABLE cms_writer_freeze_transport_probe (marker integer NOT NULL) ON COMMIT PRESERVE ROWS;
INSERT INTO cms_writer_freeze_transport_probe VALUES (1);
COMMIT;`;
export const PROBE_FAILURE_SQL = `BEGIN;
INSERT INTO pg_temp.cms_writer_freeze_transport_probe VALUES (2);
SELECT 1 / (marker - 1) FROM pg_temp.cms_writer_freeze_transport_probe;
COMMIT;`;
