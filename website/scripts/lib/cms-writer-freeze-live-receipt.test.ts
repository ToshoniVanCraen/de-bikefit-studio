import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LIVE_NEON_TARGETS, type LivePins } from './cms-writer-freeze-live.mjs';
import { validateOperationalHoldReceipt } from './cms-writer-freeze-live-receipt.mjs';

const pins: LivePins = {
  environment: 'staging',
  purpose: 'live-staging-writer-freeze',
  ...LIVE_NEON_TARGETS.staging,
  database: 'neondb',
  installer: 'neondb_owner',
};
const digest = 'a'.repeat(64);
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const ref = (name: string) => ({ ref: `work-blocks/${name}`, sha256: 'b'.repeat(64) });
const now = Date.parse('2026-10-30T12:00:00.000Z');
function receipt(action: 'setup' | 'install' = 'setup') {
  return {
    schema: 'cms-writer-freeze-live-hold/v1',
    gate: 'Gate 1',
    decision: 'GO',
    receiptId: '9a970044-8d6c-44e2-a249-b7355a66fe74',
    issuedAt: '2026-10-30T11:59:00.000Z',
    expiresAt: '2026-10-30T12:10:00.000Z',
    action,
    sqlSha256: digest,
    target: pins,
    operator: 'operator.one',
    reviewer: 'reviewer.two',
    evidence: {
      ingressZeroInvocation: ref('ingress-zero'),
      egressProviderCronDrain: ref('egress-drain'),
      snapshotRestore: ref('snapshot-restore'),
      ...(action === 'install' ? { oldOwnerCredentialRetirement: ref('old-owner-retired') } : {}),
    },
  };
}
function check(
  value: unknown,
  options: {
    action?: 'setup' | 'install';
    pins?: LivePins;
    digest?: string;
    now?: number;
    hash?: string;
  } = {},
) {
  const raw = JSON.stringify(value);
  return validateOperationalHoldReceipt(
    raw,
    options.hash ?? hash(raw),
    options.pins ?? pins,
    options.action ?? 'setup',
    options.digest ?? digest,
    options.now ?? now,
  );
}

describe('live write operational hold receipt', () => {
  it('accepts only a fresh, independently hashable setup/install receipt with full evidence refs', () => {
    expect(() => check(receipt())).not.toThrow();
    expect(() => check(receipt('install'), { action: 'install' })).not.toThrow();
    expect(() => check(receipt(), { hash: 'c'.repeat(64) })).toThrow('SHA-256 mismatch');
    expect(() => check(receipt(), { digest: 'c'.repeat(64) })).toThrow();
    expect(() => check(receipt(), { action: 'install' })).toThrow();
    expect(() => check(receipt('install'))).toThrow();
    expect(() => check(receipt(), { pins: { ...pins, database: 'another' } })).toThrow();
  });
  it('rejects stale, expired, future, and overlong approvals', () => {
    expect(() => check(receipt(), { now: now + 6 * 60_000 })).toThrow();
    expect(() => check(receipt(), { now: now + 11 * 60_000 })).toThrow();
    expect(() => check(receipt(), { now: now - 2 * 60_000 })).toThrow();
    expect(() => check({ ...receipt(), expiresAt: '2026-10-30T12:20:00.000Z' })).toThrow();
  });
  it('rejects missing evidence, forged reviewer equality, extra fields, and unsafe refs', () => {
    const base = receipt('install');
    const withoutRetirement = { ...base.evidence };
    delete withoutRetirement.oldOwnerCredentialRetirement;
    expect(() => check({ ...base, evidence: withoutRetirement }, { action: 'install' })).toThrow();
    expect(() => check({ ...receipt(), reviewer: 'operator.one' })).toThrow();
    expect(() => check({ ...receipt(), approved: true })).toThrow();
    expect(() => check({ ...receipt(), decision: 'HOLD' })).toThrow();
    expect(() =>
      check({
        ...receipt(),
        evidence: {
          ...receipt().evidence,
          ingressZeroInvocation: {
            ref: 'https://user:password@example.com',
            sha256: 'b'.repeat(64),
          },
        },
      }),
    ).toThrow();
    expect(() =>
      check({
        ...receipt(),
        evidence: {
          ...receipt().evidence,
          snapshotRestore: { ref: 'work-blocks/snapshot', sha256: 'invalid' },
        },
      }),
    ).toThrow();
  });
});
