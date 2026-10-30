/** Live-only pins and independent, read-only Neon branch→endpoint attestation. */
import { createHash } from 'node:crypto';
import { setupSql, SHOP_TABLES, type ProofRoles } from './cms-writer-freeze-proof.mjs';
import {
  FREEZE_ACTIONS,
  makeFreezeSql,
  type FreezeAction,
  type FreezeRoles,
} from './cms-writer-freeze-sql.mjs';

export type LiveEnvironment = 'staging' | 'production';
export type LivePins = {
  environment: LiveEnvironment;
  purpose: string;
  projectId: string;
  branchId: string;
  branchName: string;
  endpointId: string;
  host: string;
  database: string;
  installer: string;
};

const ID = /^(?:[a-z0-9]+-)*[a-z0-9]+$/;
const NAME = /^[A-Za-z0-9_-]{1,80}$/;
const PG_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
const HOST = /^ep-[a-z0-9-]+\.[a-z0-9-]+\.(?:aws|azure)\.neon\.tech$/;

export function validateLivePins(pins: LivePins): void {
  if (
    !['staging', 'production'].includes(pins.environment) ||
    pins.purpose !== `live-${pins.environment}-writer-freeze` ||
    !ID.test(pins.projectId) ||
    !ID.test(pins.branchId) ||
    !pins.branchId.startsWith('br-') ||
    !NAME.test(pins.branchName) ||
    pins.branchName !== (pins.environment === 'staging' ? 'Staging' : 'production') ||
    !ID.test(pins.endpointId) ||
    !pins.endpointId.startsWith('ep-') ||
    !HOST.test(pins.host) ||
    pins.host.split('.')[0] !== pins.endpointId ||
    pins.host.split('.')[0].endsWith('-pooler') ||
    !PG_NAME.test(pins.database) ||
    !PG_NAME.test(pins.installer)
  ) {
    throw new Error('Live environment, purpose or exact Neon/database pins invalid');
  }
}

/** Only the header differs; all SQL statements are byte-identical to the reviewed guard. */
export function makeLiveFreezeSql(
  action: FreezeAction,
  roles: FreezeRoles,
  pins: LivePins,
): string {
  validateLivePins(pins);
  if (roles.installer !== pins.installer) throw new Error('Live installer pin mismatch');
  const proof = makeFreezeSql(action, roles, 'disposable-branch-proof');
  const lines = proof.split('\n');
  lines[0] = `-- Generated CMS writer freeze: ${action}. Purpose: ${pins.purpose}.`;
  lines[1] = `-- Live ${pins.environment}; independently attest Neon project/branch/endpoint before every SQL connection.`;
  lines.splice(
    2,
    0,
    `-- Pins: project=${pins.projectId} branch=${pins.branchId} branch_name=${pins.branchName} endpoint=${pins.endpointId} host=${pins.host} database=${pins.database} installer=${pins.installer}`,
  );
  return lines.join('\n');
}

/** Offline review artifact for live role setup; contains no password values. */
export function makeLiveSetupSql(roles: ProofRoles, pins: LivePins): string {
  validateLivePins(pins);
  if (roles.installer !== pins.installer) throw new Error('Live installer pin mismatch');
  return [
    `-- Live ${pins.environment} role setup. Purpose: ${pins.purpose}.`,
    `-- Pins: project=${pins.projectId} branch=${pins.branchId} branch_name=${pins.branchName} endpoint=${pins.endpointId} host=${pins.host} database=${pins.database} installer=${pins.installer}`,
    `-- Roles: app=${roles.app} cli=${roles.cli} owner=${roles.owner} installer=${roles.installer}`,
    `-- APP non-CMS grants: public.${SHOP_TABLES.join(', public.')} SELECT,INSERT,UPDATE,DELETE; CLI none.`,
    '-- Password values arrive only as transaction-local parameters; this file contains no secrets.',
    setupSql(roles),
    '',
  ].join('\n');
}

export function validateReviewedLiveSetupSql(
  sql: string,
  hash: string,
  roles: ProofRoles,
  pins: LivePins,
): void {
  if (!/^[0-9a-f]{64}$/.test(hash) || createHash('sha256').update(sql).digest('hex') !== hash)
    throw new Error('Live setup SQL SHA-256 mismatch');
  if (sql !== makeLiveSetupSql(roles, pins))
    throw new Error('Live setup SQL differs from exact regenerated contract');
}

