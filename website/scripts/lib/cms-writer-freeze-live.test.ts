import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  attestNeonBranch,
  makeLiveFreezeSql,
  makeLiveSetupSql,
  validateLivePins,
  validateReviewedLiveSql,
  validateReviewedLiveSetupSql,
  type LivePins,
} from './cms-writer-freeze-live.mjs';
import { makeFreezeSql, type FreezeRoles } from './cms-writer-freeze-sql.mjs';

const pins: LivePins = {
  environment: 'staging',
  purpose: 'live-staging-writer-freeze',
  projectId: 'gentle-frost-06624287',
  branchId: 'br-rough-smoke-a2fzlwrv',
  branchName: 'Staging',
  endpointId: 'ep-solitary-rain-a2kchckw',
  host: 'ep-solitary-rain-a2kchckw.eu-central-1.aws.neon.tech',
  database: 'neondb',
  installer: 'neondb_owner',
};
const roles: FreezeRoles = {
  app: 'cms_live_app',
  cli: 'cms_live_cli',
  owner: 'cms_live_owner',
  installer: 'neondb_owner',
  sourceOwner: 'neondb_owner',
  trustedPlatformRoles: ['cloud_admin', 'neon_service'],
};
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('live writer-freeze contract', () => {
  it('rejects environment/purpose mismatch and pooler or mismatched endpoint pins', () => {
    expect(() => validateLivePins({ ...pins, purpose: 'disposable-branch-proof' })).toThrow();
    expect(() => validateLivePins({ ...pins, environment: 'production' })).toThrow();
    expect(() => validateLivePins({ ...pins, branchName: 'production' })).toThrow();
    expect(() =>
      validateLivePins({
        ...pins,
        host: 'ep-solitary-rain-a2kchckw-pooler.eu-central-1.aws.neon.tech',
      }),
    ).toThrow();
    expect(() => validateLivePins({ ...pins, endpointId: 'ep-other-123456' })).toThrow();
    expect(() => validateLivePins({ ...pins, projectId: 'another-project-123' })).toThrow();
    expect(() => validateLivePins({ ...pins, branchId: 'br-other-123456' })).toThrow();
    expect(() =>
      validateLivePins({ ...pins, host: 'ep-solitary-rain-a2kchckw.us-east-2.aws.neon.tech' }),
    ).toThrow();
    expect(() =>
      validateLivePins({
        ...pins,
        environment: 'production',
        purpose: 'live-production-writer-freeze',
        branchName: 'production',
      }),
    ).toThrow();
    expect(() =>
      validateLivePins({
        ...pins,
        environment: 'production',
        purpose: 'live-production-writer-freeze',
        branchId: 'br-soft-forest-a2wbxtb1',
        branchName: 'production',
        endpointId: 'ep-wispy-frost-a2hudbl7',
        host: 'ep-wispy-frost-a2hudbl7.eu-central-1.aws.neon.tech',
      }),
    ).not.toThrow();
  });
  it('regenerates every statement while binding environment and all pins into the hash', () => {
    const sql = makeLiveFreezeSql('install', roles, pins);
    expect(validateReviewedLiveSql(sql, sha(sql), pins).action).toBe('install');
    const proof = makeFreezeSql('install', roles, 'disposable-branch-proof');
    expect(sql.slice(sql.indexOf('BEGIN;'))).toBe(proof.slice(proof.indexOf('BEGIN;')));
    expect(() =>
      validateReviewedLiveSql(sql, sha(sql), { ...pins, branchId: 'br-other-123456' }),
    ).toThrow();
    expect(() =>
      validateReviewedLiveSql(sql.replace('lock_timeout', 'statement_timeout'), sha(sql), pins),
    ).toThrow();
    const edited = sql.replace('lock_timeout', 'statement_timeout');
    expect(() => validateReviewedLiveSql(edited, sha(edited), pins)).toThrow();
    expect(() =>
      validateReviewedLiveSql(sql, sha(sql), { ...pins, purpose: 'live-production-writer-freeze' }),
    ).toThrow();
  });
  it('makes a pin-bound, password-free live setup review artifact', () => {
    const setup = makeLiveSetupSql(
      { app: roles.app, cli: roles.cli, owner: roles.owner, installer: roles.installer },
      pins,
    );
    expect(setup).toContain('Purpose: live-staging-writer-freeze');
    expect(setup).toContain('public.users, public.products, public.orders, public.order_items');
    expect(setup).toContain('CREATE ROLE');
    expect(setup).not.toContain('password-value');
    expect(sha(setup)).toMatch(/^[0-9a-f]{64}$/);
    expect(() =>
      validateReviewedLiveSetupSql(
        setup,
        sha(setup),
        { app: roles.app, cli: roles.cli, owner: roles.owner, installer: roles.installer },
        pins,
      ),
    ).not.toThrow();
    expect(() =>
      validateReviewedLiveSetupSql(
        setup,
        sha(setup),
        { app: 'other', cli: roles.cli, owner: roles.owner, installer: roles.installer },
        pins,
      ),
    ).toThrow();
    const tampered = setup.replace('CREATE ROLE', 'DROP ROLE');
    expect(() =>
      validateReviewedLiveSetupSql(
        tampered,
        sha(tampered),
        { app: roles.app, cli: roles.cli, owner: roles.owner, installer: roles.installer },
        pins,
      ),
    ).toThrow();
    expect(() =>
      makeLiveSetupSql(
        { app: roles.app, cli: roles.cli, owner: roles.owner, installer: 'other' },
        pins,
      ),
    ).toThrow();
  });
  it('requires two read-only API resources to match the pinned project, branch and endpoint', async () => {
    const paths: string[] = [];
    const request = async (url: string, init: RequestInit) => {
      expect(init.method).toBe('GET');
      expect(init.redirect).toBe('error');
      paths.push(url);
      return response(
        url.endsWith(`/branches/${pins.branchId}`)
          ? {
              branch: {
                id: pins.branchId,
                project_id: pins.projectId,
                name: pins.branchName,
                current_state: 'ready',
              },
            }
          : {
              endpoint: {
                id: pins.endpointId,
                project_id: pins.projectId,
                branch_id: pins.branchId,
                host: pins.host,
                type: 'read_write',
                current_state: 'idle',
                disabled: false,
              },
            },
      );
    };
    await expect(attestNeonBranch(pins, 'test-key', request)).resolves.toBeUndefined();
    expect(paths).toEqual([
      `https://console.neon.tech/api/v2/projects/${pins.projectId}/branches/${pins.branchId}`,
      `https://console.neon.tech/api/v2/projects/${pins.projectId}/endpoints/${pins.endpointId}`,
    ]);
  });
  it('fails closed on wrong branch, endpoint host or missing API key', async () => {
    const wrong = async (url: string) =>
      response(
        url.includes('/branches/')
          ? {
              branch: {
                id: pins.branchId,
                project_id: pins.projectId,
                name: pins.branchName,
                current_state: 'ready',
              },
            }
          : {
              endpoint: {
                id: pins.endpointId,
                project_id: pins.projectId,
                branch_id: 'br-other-123456',
                host: pins.host,
                type: 'read_write',
                current_state: 'active',
                disabled: false,
              },
            },
      );
    await expect(attestNeonBranch(pins, 'test-key', wrong)).rejects.toThrow('identity mismatch');
    await expect(attestNeonBranch(pins, 'op://vault/key', wrong)).rejects.toThrow();
    const wrongHost = async (url: string) =>
      response(
        url.includes('/branches/')
          ? {
              branch: {
                id: pins.branchId,
                project_id: pins.projectId,
                name: pins.branchName,
                current_state: 'ready',
              },
            }
          : {
              endpoint: {
                id: pins.endpointId,
                project_id: pins.projectId,
                branch_id: pins.branchId,
                host: 'ep-other.eu-central-1.aws.neon.tech',
                type: 'read_write',
                current_state: 'active',
                disabled: false,
              },
            },
      );
    await expect(attestNeonBranch(pins, 'test-key', wrongHost)).rejects.toThrow(
      'identity mismatch',
    );
  });
});
