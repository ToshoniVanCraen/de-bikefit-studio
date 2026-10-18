import { describe, expect, it } from 'vitest';
import {
  STAGING_GATE_HOST,
  isStagingGateHost,
  normalizeHostname,
  resolveStagingGate,
  type GateInput,
} from './config';

const SECRET = 's'.repeat(48);
const HEALTH = 'h'.repeat(48);
const DB = 'postgresql://user:pw@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require';

const valid: GateInput = {
  hostname: STAGING_GATE_HOST,
  vercelEnv: 'preview',
  gitRef: 'staging',
  secret: SECRET,
  healthToken: HEALTH,
  databaseUrl: DB,
};

describe('normalizeHostname', () => {
  it.each([
    ['Staging.DeBikefitStudio.be', STAGING_GATE_HOST],
    ['staging.debikefitstudio.be:443', STAGING_GATE_HOST],
    ['staging.debikefitstudio.be.', STAGING_GATE_HOST],
    ['  STAGING.debikefitstudio.be.:8443 ', STAGING_GATE_HOST],
    ['staging.debikefitstudio.be..', 'staging.debikefitstudio.be.'],
    ['[::1]:3000', '[::1]'],
    ['[::1]', '[::1]'],
    ['localhost:3000', 'localhost'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeHostname(input)).toBe(expected);
  });

  it.each([null, undefined, '', '   ', '.'])('%j → null', (input) => {
    expect(normalizeHostname(input)).toBeNull();
  });
});

describe('isStagingGateHost', () => {
  it.each([
    'staging.debikefitstudio.be',
    'STAGING.DEBIKEFITSTUDIO.BE',
    'staging.debikefitstudio.be:443',
    'staging.debikefitstudio.be.',
  ])('accepts %j', (host) => {
    expect(isStagingGateHost(host)).toBe(true);
  });

  it.each([
    'debikefitstudio.be',
    'www.debikefitstudio.be',
    'x.staging.debikefitstudio.be',
    'staging.debikefitstudio.be.evil.com',
    'staging-debikefitstudio.be',
    'de-bikefit-studio-git-staging-toshoni.vercel.app',
    'de-bikefit-studio-abc123.vercel.app',
    'localhost',
    '[::1]',
    '',
    null,
  ])('rejects %j', (host) => {
    expect(isStagingGateHost(host)).toBe(false);
  });
});

describe('resolveStagingGate', () => {
  it('is active with a complete configuration on the exact host', () => {
    expect(resolveStagingGate(valid)).toEqual({
      kind: 'active',
      config: { secret: SECRET, healthToken: HEALTH, databaseUrl: DB },
    });
  });

  it.each([
    'debikefitstudio.be',
    'www.debikefitstudio.be',
    'de-bikefit-studio-git-staging-toshoni.vercel.app',
    'localhost',
  ])('is inactive on %j whatever the configuration', (hostname) => {
    expect(resolveStagingGate({ ...valid, hostname })).toEqual({ kind: 'inactive' });
    expect(resolveStagingGate({ hostname })).toEqual({ kind: 'inactive' });
  });

  it('names every misconfiguration at once on the staging host', () => {
    expect(resolveStagingGate({ hostname: STAGING_GATE_HOST })).toEqual({
      kind: 'misconfigured',
      reasons: ['vercel_env', 'git_ref', 'secret', 'health_token', 'database_url'],
    });
  });

  it.each<[Partial<GateInput>, string]>([
    [{ vercelEnv: 'production' }, 'vercel_env'],
    [{ vercelEnv: '' }, 'vercel_env'],
    [{ gitRef: 'main' }, 'git_ref'],
    [{ gitRef: 'feat/staging' }, 'git_ref'],
    [{ secret: 's'.repeat(31) }, 'secret'],
    [{ secret: '' }, 'secret'],
    [{ healthToken: 'h'.repeat(31) }, 'health_token'],
    [{ healthToken: null }, 'health_token'],
    [{ healthToken: SECRET }, 'health_token'],
    [{ databaseUrl: 'mysql://x/y' }, 'database_url'],
    [{ databaseUrl: 'postgres://' }, 'database_url'],
    [{ databaseUrl: 'postgres://has space/db' }, 'database_url'],
    [{ databaseUrl: undefined }, 'database_url'],
  ])('%j → misconfigured %s', (patch, reason) => {
    expect(resolveStagingGate({ ...valid, ...patch })).toEqual({
      kind: 'misconfigured',
      reasons: [reason],
    });
  });

  it('accepts postgres:// as well as postgresql://, and exactly 32 characters', () => {
    const result = resolveStagingGate({
      ...valid,
      secret: 'a'.repeat(32),
      healthToken: 'b'.repeat(32),
      databaseUrl: 'postgres://u:p@host/db',
    });
    expect(result.kind).toBe('active');
  });

  it('never puts a value in the reasons', () => {
    const result = resolveStagingGate({ ...valid, secret: 'short-secret', vercelEnv: 'prod' });
    expect(JSON.stringify(result)).not.toContain('short-secret');
    expect(JSON.stringify(result)).not.toContain('prod"');
  });
});