export type ReviewedLiveSql = {
  action: FreezeAction;
  roles: FreezeRoles;
  pins: LivePins;
  sql: string;
  digest: string;
};
export function validateReviewedLiveSql(
  sql: string,
  hash: string,
  expectedPins: LivePins,
): ReviewedLiveSql {
  validateLivePins(expectedPins);
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('Live SQL SHA-256 invalid');
  const digest = createHash('sha256').update(sql).digest('hex');
  if (digest !== hash) throw new Error('Live SQL SHA-256 mismatch');
  const lines = sql.split('\n');
  const head =
    /^-- Generated CMS writer freeze: (install|verify|freeze|unfreeze|uninstall)\. Purpose: (live-(?:staging|production)-writer-freeze)\.$/.exec(
      lines[0] ?? '',
    );
  const role =
    /^-- Roles: app=([a-z_][a-z0-9_]{0,62}) cli=([a-z_][a-z0-9_]{0,62}) owner=([a-z_][a-z0-9_]{0,62}) installer=([a-z_][a-z0-9_]{0,62}) source_owner=([a-z_][a-z0-9_]{0,62})$/.exec(
      lines[3] ?? '',
    );
  const trusted =
    /^-- Trusted platform roles: (none|[a-z_][a-z0-9_]{0,62}(?:, [a-z_][a-z0-9_]{0,62})*)$/.exec(
      lines[4] ?? '',
    );
  if (
    !head ||
    !role ||
    !trusted ||
    head[2] !== expectedPins.purpose ||
    !FREEZE_ACTIONS.includes(head[1] as FreezeAction)
  )
    throw new Error('Live SQL contract header mismatch');
  const roles: FreezeRoles = {
    app: role[1],
    cli: role[2],
    owner: role[3],
    installer: role[4],
    sourceOwner: role[5],
    trustedPlatformRoles: trusted[1] === 'none' ? [] : trusted[1].split(', '),
  };
  let regenerated: string;
  try {
    regenerated = makeLiveFreezeSql(head[1] as FreezeAction, roles, expectedPins);
  } catch {
    throw new Error('Live SQL contract invalid');
  }
  if (sql !== regenerated) throw new Error('Live SQL differs from exact regenerated transaction');
  return { action: head[1] as FreezeAction, roles, pins: expectedPins, sql, digest };
}

type ApiResponse = { branch?: Record<string, unknown>; endpoint?: Record<string, unknown> };
export async function attestNeonBranch(
  pins: LivePins,
  apiKey: string,
  request: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<void> {
  validateLivePins(pins);
  if (!apiKey || /^op:\/\//i.test(apiKey) || /[\r\n]/.test(apiKey))
    throw new Error('Resolved NEON_API_KEY required');
  const root = `https://console.neon.tech/api/v2/projects/${pins.projectId}`;
  const get = async (path: string): Promise<ApiResponse> => {
    let response: Response;
    try {
      response = await request(`${root}${path}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error('Neon control-plane read failed');
    }
    if (!response.ok) throw new Error('Neon control-plane read failed');
    try {
      return (await response.json()) as ApiResponse;
    } catch {
      throw new Error('Neon control-plane response invalid');
    }
  };
  // Two independent read-only resources. Never infer branch identity from a connection URL or SQL.
  const branch = (await get(`/branches/${pins.branchId}`)).branch;
  const endpoint = (await get(`/endpoints/${pins.endpointId}`)).endpoint;
  if (
    !branch ||
    branch.id !== pins.branchId ||
    branch.project_id !== pins.projectId ||
    branch.name !== pins.branchName ||
    branch.current_state !== 'ready' ||
    !endpoint ||
    endpoint.id !== pins.endpointId ||
    endpoint.project_id !== pins.projectId ||
    endpoint.branch_id !== pins.branchId ||
    endpoint.host !== pins.host ||
    endpoint.type !== 'read_write' ||
    endpoint.disabled !== false ||
    !['active', 'idle'].includes(String(endpoint.current_state))
  ) {
    throw new Error('Neon control-plane branch→endpoint identity mismatch');
  }
}
